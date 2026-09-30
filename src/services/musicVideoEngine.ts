import { FFmpeg } from '@ffmpeg/ffmpeg';
import { musicVideoCommand, validateMusicVideoFiles } from './musicVideoCommand';

/** Each conversion owns a worker so cancellation and completion release all WASM memory. */
export async function createMusicVideo(
  image: File,
  audio: File,
  onStatus: (status: string) => void,
  signal: AbortSignal,
): Promise<Blob> {
  validateMusicVideoFiles(image, audio);
  const ffmpeg = new FFmpeg();
  const cancel = () => ffmpeg.terminate();
  signal.throwIfAborted();
  signal.addEventListener('abort', cancel, { once: true });
  let lastLog = '';
  try {
    onStatus('Loading video engine (about 32 MB on first use)…');
    ffmpeg.on('log', ({ message }) => { lastLog = message; });
    ffmpeg.on('progress', ({ time }) => {
      onStatus(`Converting your full song… ${Math.max(0, time / 1_000_000).toFixed(0)} seconds encoded`);
    });
    await ffmpeg.load({
      coreURL: new URL(`${(import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL}video-engine/ffmpeg-core.js`, location.origin).href,
      wasmURL: new URL(`${(import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL}video-engine/ffmpeg-core.wasm`, location.origin).href,
    });
    signal.throwIfAborted();
    const imageName = /\.png$/i.test(image.name) ? 'cover.png' : 'cover.jpg';
    const audioName = /\.wav$/i.test(audio.name) ? 'audio.wav' : 'audio.mp3';
    onStatus('Preparing image and audio…');
    await ffmpeg.writeFile(imageName, new Uint8Array(await image.arrayBuffer()));
    await ffmpeg.writeFile(audioName, new Uint8Array(await audio.arrayBuffer()));
    signal.throwIfAborted();
    onStatus('Converting your full song…');
    const code = await ffmpeg.exec(musicVideoCommand(imageName, audioName));
    if (code !== 0) throw new Error(`Conversion failed. Check that your image and audio open correctly. ${lastLog}`);
    const data = await ffmpeg.readFile('output.mp4');
    if (typeof data === 'string' || !data.length) throw new Error('The conversion did not produce a video.');
    return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
  } finally {
    signal.removeEventListener('abort', cancel);
    ffmpeg.terminate();
  }
}

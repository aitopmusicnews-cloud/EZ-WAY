export function musicVideoCommand(image: string, audio: string): string[] {
  return [
    '-loop', '1', '-framerate', '24', '-i', image, '-i', audio,
    '-map', '0:v:0', '-map', '1:a:0',
    // Preserve the complete artwork; cap resolution and make dimensions H.264-safe.
    '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', 'output.mp4',
  ];
}

export function validateMusicVideoFiles(image: File, audio: File): void {
  if (!/\.(jpe?g|png)$/i.test(image.name)) throw new Error('Choose a JPG or PNG image.');
  if (!/\.(mp3|wav)$/i.test(audio.name)) throw new Error('Choose an MP3 or WAV audio file.');
  if (!image.size || !audio.size) throw new Error('The selected files must not be empty.');
  if (image.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  if (audio.size > 250 * 1024 * 1024) throw new Error('Choose an audio file smaller than 250 MB.');
}

export function musicVideoFilename(name: string): string {
  return (name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Music_Video') + '.mp4';
}

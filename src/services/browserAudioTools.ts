import JSZip from 'jszip';
import type { Track } from '../types.ts';
import type { AudioToolAction, AudioToolJobResult, StemMode } from './audioToolTypes.ts';
import { buildLyricsFiles } from './lyricsCore.ts';
import { encodeStereoWav } from './wav.ts';
import { sumStereoStems } from './spleeterCore.ts';
import {
  loadTrackAudioFile,
  refreshTrackAudioSource,
  trackHasUsableAudioSource,
} from './trackAudioSource.ts';

export interface StereoPcm {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

export interface LocalTranscript {
  language?: string | null;
  language_probability?: number | null;
  chunks: Array<{
    text: string;
    timestamp?: [number | null, number | null] | null;
  }>;
}

export interface LocalStemResult {
  vocals: StereoPcm;
  drums: StereoPcm;
  bass: StereoPcm;
  other: StereoPcm;
}

export interface BrowserAudioToolsDependencies {
  refreshSource?: (track: Track) => Promise<Track>;
  loadSourceFile?: (track: Track) => Promise<File>;
  decodeLyrics?: (file: File) => Promise<{ pcm: Float32Array; sampleRate: number }>;
  transcribe?: (
    pcm: Float32Array,
    sampleRate: number,
    onProgress?: (status: string) => void,
  ) => Promise<LocalTranscript>;
  decodeStems?: (file: File) => Promise<StereoPcm>;
  separate?: (
    stereo: StereoPcm,
    onProgress?: (status: string) => void,
  ) => Promise<LocalStemResult>;
  createObjectUrl?: (file: File) => string;
  uploadFile?: (
    category: string,
    relatedId: string,
    file: File,
  ) => Promise<{ url: string; objectKey: string }>;
}

const cleanFilename = (value: string): string => (
  String(value || 'track')
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  || 'track'
);

const audioContextConstructor = () => {
  const scope = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return scope.AudioContext || scope.webkitAudioContext;
};

const resampleBuffer = async (
  channels: Float32Array[],
  sourceRate: number,
  targetRate: number,
): Promise<Float32Array[]> => {
  if (Math.round(sourceRate) === Math.round(targetRate)) {
    return channels.map((channel) => new Float32Array(channel));
  }
  if (typeof OfflineAudioContext === 'undefined') {
    throw new Error('This browser cannot resample audio locally.');
  }
  const duration = channels[0].length / sourceRate;
  const length = Math.max(1, Math.ceil(duration * targetRate));
  const offline = new OfflineAudioContext(channels.length, length, targetRate);
  const buffer = offline.createBuffer(channels.length, channels[0].length, sourceRate);
  channels.forEach((channel, index) => buffer.copyToChannel(channel, index));
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return Array.from({ length: rendered.numberOfChannels }, (_, index) => (
    new Float32Array(rendered.getChannelData(index))
  ));
};

const decodeFile = async (file: File) => {
  const Context = audioContextConstructor();
  if (!Context) throw new Error('Web Audio is not available in this browser.');
  const context = new Context();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => (
      new Float32Array(decoded.getChannelData(index))
    ));
    return { channels, sampleRate: decoded.sampleRate };
  } catch (error) {
    throw new Error(`Could not decode this audio file locally: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close().catch(() => undefined);
  }
};

const defaultDecodeLyrics = async (file: File) => {
  const decoded = await decodeFile(file);
  const mono = new Float32Array(decoded.channels[0].length);
  for (const channel of decoded.channels) {
    for (let index = 0; index < mono.length; index += 1) mono[index] += channel[index] / decoded.channels.length;
  }
  const [pcm] = await resampleBuffer([mono], decoded.sampleRate, 16000);
  return { pcm, sampleRate: 16000 };
};

const defaultDecodeStems = async (file: File): Promise<StereoPcm> => {
  const decoded = await decodeFile(file);
  const left = decoded.channels[0];
  const right = decoded.channels[1] || decoded.channels[0];
  const [resampledLeft, resampledRight] = await resampleBuffer(
    [left, right],
    decoded.sampleRate,
    44100,
  );
  return { left: resampledLeft, right: resampledRight, sampleRate: 44100 };
};

const defaultTranscribe = async (
  pcm: Float32Array,
  sampleRate: number,
  onProgress?: (status: string) => void,
): Promise<LocalTranscript> => {
  const { transcribePcmLocally } = await import('./lyricsWorkerClient.ts');
  return transcribePcmLocally(pcm, sampleRate, onProgress);
};

const defaultSeparate = async (
  stereo: StereoPcm,
  onProgress?: (status: string) => void,
): Promise<LocalStemResult> => {
  const { separatePcmLocally } = await import('./stemsWorkerClient.ts');
  return separatePcmLocally(stereo, onProgress);
};

const localObjectUrl = (file: File): string => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot create local download URLs.');
  }
  return URL.createObjectURL(file);
};

const resolveDefaultUploader = async (): Promise<BrowserAudioToolsDependencies['uploadFile']> => {
  try {
    const { dataStore } = await import('./dataStore.ts');
    return dataStore.configured ? dataStore.uploadFile : undefined;
  } catch {
    return undefined;
  }
};

const persistOrKeepLocal = async (
  files: Record<string, { file: File; localUrl: string; category: string }>,
  relatedId: string,
  uploadFile?: BrowserAudioToolsDependencies['uploadFile'],
) => {
  if (!uploadFile) {
    return {
      urls: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, value.localUrl])),
      warning: undefined as string | undefined,
    };
  }
  try {
    const entries = await Promise.all(Object.entries(files).map(async ([key, value]) => {
      const uploaded = await uploadFile(value.category, relatedId, value.file);
      return [key, uploaded.url] as const;
    }));
    return { urls: Object.fromEntries(entries), warning: undefined as string | undefined };
  } catch (error) {
    return {
      urls: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, value.localUrl])),
      warning: `Processing completed locally, but cloud save failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const createOutputFile = (blob: Blob, filename: string, type: string): File => (
  new File([blob], filename, { type })
);

export async function runLocalAudioTool(
  track: Track,
  action: Exclude<AudioToolAction, 'analysis'>,
  mode?: StemMode,
  onProgress?: (status: string) => void,
  dependencies: BrowserAudioToolsDependencies = {},
): Promise<AudioToolJobResult> {
  const refreshSource = dependencies.refreshSource || refreshTrackAudioSource;
  const sourceTrack = await refreshSource(track);
  if (!trackHasUsableAudioSource(sourceTrack)) {
    throw new Error('Audio Tools requires an available local or cloud audio source.');
  }

  onProgress?.('Loading source audio locally…');
  const loadSourceFile = dependencies.loadSourceFile || loadTrackAudioFile;
  const sourceFile = await loadSourceFile(sourceTrack);
  const createObjectUrl = dependencies.createObjectUrl || localObjectUrl;
  const requestedUploader = dependencies.uploadFile === undefined
    ? await resolveDefaultUploader()
    : dependencies.uploadFile;
  const baseName = cleanFilename(sourceTrack.name);

  if (action === 'lyrics') {
    onProgress?.('Decoding audio for local transcription…');
    const decodeLyrics = dependencies.decodeLyrics || defaultDecodeLyrics;
    const { pcm, sampleRate } = await decodeLyrics(sourceFile);
    onProgress?.('Transcribing locally…');
    const transcribe = dependencies.transcribe || defaultTranscribe;
    const transcript = await transcribe(pcm, sampleRate, onProgress);
    onProgress?.('Building synced lyrics…');
    const built = buildLyricsFiles(transcript.chunks || []);
    if (!built.lyrics.trim()) {
      throw new Error('No reliable lyrics were detected. Existing lyrics were left unchanged.');
    }

    const lrcFile = createOutputFile(new Blob([`${built.lyrics}\n`], { type: 'text/plain' }), `${baseName}.lrc`, 'text/plain');
    const plainFile = createOutputFile(new Blob([`${built.plain}\n`], { type: 'text/plain' }), `${baseName}-lyrics.txt`, 'text/plain');
    const localFiles = {
      lrc: { file: lrcFile, localUrl: createObjectUrl(lrcFile), category: 'audio-tools-text' },
      plain: { file: plainFile, localUrl: createObjectUrl(plainFile), category: 'audio-tools-text' },
    };
    onProgress?.('Saving lyric files…');
    const persisted = await persistOrKeepLocal(localFiles, sourceTrack.id, requestedUploader);
    return {
      status: 'completed',
      action: 'lyrics',
      lyrics: built.lyrics,
      language: transcript.language ?? null,
      language_probability: transcript.language_probability ?? null,
      files: persisted.urls,
      warning: persisted.warning,
    };
  }

  if (action !== 'stems') throw new Error(`Unsupported local Audio Tools action: ${action}`);
  const selectedMode: StemMode = mode || 'vocals_instrumental';
  onProgress?.('Decoding audio for local stem separation…');
  const decodeStems = dependencies.decodeStems || defaultDecodeStems;
  const stereo = await decodeStems(sourceFile);
  onProgress?.('Separating stems locally…');
  const separate = dependencies.separate || defaultSeparate;
  const separated = await separate(stereo, onProgress);

  const requested: Record<string, StereoPcm> = selectedMode === 'full'
    ? {
      vocals: separated.vocals,
      drums: separated.drums,
      bass: separated.bass,
      other: separated.other,
    }
    : {
      vocals: separated.vocals,
      instrumental: sumStereoStems([separated.drums, separated.bass, separated.other]),
    };

  onProgress?.('Encoding WAV files…');
  const outputFiles: Record<string, { file: File; localUrl: string; category: string }> = {};
  for (const [name, stem] of Object.entries(requested)) {
    const blob = encodeStereoWav(stem.left, stem.right, stem.sampleRate);
    const file = createOutputFile(blob, `${baseName}-${name}.wav`, 'audio/wav');
    outputFiles[name] = {
      file,
      localUrl: createObjectUrl(file),
      category: 'audio-tools-audio',
    };
  }

  onProgress?.('Building stem ZIP…');
  const zip = new JSZip();
  for (const [name, output] of Object.entries(outputFiles)) {
    zip.file(`${baseName}-${name}.wav`, await output.file.arrayBuffer());
  }
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const zipFile = createOutputFile(zipBlob, `${baseName}-stems.zip`, 'application/zip');
  const localBundleUrl = createObjectUrl(zipFile);

  onProgress?.('Saving stem files…');
  const persistedStems = await persistOrKeepLocal(outputFiles, sourceTrack.id, requestedUploader);
  let bundleUrl = localBundleUrl;
  let bundleWarning: string | undefined;
  if (requestedUploader) {
    try {
      const uploaded = await requestedUploader('audio-tools-bundle', sourceTrack.id, zipFile);
      bundleUrl = uploaded.url;
    } catch (error) {
      bundleWarning = `Processing completed locally, but cloud save failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return {
    status: 'completed',
    action: 'stems',
    mode: selectedMode,
    files: persistedStems.urls,
    bundle_url: bundleUrl,
    warning: persistedStems.warning || bundleWarning,
  };
}

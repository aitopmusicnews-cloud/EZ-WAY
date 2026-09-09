import type { LocalTranscript } from './browserAudioTools.ts';

export interface WorkerLike {
  onmessage: ((event: MessageEvent<any>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: any, transfer?: Transferable[]): void;
  terminate(): void;
}

interface LyricsWorkerClientOptions {
  workerFactory?: () => WorkerLike;
}

const defaultWorkerFactory = (): WorkerLike => {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers are not available in this browser.');
  }
  return new Worker(new URL('../workers/lyrics.worker.ts', import.meta.url), { type: 'module' });
};

export async function transcribePcmLocally(
  pcm: Float32Array,
  sampleRate: number,
  onProgress?: (status: string) => void,
  options: LyricsWorkerClientOptions = {},
): Promise<LocalTranscript> {
  const worker = (options.workerFactory || defaultWorkerFactory)();
  const id = `lyrics-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = new Float32Array(pcm);

  try {
    return await new Promise<LocalTranscript>((resolve, reject) => {
      const cleanup = () => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };

      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message || 'Local transcription worker failed.'));
      };

      worker.onmessage = (event) => {
        const message = event.data || {};
        if (message.id !== id) return;
        if (message.type === 'progress') {
          if (message.status) onProgress?.(String(message.status));
          return;
        }
        if (message.type === 'error') {
          cleanup();
          reject(new Error(String(message.error || 'Local transcription failed.')));
          return;
        }
        if (message.type === 'result') {
          cleanup();
          resolve(message.result as LocalTranscript);
        }
      };

      worker.postMessage(
        { id, type: 'transcribe', pcm: payload, sampleRate },
        [payload.buffer],
      );
    });
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

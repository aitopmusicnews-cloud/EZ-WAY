import type { LocalStemResult, StereoPcm } from './browserAudioTools.ts';

export interface WorkerLike {
  onmessage: ((event: MessageEvent<any>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: any, transfer?: Transferable[]): void;
  terminate(): void;
}

interface StemsWorkerClientOptions {
  workerFactory?: () => WorkerLike;
}

const defaultWorkerFactory = (): WorkerLike => {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers are not available in this browser.');
  }
  return new Worker(new URL('../workers/stems.worker.ts', import.meta.url), { type: 'module' });
};

export async function separatePcmLocally(
  stereo: StereoPcm,
  onProgress?: (status: string) => void,
  options: StemsWorkerClientOptions = {},
): Promise<LocalStemResult> {
  const worker = (options.workerFactory || defaultWorkerFactory)();
  const id = `stems-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const left = new Float32Array(stereo.left);
  const right = new Float32Array(stereo.right);

  try {
    return await new Promise<LocalStemResult>((resolve, reject) => {
      const cleanup = () => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };

      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message || 'Local stem separation worker failed.'));
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
          reject(new Error(String(message.error || 'Local stem separation failed.')));
          return;
        }
        if (message.type === 'result') {
          cleanup();
          resolve(message.result as LocalStemResult);
        }
      };

      worker.postMessage(
        { id, type: 'separate', left, right, sampleRate: stereo.sampleRate },
        [left.buffer, right.buffer],
      );
    });
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

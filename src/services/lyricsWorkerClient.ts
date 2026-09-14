import type { LocalTranscript, StereoPcm } from './browserAudioTools.ts';

export interface WorkerLike {
  onmessage: ((event: MessageEvent<any>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: any, transfer?: Transferable[]): void;
  terminate(): void;
}

interface LyricsPipelineOptions {
  workerFactory?: () => WorkerLike;
}

const defaultWorkerFactory = (): WorkerLike => {
  if (typeof Worker === 'undefined') throw new Error('Web Workers are not available in this browser.');
  return new Worker(new URL('../workers/lyricsPipeline.worker.ts', import.meta.url), { type: 'module' });
};

/**
 * Runs the full lyrics pipeline (HTDemucs vocal isolation → Whisper transcription)
 * inside a single worker so both models share one WASM heap, avoiding std::bad_alloc.
 */
export async function runLyricsPipelineLocally(
  stereo: StereoPcm,
  onProgress?: (status: string) => void,
  options: LyricsPipelineOptions = {},
): Promise<LocalTranscript> {
  const worker = (options.workerFactory || defaultWorkerFactory)();
  const id = `lyrics-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const left = new Float32Array(stereo.left);
  const right = new Float32Array(stereo.right);

  try {
    return await new Promise<LocalTranscript>((resolve, reject) => {
      const cleanup = () => { worker.onmessage = null; worker.onerror = null; worker.terminate(); };

      worker.onerror = (event) => { cleanup(); reject(new Error(event.message || 'Lyrics pipeline worker failed.')); };

      worker.onmessage = (event) => {
        const msg = event.data || {};
        if (msg.id !== id) return;
        if (msg.type === 'progress') { if (msg.status) onProgress?.(String(msg.status)); return; }
        if (msg.type === 'error') { cleanup(); reject(new Error(String(msg.error || 'Lyrics pipeline failed.'))); return; }
        if (msg.type === 'result') { cleanup(); resolve(msg.result as LocalTranscript); }
      };

      worker.postMessage({ id, type: 'lyrics-pipeline', left, right, sampleRate: stereo.sampleRate }, [left.buffer, right.buffer]);
    });
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

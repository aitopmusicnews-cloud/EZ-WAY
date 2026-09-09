import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { transcribePcmLocally, type WorkerLike } from './lyricsWorkerClient.ts';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<any>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: any[] = [];
  terminated = false;

  postMessage(message: any): void {
    this.posted.push(message);
    queueMicrotask(() => {
      this.onmessage?.({ data: { id: message.id, type: 'progress', status: 'Loading transcription model…' } } as MessageEvent);
      this.onmessage?.({
        data: {
          id: message.id,
          type: 'result',
          result: {
            language: 'en',
            language_probability: 0.98,
            chunks: [{ text: 'Hello', timestamp: [0, 1] }],
          },
        },
      } as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

test('transcribePcmLocally relays progress and resolves timestamped transcript', async () => {
  const worker = new FakeWorker();
  const progress: string[] = [];
  const result = await transcribePcmLocally(
    new Float32Array([0, 0.1, 0]),
    16000,
    (status) => progress.push(status),
    { workerFactory: () => worker },
  );

  assert.equal(worker.posted.length, 1);
  assert.equal(worker.posted[0].type, 'transcribe');
  assert.equal(worker.posted[0].sampleRate, 16000);
  assert.deepEqual(result.chunks, [{ text: 'Hello', timestamp: [0, 1] }]);
  assert.deepEqual(progress, ['Loading transcription model…']);
  assert.equal(worker.terminated, true);
});

test('transcribePcmLocally rejects worker errors and terminates the worker', async () => {
  const worker = new FakeWorker();
  worker.postMessage = function postMessage(message: any) {
    this.posted.push(message);
    queueMicrotask(() => {
      this.onmessage?.({ data: { id: message.id, type: 'error', error: 'model failed' } } as MessageEvent);
    });
  };

  await assert.rejects(
    () => transcribePcmLocally(new Float32Array([0]), 16000, undefined, { workerFactory: () => worker }),
    /model failed/,
  );
  assert.equal(worker.terminated, true);
});

test('lyrics worker self-hosts the Transformers ONNX runtime instead of fetching it from a third-party CDN', () => {
  const workerSource = readFileSync(new URL('../workers/lyrics.worker.ts', import.meta.url), 'utf8');
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts?: Record<string, string> };

  assert.match(workerSource, /import \{ env, pipeline \} from '@huggingface\/transformers';/);
  assert.match(workerSource, /env\.backends\.onnx\.wasm\.wasmPaths = '\/transformers-wasm\/';/);
  assert.equal(packageJson.scripts?.prebuild, 'node scripts/copy-transformers-wasm.mjs');
  assert.equal(packageJson.scripts?.predev, 'node scripts/copy-transformers-wasm.mjs');
});
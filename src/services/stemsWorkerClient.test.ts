import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { separatePcmLocally, type WorkerLike } from './stemsWorkerClient.ts';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<any>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: any[] = [];
  terminated = false;

  postMessage(message: any): void {
    this.posted.push(message);
    const stem = (value: number) => ({
      left: new Float32Array([value, value]),
      right: new Float32Array([value, value]),
      sampleRate: 44100,
    });
    queueMicrotask(() => {
      this.onmessage?.({ data: { id: message.id, type: 'progress', status: 'Separating stems locally…' } } as MessageEvent);
      this.onmessage?.({
        data: {
          id: message.id,
          type: 'result',
          result: {
            vocals: stem(1),
            drums: stem(2),
            bass: stem(3),
            other: stem(4),
          },
        },
      } as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

test('separatePcmLocally relays progress and resolves four stems', async () => {
  const worker = new FakeWorker();
  const progress: string[] = [];
  const result = await separatePcmLocally(
    {
      left: new Float32Array([0, 0.1]),
      right: new Float32Array([0, 0.1]),
      sampleRate: 44100,
    },
    (status) => progress.push(status),
    { workerFactory: () => worker },
  );

  assert.equal(worker.posted.length, 1);
  assert.equal(worker.posted[0].type, 'separate');
  assert.equal(worker.posted[0].sampleRate, 44100);
  assert.deepEqual(Object.keys(result).sort(), ['bass', 'drums', 'other', 'vocals']);
  assert.deepEqual(progress, ['Separating stems locally…']);
  assert.equal(worker.terminated, true);
});

test('separatePcmLocally rejects worker errors and terminates the worker', async () => {
  const worker = new FakeWorker();
  worker.postMessage = function postMessage(message: any) {
    this.posted.push(message);
    queueMicrotask(() => {
      this.onmessage?.({ data: { id: message.id, type: 'error', error: 'separation failed' } } as MessageEvent);
    });
  };

  await assert.rejects(
    () => separatePcmLocally(
      { left: new Float32Array([0]), right: new Float32Array([0]), sampleRate: 44100 },
      undefined,
      { workerFactory: () => worker },
    ),
    /separation failed/,
  );
  assert.equal(worker.terminated, true);
});

test('stem worker uses the HTDemucs model publisher supported WASM browser runtime', () => {
  const workerSource = readFileSync(new URL('../workers/stems.worker.ts', import.meta.url), 'utf8');

  assert.match(workerSource, /from ['"]onnxruntime-web['"]/);
  assert.doesNotMatch(workerSource, /onnxruntime-web\/webgpu/);
  assert.match(workerSource, /StemSplitio\/htdemucs-onnx/);
  assert.match(workerSource, /htdemucs_fp16weights\.onnx/);
  assert.match(workerSource, /executionProviders:\s*\[['"]wasm['"]\]/);
  assert.doesNotMatch(workerSource, /executionProviders:\s*\[['"]webgpu['"]\]/);
  assert.doesNotMatch(workerSource, /requestAdapter\(\)/);
  assert.match(workerSource, /run\(\{\s*mix:/);
  assert.match(workerSource, /result\.stems/);
  assert.doesNotMatch(workerSource, /spleeter-4stems-onnx/);
});

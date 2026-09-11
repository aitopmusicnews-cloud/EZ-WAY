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

test('lyrics worker verifies a real WebGPU adapter before selecting the WebGPU backend', () => {
  const workerSource = readFileSync(new URL('../workers/lyrics.worker.ts', import.meta.url), 'utf8');
  const adapterProbeIndex = workerSource.indexOf('requestAdapter()');
  const webGpuDeviceIndex = workerSource.indexOf("device: 'webgpu'");

  assert.ok(adapterProbeIndex >= 0, 'worker should probe navigator.gpu.requestAdapter()');
  assert.ok(webGpuDeviceIndex > adapterProbeIndex, 'WebGPU should only be selected after adapter probing');
  assert.doesNotMatch(
    workerSource,
    /const hasWebGpu = Boolean\(\(self\.navigator as any\)\?\.gpu\)/,
    'navigator.gpu presence alone is not proof that WebGPU is usable',
  );
});

test('lyrics worker uses non-quantized fp32 Whisper sessions on the WASM fallback', () => {
  const workerSource = readFileSync(new URL('../workers/lyrics.worker.ts', import.meta.url), 'utf8');
  const wasmStatusIndex = workerSource.indexOf('Loading transcription model with WASM');
  assert.ok(wasmStatusIndex >= 0, 'WASM fallback block should exist');

  const wasmFallback = workerSource.slice(wasmStatusIndex, workerSource.indexOf('})().catch', wasmStatusIndex));
  assert.match(wasmFallback, /encoder_model:\s*'fp32'/, 'WASM encoder should avoid quantized ONNX weights');
  assert.match(wasmFallback, /decoder_model_merged:\s*'fp32'/, 'WASM decoder should avoid quantized ONNX weights');
  assert.doesNotMatch(wasmFallback, /dtype:\s*'q4'/, 'WASM fallback must not force a global quantized dtype');
});

test('lyrics worker transcribes isolated vocals in explicit bounded chunks and offsets timestamps', () => {
  const workerSource = readFileSync(new URL('../workers/lyrics.worker.ts', import.meta.url), 'utf8');

  assert.match(workerSource, /WHISPER_CHUNK_SECONDS\s*=\s*30/);
  assert.match(workerSource, /WHISPER_OVERLAP_SECONDS\s*=\s*5/);
  assert.match(workerSource, /pcm\.slice\(startSample,\s*endSample\)/);
  assert.match(workerSource, /Transcribing vocals locally….*\$\{chunkIndex \+ 1\}\/\$\{chunkStarts\.length\}/s);
  assert.match(workerSource, /timestampOffsetSeconds/);
  assert.match(workerSource, /chunkStartSeconds/);
  assert.doesNotMatch(workerSource, /chunk_length_s:\s*30/);
});

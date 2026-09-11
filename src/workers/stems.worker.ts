/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web/webgpu';
import {
  DEMUCS_OVERLAP_SAMPLES,
  DEMUCS_SAMPLE_RATE,
  DEMUCS_SEGMENT_SAMPLES,
  DEMUCS_STEMS,
  DEMUCS_STRIDE_SAMPLES,
  createDemucsWindow,
  extractDemucsStemRows,
  type DemucsStemName,
} from '../services/demucsCore.ts';

const MODEL_URL = 'https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx';
const CHANNELS = 2;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

const post = (message: Record<string, unknown>, transfer?: Transferable[]) => {
  if (transfer?.length) {
    (self as any).postMessage(message, transfer);
  } else {
    self.postMessage(message);
  }
};

const canUseWebGpu = async (): Promise<boolean> => {
  const gpu = (self.navigator as any)?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
};

const createSession = async (id: string): Promise<ort.InferenceSession> => {
  if (await canUseWebGpu()) {
    try {
      post({ id, type: 'progress', status: 'Loading HTDemucs with WebGPU…' });
      return await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['webgpu'] as any,
        graphOptimizationLevel: 'all',
      });
    } catch (error) {
      console.warn('[StemsWorker] HTDemucs WebGPU session failed; falling back to WASM.', error);
    }
  }

  post({ id, type: 'progress', status: 'Loading HTDemucs with WASM…' });
  ort.env.wasm.numThreads = Math.min(Number((self.navigator as any)?.hardwareConcurrency) || 2, 4);
  return ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'] as any,
    graphOptimizationLevel: 'all',
  });
};

const loadSession = async (id: string): Promise<ort.InferenceSession> => {
  if (!sessionPromise) {
    sessionPromise = createSession(id).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
};

const buildChunk = (
  left: Float32Array,
  right: Float32Array,
  start: number,
  end: number,
): Float32Array => {
  const chunk = new Float32Array(CHANNELS * DEMUCS_SEGMENT_SAMPLES);
  const length = Math.max(0, end - start);
  chunk.subarray(0, length).set(left.subarray(start, end));
  chunk.subarray(DEMUCS_SEGMENT_SAMPLES, DEMUCS_SEGMENT_SAMPLES + length).set(right.subarray(start, end));
  return chunk;
};

const getChunkStarts = (sampleCount: number): number[] => {
  const total = Math.max(0, Math.floor(sampleCount));
  if (total <= DEMUCS_SEGMENT_SAMPLES) return [0];
  const starts = [0];
  let next = DEMUCS_STRIDE_SAMPLES;
  while (next + DEMUCS_SEGMENT_SAMPLES < total) {
    starts.push(next);
    next += DEMUCS_STRIDE_SAMPLES;
  }
  starts.push(Math.max(0, total - DEMUCS_SEGMENT_SAMPLES));
  return Array.from(new Set(starts));
};

const separate = async (
  id: string,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
) => {
  if (Math.round(sampleRate) !== DEMUCS_SAMPLE_RATE) {
    throw new Error(`HTDemucs requires 44.1 kHz audio; received ${sampleRate} Hz.`);
  }
  if (!left.length || left.length !== right.length) {
    throw new Error('HTDemucs separation requires matching non-empty stereo channels.');
  }

  const session = await loadSession(id);
  const total = left.length;
  const starts = getChunkStarts(total);
  const baseWindow = createDemucsWindow();
  const weights = new Float32Array(total);
  const outputs = Object.fromEntries(
    DEMUCS_STEMS.map((stem) => [stem, [new Float32Array(total), new Float32Array(total)]]),
  ) as Record<DemucsStemName, [Float32Array, Float32Array]>;

  for (let chunkIndex = 0; chunkIndex < starts.length; chunkIndex += 1) {
    const start = starts[chunkIndex];
    const end = Math.min(start + DEMUCS_SEGMENT_SAMPLES, total);
    const chunkLength = end - start;
    post({
      id,
      type: 'progress',
      status: `Separating with HTDemucs locally… ${chunkIndex + 1}/${starts.length}`,
    });

    const chunk = buildChunk(left, right, start, end);
    const inputTensor = new ort.Tensor('float32', chunk, [1, CHANNELS, DEMUCS_SEGMENT_SAMPLES]);
    const result = await session.run({ mix: inputTensor });
    const outputTensor = result.stems;
    if (!outputTensor) throw new Error('HTDemucs returned no stems tensor.');
    const data = outputTensor.data instanceof Float32Array
      ? outputTensor.data
      : Float32Array.from(outputTensor.data as any);

    for (let stemIndex = 0; stemIndex < DEMUCS_STEMS.length; stemIndex += 1) {
      const rows = extractDemucsStemRows(data, stemIndex, CHANNELS, DEMUCS_SEGMENT_SAMPLES);
      const target = outputs[DEMUCS_STEMS[stemIndex]];
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        for (let localIndex = 0; localIndex < chunkLength; localIndex += 1) {
          let weight = baseWindow[localIndex];
          if (chunkIndex === 0 && localIndex < DEMUCS_OVERLAP_SAMPLES) weight = 1;
          if (
            chunkIndex === starts.length - 1
            && chunkLength === DEMUCS_SEGMENT_SAMPLES
            && localIndex >= DEMUCS_SEGMENT_SAMPLES - DEMUCS_OVERLAP_SAMPLES
          ) {
            weight = 1;
          }
          target[channel][start + localIndex] += rows[channel][localIndex] * weight;
        }
      }
    }

    for (let localIndex = 0; localIndex < chunkLength; localIndex += 1) {
      let weight = baseWindow[localIndex];
      if (chunkIndex === 0 && localIndex < DEMUCS_OVERLAP_SAMPLES) weight = 1;
      if (
        chunkIndex === starts.length - 1
        && chunkLength === DEMUCS_SEGMENT_SAMPLES
        && localIndex >= DEMUCS_SEGMENT_SAMPLES - DEMUCS_OVERLAP_SAMPLES
      ) {
        weight = 1;
      }
      weights[start + localIndex] += weight;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const result = {} as Record<DemucsStemName, { left: Float32Array; right: Float32Array; sampleRate: number }>;
  const transfer: Transferable[] = [];
  for (const stem of DEMUCS_STEMS) {
    const [stemLeft, stemRight] = outputs[stem];
    for (let index = 0; index < total; index += 1) {
      const weight = Math.max(weights[index], 1e-8);
      stemLeft[index] /= weight;
      stemRight[index] /= weight;
    }
    result[stem] = { left: stemLeft, right: stemRight, sampleRate: DEMUCS_SAMPLE_RATE };
    transfer.push(stemLeft.buffer, stemRight.buffer);
  }

  post({ id, type: 'result', result }, transfer);
};

self.onmessage = async (event: MessageEvent) => {
  const message = event.data || {};
  if (message.type !== 'separate') return;
  const id = String(message.id || '');

  try {
    const left = message.left instanceof Float32Array
      ? message.left
      : new Float32Array(message.left || []);
    const right = message.right instanceof Float32Array
      ? message.right
      : new Float32Array(message.right || []);
    const sampleRate = Number(message.sampleRate) || DEMUCS_SAMPLE_RATE;
    await separate(id, left, right, sampleRate);
  } catch (error) {
    post({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

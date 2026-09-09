/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web/webgpu';
import { fft, ifft } from 'fourier-transform';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
const HOP = 1024;
const MODEL_BINS = 1024;
const FULL_BINS = FFT_SIZE / 2 + 1;
const FRAMES_PER_SPLIT = 512;
const PAD = FFT_SIZE - HOP;
const EPSILON = 1e-10;
const STEMS = ['vocals', 'drums', 'bass', 'other'] as const;
const MODEL_ROOT = 'https://huggingface.co/Best-Practice/spleeter-4stems-onnx/resolve/main';

type StemName = typeof STEMS[number];
type SessionMap = Record<StemName, ort.InferenceSession>;

let sessionsPromise: Promise<SessionMap> | null = null;

const post = (message: Record<string, unknown>, transfer?: Transferable[]) => {
  if (transfer?.length) {
    (self as any).postMessage(message, transfer);
  } else {
    self.postMessage(message);
  }
};

const makeWindow = (): Float32Array => {
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  }
  return window;
};

const WINDOW = makeWindow();

const createSession = async (url: string): Promise<ort.InferenceSession> => {
  const hasWebGpu = Boolean((self.navigator as any)?.gpu);
  if (hasWebGpu) {
    try {
      return await ort.InferenceSession.create(url, { executionProviders: ['webgpu'] as any });
    } catch (error) {
      console.warn('[StemsWorker] WebGPU session failed; falling back to WASM.', error);
    }
  }
  return ort.InferenceSession.create(url, { executionProviders: ['wasm'] as any });
};

const loadSessions = async (id: string): Promise<SessionMap> => {
  if (!sessionsPromise) {
    sessionsPromise = (async () => {
      const loaded = {} as SessionMap;
      for (let index = 0; index < STEMS.length; index += 1) {
        const stem = STEMS[index];
        post({
          id,
          type: 'progress',
          status: `Loading separation model… ${index + 1}/${STEMS.length}`,
        });
        loaded[stem] = await createSession(`${MODEL_ROOT}/${stem}.fp16.onnx`);
      }
      return loaded;
    })().catch((error) => {
      sessionsPromise = null;
      throw error;
    });
  }
  return sessionsPromise;
};

interface FrameSpectrum {
  re: Float64Array;
  im: Float64Array;
}

const makeFrameSpectrum = (
  channel: Float32Array,
  frameIndex: number,
): FrameSpectrum => {
  const frame = new Float64Array(FFT_SIZE);
  const sourceStart = frameIndex * HOP - PAD;
  for (let i = 0; i < FFT_SIZE; i += 1) {
    const sourceIndex = sourceStart + i;
    const sample = sourceIndex >= 0 && sourceIndex < channel.length ? channel[sourceIndex] : 0;
    frame[i] = sample * WINDOW[i];
  }
  const [re, im] = fft(frame);
  return { re, im };
};

const buildChunkInput = (
  left: Float32Array,
  right: Float32Array,
  frameStart: number,
  frameCount: number,
): { tensor: ort.Tensor; spectra: FrameSpectrum[][] } => {
  const channels = [left, right];
  const input = new Float32Array(2 * FRAMES_PER_SPLIT * MODEL_BINS);
  const spectra: FrameSpectrum[][] = [[], []];

  for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
    for (let localFrame = 0; localFrame < frameCount; localFrame += 1) {
      const spectrum = makeFrameSpectrum(channels[channelIndex], frameStart + localFrame);
      spectra[channelIndex].push(spectrum);
      const base = (channelIndex * FRAMES_PER_SPLIT + localFrame) * MODEL_BINS;
      for (let bin = 0; bin < MODEL_BINS; bin += 1) {
        input[base + bin] = Math.hypot(spectrum.re[bin], spectrum.im[bin]);
      }
    }
  }

  return {
    tensor: new ort.Tensor('float32', input, [2, 1, FRAMES_PER_SPLIT, MODEL_BINS]),
    spectra,
  };
};

const runStemModels = async (
  sessions: SessionMap,
  tensor: ort.Tensor,
): Promise<Record<StemName, Float32Array>> => {
  const estimates = {} as Record<StemName, Float32Array>;
  for (const stem of STEMS) {
    const output = await sessions[stem].run({ x: tensor });
    const value = output.y || output[sessions[stem].outputNames[0]];
    if (!value) throw new Error(`The ${stem} separation model returned no output.`);
    estimates[stem] = value.data instanceof Float32Array
      ? value.data
      : Float32Array.from(value.data as any);
  }
  return estimates;
};

const addChunkToOutputs = (
  estimates: Record<StemName, Float32Array>,
  spectra: FrameSpectrum[][],
  frameStart: number,
  frameCount: number,
  outputs: Record<StemName, [Float32Array, Float32Array]>,
  weights: Float32Array,
) => {
  for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
    for (let localFrame = 0; localFrame < frameCount; localFrame += 1) {
      const spectrum = spectra[channelIndex][localFrame];
      const modeledMasks = STEMS.map(() => new Float32Array(MODEL_BINS));
      const averageByStem = new Float64Array(STEMS.length);

      for (let bin = 0; bin < MODEL_BINS; bin += 1) {
        let denominator = EPSILON;
        const squared = new Float64Array(STEMS.length);
        for (let stemIndex = 0; stemIndex < STEMS.length; stemIndex += 1) {
          const index = (channelIndex * FRAMES_PER_SPLIT + localFrame) * MODEL_BINS + bin;
          const estimate = Math.max(0, Number(estimates[STEMS[stemIndex]][index]) || 0);
          squared[stemIndex] = estimate * estimate;
          denominator += squared[stemIndex];
        }
        for (let stemIndex = 0; stemIndex < STEMS.length; stemIndex += 1) {
          const mask = (squared[stemIndex] + EPSILON / STEMS.length) / denominator;
          modeledMasks[stemIndex][bin] = mask;
          averageByStem[stemIndex] += mask;
        }
      }
      for (let stemIndex = 0; stemIndex < STEMS.length; stemIndex += 1) {
        averageByStem[stemIndex] /= MODEL_BINS;
      }

      const outputStart = (frameStart + localFrame) * HOP;
      if (channelIndex === 0) {
        for (let i = 0; i < FFT_SIZE; i += 1) {
          weights[outputStart + i] += WINDOW[i] * WINDOW[i];
        }
      }

      for (let stemIndex = 0; stemIndex < STEMS.length; stemIndex += 1) {
        const re = new Float64Array(FULL_BINS);
        const im = new Float64Array(FULL_BINS);
        for (let bin = 0; bin < FULL_BINS; bin += 1) {
          const mask = bin < MODEL_BINS
            ? modeledMasks[stemIndex][bin]
            : averageByStem[stemIndex];
          re[bin] = spectrum.re[bin] * mask;
          im[bin] = spectrum.im[bin] * mask;
        }
        const frame = ifft(re, im);
        const target = outputs[STEMS[stemIndex]][channelIndex];
        for (let i = 0; i < FFT_SIZE; i += 1) {
          target[outputStart + i] += frame[i] * WINDOW[i];
        }
      }
    }
  }
};

const finalizeStem = (
  padded: Float32Array,
  weights: Float32Array,
  sampleCount: number,
): Float32Array => {
  const output = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const paddedIndex = PAD + i;
    const weight = weights[paddedIndex];
    output[i] = weight > 1e-8 ? padded[paddedIndex] / weight : 0;
  }
  return output;
};

const separate = async (
  id: string,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
) => {
  if (Math.round(sampleRate) !== SAMPLE_RATE) {
    throw new Error(`Spleeter requires 44.1 kHz audio; received ${sampleRate} Hz.`);
  }
  if (!left.length || left.length !== right.length) {
    throw new Error('Stem separation requires matching non-empty stereo channels.');
  }

  const sessions = await loadSessions(id);
  const frameCount = Math.ceil((PAD + left.length) / HOP);
  const paddedLength = (frameCount - 1) * HOP + FFT_SIZE;
  const weights = new Float32Array(paddedLength);
  const outputs = Object.fromEntries(
    STEMS.map((stem) => [
      stem,
      [new Float32Array(paddedLength), new Float32Array(paddedLength)] as [Float32Array, Float32Array],
    ]),
  ) as Record<StemName, [Float32Array, Float32Array]>;

  const chunks = Math.ceil(frameCount / FRAMES_PER_SPLIT);
  for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex += 1) {
    const frameStart = chunkIndex * FRAMES_PER_SPLIT;
    const count = Math.min(FRAMES_PER_SPLIT, frameCount - frameStart);
    post({
      id,
      type: 'progress',
      status: `Separating stems locally… ${Math.round((chunkIndex / chunks) * 100)}%`,
    });
    const { tensor, spectra } = buildChunkInput(left, right, frameStart, count);
    const estimates = await runStemModels(sessions, tensor);
    addChunkToOutputs(estimates, spectra, frameStart, count, outputs, weights);
  }

  const result: Record<StemName, { left: Float32Array; right: Float32Array; sampleRate: number }> = {} as any;
  const transfer: Transferable[] = [];
  for (const stem of STEMS) {
    const stemLeft = finalizeStem(outputs[stem][0], weights, left.length);
    const stemRight = finalizeStem(outputs[stem][1], weights, left.length);
    result[stem] = { left: stemLeft, right: stemRight, sampleRate: SAMPLE_RATE };
    transfer.push(stemLeft.buffer, stemRight.buffer);
  }

  post({ id, type: 'result', result }, transfer);
};

self.onmessage = async (event: MessageEvent) => {
  const message = event.data || {};
  if (message.type !== 'separate') return;
  const id = String(message.id || '');
  try {
    const left = message.left instanceof Float32Array ? message.left : new Float32Array(message.left || []);
    const right = message.right instanceof Float32Array ? message.right : new Float32Array(message.right || []);
    await separate(id, left, right, Number(message.sampleRate));
  } catch (error) {
    post({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

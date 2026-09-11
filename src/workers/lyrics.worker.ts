/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers';

env.backends.onnx.wasm.wasmPaths = '/transformers-wasm/';

const MODEL_ID = 'onnx-community/whisper-tiny';
const WHISPER_CHUNK_SECONDS = 30;
const WHISPER_OVERLAP_SECONDS = 5;

type AsrPipeline = Awaited<ReturnType<typeof pipeline>>;

let transcriberPromise: Promise<AsrPipeline> | null = null;

const post = (message: Record<string, unknown>) => {
  self.postMessage(message);
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

const loadTranscriber = async (id: string): Promise<AsrPipeline> => {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const progress_callback = (progress: any) => {
        if (progress?.status === 'progress' && typeof progress?.progress === 'number') {
          post({
            id,
            type: 'progress',
            status: `Loading transcription model… ${Math.round(progress.progress)}%`,
          });
        }
      };

      if (await canUseWebGpu()) {
        try {
          post({ id, type: 'progress', status: 'Loading transcription model with WebGPU…' });
          return await pipeline('automatic-speech-recognition', MODEL_ID, {
            device: 'webgpu',
            progress_callback,
          });
        } catch (error) {
          console.warn('[LyricsWorker] WebGPU model load failed; falling back to WASM.', error);
        }
      }

      post({ id, type: 'progress', status: 'Loading transcription model with WASM…' });
      return pipeline('automatic-speech-recognition', MODEL_ID, {
        device: 'wasm',
        dtype: {
          encoder_model: 'fp32',
          decoder_model_merged: 'fp32',
        },
        progress_callback,
      });
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
};

const createChunkStarts = (sampleCount: number, sampleRate: number): number[] => {
  const chunkSamples = Math.max(1, Math.round(WHISPER_CHUNK_SECONDS * sampleRate));
  const overlapSamples = Math.max(0, Math.round(WHISPER_OVERLAP_SECONDS * sampleRate));
  const strideSamples = Math.max(1, chunkSamples - overlapSamples);
  if (sampleCount <= chunkSamples) return [0];

  const starts = [0];
  let next = strideSamples;
  while (next + chunkSamples < sampleCount) {
    starts.push(next);
    next += strideSamples;
  }
  starts.push(Math.max(0, sampleCount - chunkSamples));
  return Array.from(new Set(starts));
};

const transcribeInChunks = async (
  id: string,
  transcriber: AsrPipeline,
  pcm: Float32Array,
  sampleRate: number,
) => {
  const chunkSamples = Math.max(1, Math.round(WHISPER_CHUNK_SECONDS * sampleRate));
  const halfOverlapSeconds = WHISPER_OVERLAP_SECONDS / 2;
  const chunkStarts = createChunkStarts(pcm.length, sampleRate);
  const chunks: Array<{
    text: string;
    timestamp: [number | null, number | null];
  }> = [];
  let language: string | null = null;
  let languageProbability: number | null = null;
  let previousFallbackText = '';

  for (let chunkIndex = 0; chunkIndex < chunkStarts.length; chunkIndex += 1) {
    const startSample = chunkStarts[chunkIndex];
    const endSample = Math.min(startSample + chunkSamples, pcm.length);
    const audioChunk = pcm.slice(startSample, endSample);
    const chunkStartSeconds = startSample / sampleRate;
    const chunkEndSeconds = endSample / sampleRate;
    const timestampOffsetSeconds = chunkStartSeconds;
    const acceptFrom = chunkIndex === 0 ? Number.NEGATIVE_INFINITY : chunkStartSeconds + halfOverlapSeconds;
    const acceptUntil = chunkIndex === chunkStarts.length - 1
      ? Number.POSITIVE_INFINITY
      : chunkEndSeconds - halfOverlapSeconds;

    post({
      id,
      type: 'progress',
      status: `Transcribing vocals locally… ${chunkIndex + 1}/${chunkStarts.length}`,
    });

    const output: any = await (transcriber as any)(audioChunk, {
      return_timestamps: true,
    });

    if (!language && output?.language) language = String(output.language);
    if (languageProbability === null && Number.isFinite(output?.language_probability)) {
      languageProbability = Number(output.language_probability);
    }

    const rawChunks = Array.isArray(output?.chunks) ? output.chunks : [];
    let acceptedTimestamped = 0;
    for (const rawChunk of rawChunks) {
      const text = String(rawChunk?.text || '').trim();
      if (!text) continue;
      const localStart = Array.isArray(rawChunk?.timestamp) && Number.isFinite(rawChunk.timestamp[0])
        ? Number(rawChunk.timestamp[0])
        : 0;
      const localEnd = Array.isArray(rawChunk?.timestamp) && Number.isFinite(rawChunk.timestamp[1])
        ? Number(rawChunk.timestamp[1])
        : localStart;
      const absoluteStart = Math.max(chunkStartSeconds, timestampOffsetSeconds + localStart);
      const absoluteEnd = Math.min(chunkEndSeconds, timestampOffsetSeconds + localEnd);
      const midpoint = (absoluteStart + absoluteEnd) / 2;
      if (midpoint < acceptFrom || midpoint >= acceptUntil) continue;
      chunks.push({ text, timestamp: [absoluteStart, absoluteEnd] });
      acceptedTimestamped += 1;
    }

    if (!acceptedTimestamped) {
      const fallbackText = String(output?.text || '').trim();
      if (fallbackText && fallbackText !== previousFallbackText) {
        const fallbackStart = Math.max(chunkStartSeconds, Number.isFinite(acceptFrom) ? acceptFrom : chunkStartSeconds);
        const fallbackEnd = Math.min(chunkEndSeconds, Number.isFinite(acceptUntil) ? acceptUntil : chunkEndSeconds);
        chunks.push({ text: fallbackText, timestamp: [fallbackStart, Math.max(fallbackStart, fallbackEnd)] });
        previousFallbackText = fallbackText;
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  chunks.sort((a, b) => Number(a.timestamp[0] || 0) - Number(b.timestamp[0] || 0));
  return {
    language,
    language_probability: languageProbability,
    chunks,
  };
};

self.onmessage = async (event: MessageEvent) => {
  const message = event.data || {};
  if (message.type !== 'transcribe') return;
  const id = String(message.id || '');

  try {
    const pcm = message.pcm instanceof Float32Array
      ? message.pcm
      : new Float32Array(message.pcm || []);
    const sampleRate = Number(message.sampleRate) || 16000;
    if (!pcm.length) throw new Error('No audio samples were provided for transcription.');
    if (Math.round(sampleRate) !== 16000) {
      throw new Error(`Whisper requires 16 kHz PCM; received ${sampleRate} Hz.`);
    }

    const transcriber = await loadTranscriber(id);
    const result = await transcribeInChunks(id, transcriber, pcm, sampleRate);
    post({ id, type: 'result', result });
  } catch (error) {
    post({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

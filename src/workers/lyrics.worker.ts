/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers';

env.backends.onnx.wasm.wasmPaths = '/transformers-wasm/';

const MODEL_ID = 'onnx-community/whisper-tiny';

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
      return pipeline('automatic-speech-recognition', MODEL_ID, { progress_callback });
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
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
    post({ id, type: 'progress', status: 'Transcribing locally…' });

    const output: any = await (transcriber as any)(pcm, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const rawChunks = Array.isArray(output?.chunks) ? output.chunks : [];
    const chunks = rawChunks
      .map((chunk: any) => ({
        text: String(chunk?.text || '').trim(),
        timestamp: Array.isArray(chunk?.timestamp)
          ? [
              Number.isFinite(chunk.timestamp[0]) ? Number(chunk.timestamp[0]) : null,
              Number.isFinite(chunk.timestamp[1]) ? Number(chunk.timestamp[1]) : null,
            ]
          : null,
      }))
      .filter((chunk: any) => chunk.text);

    if (!chunks.length && String(output?.text || '').trim()) {
      chunks.push({
        text: String(output.text).trim(),
        timestamp: [0, pcm.length / sampleRate],
      });
    }

    post({
      id,
      type: 'result',
      result: {
        language: output?.language ?? null,
        language_probability: output?.language_probability ?? null,
        chunks,
      },
    });
  } catch (error) {
    post({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
/// <reference lib="webworker" />

/**
 * Combined HTDemucs + Whisper worker.
 * Running both models in the same worker process means they share one WASM
 * linear-memory heap, avoiding the std::bad_alloc that occurs when a second
 * worker tries to allocate its own heap while the first worker's heap is still
 * resident in the browser process.
 */

import * as ort from 'onnxruntime-web';
import { env, pipeline } from '@huggingface/transformers';
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

// Point Transformers.js at the pre-copied WASM assets
env.backends.onnx.wasm.wasmPaths = '/transformers-wasm/';

const DEMUCS_MODEL_URL = 'https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx';
const WHISPER_MODEL_ID = 'onnx-community/whisper-tiny';
const CHANNELS = 2;
const WHISPER_CHUNK_SECONDS = 30;
const WHISPER_OVERLAP_SECONDS = 5;

type AsrPipeline = Awaited<ReturnType<typeof pipeline>>;

const post = (message: Record<string, unknown>) => self.postMessage(message);

// ── HTDemucs ────────────────────────────────────────────────────────────────

const buildChunk = (left: Float32Array, right: Float32Array, start: number, end: number): Float32Array => {
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
  while (next + DEMUCS_SEGMENT_SAMPLES < total) { starts.push(next); next += DEMUCS_STRIDE_SAMPLES; }
  starts.push(Math.max(0, total - DEMUCS_SEGMENT_SAMPLES));
  return Array.from(new Set(starts));
};

const separateVocals = async (id: string, left: Float32Array, right: Float32Array): Promise<{ vocalLeft: Float32Array; vocalRight: Float32Array }> => {
  post({ id, type: 'progress', status: 'Loading HTDemucs model…' });
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(DEMUCS_MODEL_URL, {
    executionProviders: ['wasm'] as any,
    graphOptimizationLevel: 'all',
  });

  const total = left.length;
  const starts = getChunkStarts(total);
  const baseWindow = createDemucsWindow();
  const weights = new Float32Array(total);
  const outputs = Object.fromEntries(
    DEMUCS_STEMS.map((stem) => [stem, [new Float32Array(total), new Float32Array(total)]]),
  ) as Record<DemucsStemName, [Float32Array, Float32Array]>;

  for (let ci = 0; ci < starts.length; ci++) {
    const start = starts[ci];
    const end = Math.min(start + DEMUCS_SEGMENT_SAMPLES, total);
    const chunkLength = end - start;
    post({ id, type: 'progress', status: `Isolating vocals… ${ci + 1}/${starts.length}` });

    const chunk = buildChunk(left, right, start, end);
    const inputTensor = new ort.Tensor('float32', chunk, [1, CHANNELS, DEMUCS_SEGMENT_SAMPLES]);
    const result = await session.run({ mix: inputTensor });
    const outputTensor = result.stems;
    if (!outputTensor) throw new Error('HTDemucs returned no stems tensor.');
    const data = outputTensor.data instanceof Float32Array ? outputTensor.data : Float32Array.from(outputTensor.data as any);

    for (let si = 0; si < DEMUCS_STEMS.length; si++) {
      const rows = extractDemucsStemRows(data, si, CHANNELS, DEMUCS_SEGMENT_SAMPLES);
      const target = outputs[DEMUCS_STEMS[si]];
      for (let ch = 0; ch < CHANNELS; ch++) {
        for (let li = 0; li < chunkLength; li++) {
          let w = baseWindow[li];
          if (ci === 0 && li < DEMUCS_OVERLAP_SAMPLES) w = 1;
          if (ci === starts.length - 1 && chunkLength === DEMUCS_SEGMENT_SAMPLES && li >= DEMUCS_SEGMENT_SAMPLES - DEMUCS_OVERLAP_SAMPLES) w = 1;
          target[ch][start + li] += rows[ch][li] * w;
        }
      }
    }
    for (let li = 0; li < chunkLength; li++) {
      let w = baseWindow[li];
      if (ci === 0 && li < DEMUCS_OVERLAP_SAMPLES) w = 1;
      if (ci === starts.length - 1 && chunkLength === DEMUCS_SEGMENT_SAMPLES && li >= DEMUCS_SEGMENT_SAMPLES - DEMUCS_OVERLAP_SAMPLES) w = 1;
      weights[start + li] += w;
    }
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  // Normalise and release session
  const [vocalLeft, vocalRight] = outputs['vocals'];
  for (let i = 0; i < total; i++) {
    const w = Math.max(weights[i], 1e-8);
    vocalLeft[i] /= w;
    vocalRight[i] /= w;
  }
  await session.release().catch(() => undefined);

  return { vocalLeft, vocalRight };
};

// ── Resample (OfflineAudioContext not available in worker — use simple linear interpolation) ──

const resampleMono = (pcm: Float32Array, fromRate: number, toRate: number): Float32Array => {
  if (Math.round(fromRate) === Math.round(toRate)) return pcm;
  const ratio = fromRate / toRate;
  const outLen = Math.ceil(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = pcm[idx] ?? 0;
    const b = pcm[idx + 1] ?? a;
    out[i] = a + frac * (b - a);
  }
  return out;
};

// ── Whisper ──────────────────────────────────────────────────────────────────

const canUseWebGpu = async (): Promise<boolean> => {
  const gpu = (self.navigator as any)?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
  try { return Boolean(await gpu.requestAdapter()); } catch { return false; }
};

const transcribeVocals = async (id: string, vocalLeft: Float32Array, vocalRight: Float32Array, sampleRate: number) => {
  // Downmix to mono 16 kHz
  const mono = new Float32Array(vocalLeft.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (vocalLeft[i] + vocalRight[i]) * 0.5;
  const pcm = resampleMono(mono, sampleRate, 16000);

  post({ id, type: 'progress', status: 'Loading Whisper model…' });

  const progress_callback = (p: any) => {
    if (p?.status === 'progress' && typeof p?.progress === 'number') {
      post({ id, type: 'progress', status: `Loading Whisper… ${Math.round(p.progress)}%` });
    }
  };

  let transcriber: AsrPipeline;
  if (await canUseWebGpu()) {
    try {
      post({ id, type: 'progress', status: 'Loading Whisper with WebGPU…' });
      transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, { device: 'webgpu', progress_callback });
    } catch {
      post({ id, type: 'progress', status: 'WebGPU failed, falling back to WASM…' });
      transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, {
        device: 'wasm', dtype: { encoder_model: 'fp32', decoder_model_merged: 'fp32' }, progress_callback,
      });
    }
  } else {
    transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, {
      device: 'wasm', dtype: { encoder_model: 'fp32', decoder_model_merged: 'fp32' }, progress_callback,
    });
  }

  const chunkSamples = Math.round(WHISPER_CHUNK_SECONDS * 16000);
  const overlapSamples = Math.round(WHISPER_OVERLAP_SECONDS * 16000);
  const strideSamples = chunkSamples - overlapSamples;
  const halfOverlap = WHISPER_OVERLAP_SECONDS / 2;

  const starts: number[] = [0];
  let next = strideSamples;
  while (next + chunkSamples < pcm.length) { starts.push(next); next += strideSamples; }
  if (pcm.length > chunkSamples) starts.push(Math.max(0, pcm.length - chunkSamples));
  const uniqueStarts = Array.from(new Set(starts));

  const chunks: Array<{ text: string; timestamp: [number | null, number | null] }> = [];
  let language: string | null = null;
  let languageProbability: number | null = null;
  let prevFallback = '';

  for (let ci = 0; ci < uniqueStarts.length; ci++) {
    const startSample = uniqueStarts[ci];
    const endSample = Math.min(startSample + chunkSamples, pcm.length);
    const chunkStartSec = startSample / 16000;
    const chunkEndSec = endSample / 16000;
    const acceptFrom = ci === 0 ? -Infinity : chunkStartSec + halfOverlap;
    const acceptUntil = ci === uniqueStarts.length - 1 ? Infinity : chunkEndSec - halfOverlap;

    post({ id, type: 'progress', status: `Transcribing… ${ci + 1}/${uniqueStarts.length}` });

    const output: any = await (transcriber as any)(pcm.slice(startSample, endSample), { return_timestamps: true });
    if (!language && output?.language) language = String(output.language);
    if (languageProbability === null && Number.isFinite(output?.language_probability)) languageProbability = Number(output.language_probability);

    const rawChunks = Array.isArray(output?.chunks) ? output.chunks : [];
    let accepted = 0;
    for (const rc of rawChunks) {
      const text = String(rc?.text || '').trim();
      if (!text) continue;
      const ls = Array.isArray(rc?.timestamp) && Number.isFinite(rc.timestamp[0]) ? Number(rc.timestamp[0]) : 0;
      const le = Array.isArray(rc?.timestamp) && Number.isFinite(rc.timestamp[1]) ? Number(rc.timestamp[1]) : ls;
      const absStart = Math.max(chunkStartSec, chunkStartSec + ls);
      const absEnd = Math.min(chunkEndSec, chunkStartSec + le);
      const mid = (absStart + absEnd) / 2;
      if (mid < acceptFrom || mid >= acceptUntil) continue;
      chunks.push({ text, timestamp: [absStart, absEnd] });
      accepted++;
    }
    if (!accepted) {
      const fb = String(output?.text || '').trim();
      if (fb && fb !== prevFallback) {
        const fs = Math.max(chunkStartSec, Number.isFinite(acceptFrom) ? acceptFrom : chunkStartSec);
        const fe = Math.min(chunkEndSec, Number.isFinite(acceptUntil) ? acceptUntil : chunkEndSec);
        chunks.push({ text: fb, timestamp: [fs, Math.max(fs, fe)] });
        prevFallback = fb;
      }
    }
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  chunks.sort((a, b) => Number(a.timestamp[0] ?? 0) - Number(b.timestamp[0] ?? 0));
  return { language, language_probability: languageProbability, chunks };
};

// ── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent) => {
  const message = event.data || {};
  if (message.type !== 'lyrics-pipeline') return;
  const id = String(message.id || '');

  try {
    const left = message.left instanceof Float32Array ? message.left : new Float32Array(message.left || []);
    const right = message.right instanceof Float32Array ? message.right : new Float32Array(message.right || []);
    const sampleRate = Number(message.sampleRate) || DEMUCS_SAMPLE_RATE;

    if (Math.round(sampleRate) !== DEMUCS_SAMPLE_RATE) throw new Error(`HTDemucs requires 44.1 kHz; received ${sampleRate} Hz.`);
    if (!left.length || left.length !== right.length) throw new Error('Invalid stereo audio for lyrics pipeline.');

    const { vocalLeft, vocalRight } = await separateVocals(id, left, right);
    const result = await transcribeVocals(id, vocalLeft, vocalRight, DEMUCS_SAMPLE_RATE);
    post({ id, type: 'result', result });
  } catch (error) {
    post({ id, type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};

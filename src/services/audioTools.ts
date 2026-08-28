import { Track } from '../types';
import {
  buildAnalysisSourceFingerprint,
  type MusicIntelligenceProfile,
} from './musicIntelligenceCore';

export type AudioToolAction = 'analysis' | 'lyrics' | 'stems';
export type StemMode = 'vocals_instrumental' | 'full';

export interface AudioToolJobResult {
  status: 'completed' | 'failed' | 'running' | 'accepted';
  job_id?: string;
  call_id?: string;
  action?: AudioToolAction;
  mode?: StemMode;
  profile?: MusicIntelligenceProfile;
  lyrics?: string;
  files?: Record<string, string>;
  bundle_url?: string;
  language?: string | null;
  language_probability?: number | null;
  error?: unknown;
}

const getBaseUrl = () => {
  const value = String((import.meta as any).env?.VITE_AUDIO_TOOLS_URL || '').trim();
  return value.replace(/\/+$/, '');
};

const stringifyBackendError = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value instanceof Error && value.message) return value.message;

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => stringifyBackendError(item))
      .filter(Boolean);
    if (messages.length) return messages.join('; ');
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const preferred =
      objectValue.message ??
      objectValue.msg ??
      objectValue.detail ??
      objectValue.error ??
      objectValue.reason;

    if (preferred !== undefined && preferred !== value) {
      const nested = stringifyBackendError(preferred);
      if (nested) return nested;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (value !== undefined && value !== null) return String(value);
  return '';
};

const parseError = async (response: Response) => {
  const rawText = await response.text().catch(() => '');
  let body: any = null;

  if (rawText) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = rawText;
    }
  }

  const message = stringifyBackendError(
    body?.detail ?? body?.error ?? body?.message ?? body,
  );

  return message || `Audio Tools returned ${response.status}`;
};

export const audioToolsConfigured = () => Boolean(getBaseUrl());

export async function startAudioToolsJob(
  track: Track,
  action: AudioToolAction,
  mode?: StemMode,
): Promise<AudioToolJobResult> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('AWS Audio Tools is not configured yet. Add VITE_AUDIO_TOOLS_URL after the AWS endpoint is deployed.');
  }

  if (!track.file_url || track.file_url.startsWith('blob:')) {
    throw new Error('This track needs a cloud-accessible source file before Audio Tools can process it.');
  }

  const response = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      mode,
      file_url: track.file_url,
      track_name: track.name,
      track_id: track.id,
      source_fingerprint: buildAnalysisSourceFingerprint(track),
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function pollAudioToolsJob(
  callId: string,
  onProgress?: (status: string) => void,
  timeoutMs = 30 * 60 * 1000,
): Promise<AudioToolJobResult> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('AWS Audio Tools is not configured.');

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(callId)}`);

    if (response.status === 202) {
      onProgress?.('Processing audio on AWS…');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const result = (await response.json()) as AudioToolJobResult;
    if (result.status === 'failed') {
      throw new Error(stringifyBackendError(result.error) || 'AWS Audio Tools job failed.');
    }
    return result;
  }

  throw new Error('AWS Audio Tools job timed out before a result was returned.');
}

export async function runAudioToolsJob(
  track: Track,
  action: AudioToolAction,
  mode?: StemMode,
  onProgress?: (status: string) => void,
): Promise<AudioToolJobResult> {
  const accepted = await startAudioToolsJob(track, action, mode);
  if (!accepted.call_id) {
    throw new Error('AWS Audio Tools did not return a job identifier.');
  }
  onProgress?.('AWS job accepted…');
  return pollAudioToolsJob(accepted.call_id, onProgress);
}

import { Track } from '../types';

export type AudioToolAction = 'lyrics' | 'stems';
export type StemMode = 'vocals_instrumental' | 'full';

export interface AudioToolJobResult {
  status: 'completed' | 'failed' | 'running' | 'accepted';
  job_id?: string;
  call_id?: string;
  action?: AudioToolAction;
  mode?: StemMode;
  lyrics?: string;
  files?: Record<string, string>;
  bundle_url?: string;
  language?: string | null;
  language_probability?: number | null;
  error?: string;
}

const getBaseUrl = () => {
  const value = (import.meta.env.VITE_AUDIO_TOOLS_URL || '').trim();
  return value.replace(/\/+$/, '');
};

const parseError = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return body?.detail || body?.error || `Audio Tools returned ${response.status}`;
};

export const audioToolsConfigured = () => Boolean(getBaseUrl());

export async function startAudioToolsJob(
  track: Track,
  action: AudioToolAction,
  mode?: StemMode,
): Promise<AudioToolJobResult> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('Audio Tools is not configured yet. Add VITE_AUDIO_TOOLS_URL to the app environment.');
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
  if (!baseUrl) throw new Error('Audio Tools is not configured.');

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(callId)}`);

    if (response.status === 202) {
      onProgress?.('Processing audio…');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const result = (await response.json()) as AudioToolJobResult;
    if (result.status === 'failed') {
      throw new Error(result.error || 'Audio Tools job failed.');
    }
    return result;
  }

  throw new Error('Audio Tools job timed out before a result was returned.');
}

export async function runAudioToolsJob(
  track: Track,
  action: AudioToolAction,
  mode?: StemMode,
  onProgress?: (status: string) => void,
): Promise<AudioToolJobResult> {
  const accepted = await startAudioToolsJob(track, action, mode);
  if (!accepted.call_id) {
    throw new Error('Audio Tools did not return a job identifier.');
  }
  onProgress?.('Job accepted…');
  return pollAudioToolsJob(accepted.call_id, onProgress);
}

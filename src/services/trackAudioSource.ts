import type { Track } from '../types.ts';
import { getIdToken } from './auth.ts';

const cleanBase = (value: unknown): string => String(value ?? '').trim().replace(/\/+$/, '');

const getEnv = (name: string): string => {
  try {
    return String((import.meta as any).env?.[name] || '').trim();
  } catch {
    return '';
  }
};

export interface RefreshTrackAudioSourceOptions {
  apiBase?: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
}

export const trackHasUsableAudioSource = (track: Track): boolean => Boolean(
  track.file_data
  || (track.file_url && !track.file_url.startsWith('blob:')),
);

export async function refreshTrackAudioSource(
  track: Track,
  options: RefreshTrackAudioSourceOptions = {},
): Promise<Track> {
  if (track.file_data || !track.file_key) return track;

  const apiBase = cleanBase(
    options.apiBase === undefined ? getEnv('VITE_EZWAY_API_URL') : options.apiBase,
  );
  const token = options.token === undefined ? getIdToken() : options.token;
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  if (!apiBase || !token || !fetchImpl) return track;

  try {
    const response = await fetchImpl(`${apiBase}/bootstrap`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error(`EZ-WAY source refresh failed (${response.status}).`);
    const payload = await response.json() as { tracks?: Track[] };
    const refreshed = (payload.tracks || []).find((candidate) => candidate.id === track.id);
    if (!refreshed?.file_url || refreshed.file_url.startsWith('blob:')) return track;
    return { ...track, ...refreshed };
  } catch (error) {
    console.warn('[AudioSource] Could not refresh track source; using the current source.', error);
    return track;
  }
}

export async function loadTrackAudioFile(
  track: Track,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<File> {
  if (track.file_data) {
    return new File(
      [track.file_data],
      String(track.name || 'track'),
      { type: track.file_data.type || track.type || 'audio/mpeg' },
    );
  }

  const fileUrl = String(track.file_url || '').trim();
  if (!fileUrl || fileUrl.startsWith('blob:')) {
    throw new Error('Audio Tools requires an available local or cloud audio source.');
  }

  const response = await fetchImpl(fileUrl);
  if (!response.ok) {
    throw new Error(`Could not load the track audio (${response.status}).`);
  }
  const blob = await response.blob();
  return new File(
    [blob],
    String(track.name || 'track'),
    { type: blob.type || track.type || 'audio/mpeg' },
  );
}

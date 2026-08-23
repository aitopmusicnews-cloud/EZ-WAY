import type { AlbumCoverDraft } from './albumCoverCore';
import { DEFAULT_COVER_VARIATION_COUNT } from './albumCoverCore';

export interface AlbumCoverVariation {
  id: string;
  position: number;
  image_url: string;
  download_url: string;
  mime_type: string;
  width: number;
  height: number;
  selected: boolean;
  concept_name?: string | null;
  cover_score?: number | null;
}

export interface AlbumCoverVariationSet {
  id: string;
  set_number: number;
  status: string;
  variations: AlbumCoverVariation[];
}

export interface AlbumCoverGeneration {
  id: string;
  collection_id: string;
  status: string;
  title?: string | null;
  artist?: string | null;
  parental_advisory: boolean;
  selected_variation_id?: string | null;
  last_error?: Record<string, unknown> | null;
  variation_sets: AlbumCoverVariationSet[];
}

const configuredBase = (): string => {
  try {
    return String((import.meta as any).env?.VITE_ALBUM_COVER_API_URL || '')
      .trim()
      .replace(/\/+$/, '');
  } catch {
    return '';
  }
};

export const isAlbumCoverStudioConfigured = (): boolean => Boolean(configuredBase());

const apiUrl = (path: string): string => {
  const base = configuredBase();
  if (!base) throw new Error('EZ AI Albumcover Studio backend is not configured.');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base.endsWith('/api') ? `${base}${normalizedPath}` : `${base}/api${normalizedPath}`;
};

export const absoluteAlbumCoverUrl = (value: string): string => {
  if (/^https?:\/\//i.test(value)) return value;
  const base = configuredBase();
  if (!base) return value;
  const origin = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${origin}${value.startsWith('/') ? value : `/${value}`}`;
};

export const buildAlbumCoverCreativeContext = (draft: AlbumCoverDraft): string => {
  const intelligence = [
    draft.genre ? `Genre: ${draft.genre}` : '',
    draft.mood ? `Mood: ${draft.mood}` : '',
    draft.style ? `Style: ${draft.style}` : '',
    draft.bpm ? `BPM: ${draft.bpm}` : '',
    draft.key ? `Key: ${draft.key}` : '',
    draft.instruments.length ? `Instruments: ${draft.instruments.join(', ')}` : '',
    draft.keywords.length ? `Keywords: ${draft.keywords.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const sections = [
    `EZ-WAY MUSIC INTELLIGENCE\n${intelligence || 'Use the title and artist as the creative direction.'}`,
    draft.lyrics ? `SONG LYRICS\n${draft.lyrics}` : '',
  ].filter(Boolean);
  return sections.join('\n\n');
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || text || `Request failed (${response.status}).`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return payload as T;
};

export const createAlbumCoverGeneration = async (
  draft: AlbumCoverDraft,
  parentalAdvisory: boolean,
): Promise<AlbumCoverGeneration> => {
  const form = new FormData();
  form.set('lyrics_text', buildAlbumCoverCreativeContext(draft));
  form.set('title', draft.title);
  form.set('artist', draft.artist);
  form.set('parental_advisory', String(parentalAdvisory));
  form.set('collection_id', `ezway-${draft.trackId}`.slice(0, 64));
  form.set('variation_count', String(DEFAULT_COVER_VARIATION_COUNT));
  form.set('mood_path', 'lyrics');
  form.set('run_async', 'true');

  return parseJson<AlbumCoverGeneration>(await fetch(apiUrl('/generations'), {
    method: 'POST',
    body: form,
  }));
};

export const getAlbumCoverGeneration = async (generationId: string): Promise<AlbumCoverGeneration> => (
  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}`), {
    headers: { Accept: 'application/json' },
  }))
);

const terminalStatuses = new Set([
  'complete',
  'partial',
  'analysis_failed',
  'image_failed',
  'needs_mood_choice',
]);

export const waitForAlbumCoverGeneration = async (
  generationId: string,
  options: { timeoutMs?: number; pollMs?: number; onPoll?: (generation: AlbumCoverGeneration) => void } = {},
): Promise<AlbumCoverGeneration> => {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const pollMs = options.pollMs ?? 1800;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const generation = await getAlbumCoverGeneration(generationId);
    options.onPoll?.(generation);
    if (terminalStatuses.has(generation.status)) return generation;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('Album cover generation timed out. You can retry without losing the selected track.');
};

export const regenerateAlbumCovers = async (generationId: string): Promise<AlbumCoverGeneration> => (
  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/regenerate`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      mood_path: 'lyrics',
      variation_count: DEFAULT_COVER_VARIATION_COUNT,
      run_async: true,
    }),
  }))
);

export const selectAlbumCoverVariation = async (variationId: string): Promise<AlbumCoverGeneration> => (
  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/variations/${encodeURIComponent(variationId)}/select`), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  }))
);

export const downloadAlbumCover = async (variation: AlbumCoverVariation): Promise<Blob> => {
  const url = absoluteAlbumCoverUrl(variation.download_url || `/api/variations/${variation.id}/download`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cover download failed (${response.status}).`);
  return response.blob();
};

export const latestAlbumCoverVariations = (generation: AlbumCoverGeneration | null): AlbumCoverVariation[] => {
  if (!generation?.variation_sets?.length) return [];
  const latest = [...generation.variation_sets].sort((a, b) => b.set_number - a.set_number)[0];
  return [...(latest?.variations || [])].sort((a, b) => a.position - b.position).slice(0, DEFAULT_COVER_VARIATION_COUNT);
};

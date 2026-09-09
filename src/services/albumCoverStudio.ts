import type { AlbumCoverDraft } from './albumCoverCore';

export type AlbumCoverMoodPath = 'auto' | 'blend' | 'audio' | 'lyrics';
export type AlbumCoverVariationCount = 3 | 4 | 5;
export type AlbumCoverCreativeStrength = 'loose' | 'balanced' | 'strict';

export interface AlbumCoverCreativeControls {
  subjectHint?: string;
  sceneHint?: string;
  stylePreset?: 'auto' | 'photo' | 'cinematic' | 'illustration' | 'painting' | 'collage' | 'minimal';
  compositionPreset?: 'auto' | 'close-up' | 'portrait' | 'wide' | 'centered' | 'off-center' | 'minimal';
  colorMood?: string;
  mustInclude?: string;
  avoid?: string;
  creativeStrength?: AlbumCoverCreativeStrength;
}

export interface AlbumCoverSourceInput {
  audio?: Blob | File | null;
  lyricsFile?: File | null;
  lyricsText?: string;
  title?: string;
  artist?: string;
  parentalAdvisory?: boolean;
  variationCount?: AlbumCoverVariationCount;
  creativeControls?: AlbumCoverCreativeControls;
  collectionId: string;
}

export interface AlbumCoverConcept {
  id: string;
  ordinal: number;
  name: string;
  subject: string;
  setting: string;
  action_or_symbol: string;
  camera: string;
  medium: string;
  palette: string;
  typography_zone: string;
  image_prompt: string;
  scores?: Record<string, unknown> | null;
  total_score?: number | null;
  rank?: number | null;
  selected_for_render?: boolean;
}

export interface AlbumCoverVariation {
  id: string;
  position: number;
  image_url: string;
  download_url: string;
  mime_type: string;
  width: number;
  height: number;
  selected: boolean;
  concept_id?: string | null;
  concept_name?: string | null;
  render_index?: number | null;
  rank?: number | null;
  selection_tier?: string | null;
  cover_score?: number | null;
  thumbnail_score?: number | null;
  commercial_score?: number | null;
  critic_feedback?: Record<string, unknown> | null;
  platform_scores?: Record<string, unknown> | null;
  market_positioning?: Record<string, unknown> | null;
  created_at?: string;
}

export interface AlbumCoverVariationSet {
  id: string;
  set_number: number;
  mood_path: string;
  prompt: string;
  requested_count: number;
  concept_count?: number;
  selected_concept_count?: number;
  renders_per_concept?: number;
  concepts?: AlbumCoverConcept[];
  winner_variation_id?: string | null;
  runner_up_variation_id?: string | null;
  critic_status?: string;
  status: string;
  error?: Record<string, unknown> | null;
  created_at?: string;
  variations: AlbumCoverVariation[];
}

export interface AlbumCoverAuditEvent {
  id: number;
  step: string;
  attempt: number;
  outcome: string;
  message?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string;
}

export interface AlbumCoverGeneration {
  id: string;
  collection_id: string;
  version: number;
  input_hash?: string;
  status: string;
  cache_hit?: boolean;
  has_audio: boolean;
  has_lyrics: boolean;
  title?: string | null;
  artist?: string | null;
  parental_advisory: boolean;
  analysis?: Record<string, any> | null;
  conflict?: Record<string, any> | null;
  selected_variation_id?: string | null;
  last_error?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
  variation_sets: AlbumCoverVariationSet[];
  audit_events?: AlbumCoverAuditEvent[];
}

export interface AlbumCoverHistoryResponse {
  collection_id: string;
  versions: AlbumCoverGeneration[];
}

export interface AlbumCoverMetricsTrendPoint {
  version: number;
  set_number: number;
  average_score?: number | null;
  winner_score?: number | null;
  created_at: string;
}

export interface AlbumCoverMetrics {
  collection_id: string;
  versions: number;
  variation_sets: number;
  covers_generated: number;
  scored_covers: number;
  selected_covers: number;
  successful_versions: number;
  failed_versions: number;
  success_rate: number;
  critic_completion_rate: number;
  average_cover_score?: number | null;
  average_thumbnail_score?: number | null;
  average_commercial_score?: number | null;
  best_cover_score?: number | null;
  release_ready_covers: number;
  retries: number;
  failed_steps: number;
  cache_hits: number;
  status_counts: Record<string, number>;
  set_status_counts: Record<string, number>;
  platform_averages: Record<string, number>;
  quality_trend: AlbumCoverMetricsTrendPoint[];
  latest_update?: string | null;
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
  if (!base) throw new Error('EZ AI Album Cover Studio backend is not configured.');
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

const creativeControlPayload = (controls: AlbumCoverCreativeControls = {}) => ({
  subject_hint: String(controls.subjectHint || '').trim(),
  scene_hint: String(controls.sceneHint || '').trim(),
  style_preset: controls.stylePreset || 'auto',
  composition_preset: controls.compositionPreset || 'auto',
  color_mood: String(controls.colorMood || '').trim(),
  must_include: String(controls.mustInclude || '').trim(),
  avoid: String(controls.avoid || '').trim(),
  creative_strength: controls.creativeStrength || 'balanced',
});

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || payload?.message || text || `Request failed (${response.status}).`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return payload as T;
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
    intelligence ? `EZ-WAY MUSIC INTELLIGENCE\n${intelligence}` : '',
    draft.lyrics ? `SONG LYRICS\n${draft.lyrics}` : '',
  ].filter(Boolean);
  return sections.join('\n\n');
};

const normalizeSourceInput = (
  input: AlbumCoverSourceInput | AlbumCoverDraft,
  parentalAdvisory = false,
): AlbumCoverSourceInput => {
  if ('collectionId' in input) return input;
  return {
    collectionId: `ezway-${input.trackId}`.slice(0, 64),
    lyricsText: buildAlbumCoverCreativeContext(input),
    title: input.title,
    artist: input.artist,
    parentalAdvisory,
    variationCount: 3,
  };
};

export const createAlbumCoverGeneration = async (
  input: AlbumCoverSourceInput | AlbumCoverDraft,
  parentalAdvisory = false,
): Promise<AlbumCoverGeneration> => {
  const source = normalizeSourceInput(input, parentalAdvisory);
  const form = new FormData();
  form.set('collection_id', source.collectionId);
  form.set('lyrics_text', String(source.lyricsText || ''));
  form.set('title', String(source.title || ''));
  form.set('artist', String(source.artist || ''));
  form.set('parental_advisory', String(Boolean(source.parentalAdvisory)));
  form.set('variation_count', String(source.variationCount || 4));
  form.set('mood_path', 'auto');
  form.set('run_async', 'true');
  const controls = creativeControlPayload(source.creativeControls);
  Object.entries(controls).forEach(([key, value]) => form.set(key, value));
  if (source.audio) {
    const file = source.audio instanceof File
      ? source.audio
      : new File([source.audio], 'ezway-track.mp3', { type: source.audio.type || 'audio/mpeg' });
    form.set('audio', file);
  }
  if (source.lyricsFile) form.set('lyrics_file', source.lyricsFile);

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
  const pollMs = options.pollMs ?? 1500;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const generation = await getAlbumCoverGeneration(generationId);
    options.onPoll?.(generation);
    if (terminalStatuses.has(generation.status)) return generation;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('Album cover generation timed out. You can retry without losing the selected track.');
};

export const waitForAlbumCoverVariationSet = async (
  generationId: string,
  previousSetCount: number,
  options: { timeoutMs?: number; pollMs?: number; onPoll?: (generation: AlbumCoverGeneration) => void } = {},
): Promise<AlbumCoverGeneration> => {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const pollMs = options.pollMs ?? 1500;
  const started = Date.now();
  let newSetSeen = false;

  while (Date.now() - started < timeoutMs) {
    const generation = await getAlbumCoverGeneration(generationId);
    options.onPoll?.(generation);
    newSetSeen = newSetSeen || generation.variation_sets.length > previousSetCount;
    if (newSetSeen && terminalStatuses.has(generation.status)) return generation;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('Fresh album cover variations timed out. You can retry without losing this version.');
};

export const runAlbumCoverPath = async (
  generationId: string,
  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,
  variationCount: AlbumCoverVariationCount,
  action: 'generate' | 'regenerate' = 'regenerate',
  creativeControls: AlbumCoverCreativeControls = {},
): Promise<AlbumCoverGeneration> => (
  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/${action}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      mood_path: moodPath,
      variation_count: variationCount,
      run_async: true,
      ...creativeControlPayload(creativeControls),
    }),
  }))
);

export const regenerateAlbumCovers = async (
  generationId: string,
  moodPath: Exclude<AlbumCoverMoodPath, 'auto'> = 'blend',
  variationCount: AlbumCoverVariationCount = 4,
  creativeControls: AlbumCoverCreativeControls = {},
): Promise<AlbumCoverGeneration> => runAlbumCoverPath(
  generationId, moodPath, variationCount, 'regenerate', creativeControls,
);

export const generateBetterAlbumCovers = async (
  generationId: string,
  moodPath: Exclude<AlbumCoverMoodPath, 'auto'>,
  variationCount: AlbumCoverVariationCount,
  creativeControls: AlbumCoverCreativeControls = {},
): Promise<AlbumCoverGeneration> => (
  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/improve`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      mood_path: moodPath,
      variation_count: variationCount,
      run_async: true,
      ...creativeControlPayload(creativeControls),
    }),
  }))
);

export const retryAlbumCoverGeneration = async (generationId: string): Promise<AlbumCoverGeneration> => (
  parseJson<AlbumCoverGeneration>(await fetch(apiUrl(`/generations/${encodeURIComponent(generationId)}/retry?run_async=true`), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  }))
);

export const getAlbumCoverHistory = async (collectionId: string): Promise<AlbumCoverHistoryResponse> => (
  parseJson<AlbumCoverHistoryResponse>(await fetch(apiUrl(`/collections/${encodeURIComponent(collectionId)}/versions`), {
    headers: { Accept: 'application/json' },
  }))
);

export const getAlbumCoverMetrics = async (collectionId: string): Promise<AlbumCoverMetrics> => (
  parseJson<AlbumCoverMetrics>(await fetch(apiUrl(`/collections/${encodeURIComponent(collectionId)}/metrics`), {
    headers: { Accept: 'application/json' },
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

export const latestAlbumCoverVariationSet = (generation: AlbumCoverGeneration | null): AlbumCoverVariationSet | null => {
  if (!generation?.variation_sets?.length) return null;
  return [...generation.variation_sets].sort((a, b) => b.set_number - a.set_number)[0] || null;
};

export const latestAlbumCoverVariations = (generation: AlbumCoverGeneration | null): AlbumCoverVariation[] => {
  const latest = latestAlbumCoverVariationSet(generation);
  return [...(latest?.variations || [])].sort((a, b) => a.position - b.position);
};

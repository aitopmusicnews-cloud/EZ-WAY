export interface LocalLyricSegment {
  start: number;
  end: number;
  text: string;
}

export interface LocalLyricTranscript {
  text: string;
  language: string | null;
  language_probability: number | null;
  segments: LocalLyricSegment[];
}

export interface LocalLyricOptimizerHealth {
  ok: boolean;
  service: string;
  model: string;
  device: string;
  compute_type: string;
}

export interface LocalLyricSeoResearch {
  queries: string[];
  suggestions: string[];
  competitor_tags: string[];
  ranked_tags: string[];
  lyric_themes?: string[];
  warning: string | null;
}

export interface LocalLyricDescriptionInput {
  song_title: string;
  artist: string;
  genre: string;
  mood: string;
  lyrics: string;
  spotify_url?: string;
  apple_music_url?: string;
  amazon_music_url?: string;
  producers?: string;
  songwriters?: string;
  vocalists?: string;
  visual_credit?: string;
}

export interface LocalLyricDescriptionResult {
  prompt: string;
  skeleton: string;
}

export interface LocalLyricOptimizerOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';
const SERVICE_UNAVAILABLE_MESSAGE = 'Lyric Optimizer Service is unavailable.';

const runtimeBaseUrl = (): string => {
  const configured = String((import.meta as any).env?.VITE_LOCAL_LYRIC_OPTIMIZER_URL || '').trim();
  return configured || DEFAULT_BASE_URL;
};

const normalizeBaseUrl = (value: string): string => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  try {
    new URL(raw); // validate it's a real URL
  } catch {
    throw new Error('Lyric Optimizer URL must be a valid URL.');
  }
  return raw;
};

const resolveOptions = (options: LocalLyricOptimizerOptions = {}) => ({
  baseUrl: normalizeBaseUrl(options.baseUrl || runtimeBaseUrl()),
  fetchImpl: options.fetchImpl || fetch,
});

const responseError = async (response: Response): Promise<Error> => {
  const text = await response.text().catch(() => '');
  if (text) {
    try {
      const body = JSON.parse(text);
      const detail = body?.detail ?? body?.message ?? body?.error;
      if (typeof detail === 'string' && detail.trim()) return new Error(detail.trim());
    } catch {
      return new Error(text.trim() || `Lyric Optimizer returned ${response.status}.`);
    }
  }
  return new Error(`Lyric Optimizer returned ${response.status}.`);
};

const requestJson = async <T>(
  path: string,
  init: RequestInit,
  options: LocalLyricOptimizerOptions = {},
): Promise<T> => {
  const { baseUrl, fetchImpl } = resolveOptions(options);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, init);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${SERVICE_UNAVAILABLE_MESSAGE} ${detail}`);
  }
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
};

export const checkLocalLyricOptimizer = async (
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricOptimizerHealth> =>
  requestJson('/health', { method: 'GET' }, options);

export const transcribeLyricsFile = async (
  file: File,
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricTranscript> => {
  const form = new FormData();
  form.append('file', file, file.name);
  return requestJson('/lyrics/transcribe', { method: 'POST', body: form }, options);
};

export const researchLocalLyricSeo = async (
  seed: string,
  genre = '',
  lyrics = '',
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricSeoResearch> =>
  requestJson(
    '/seo/research',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, genre, lyrics }),
    },
    options,
  );

export const buildLocalLyricDescription = async (
  input: LocalLyricDescriptionInput,
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricDescriptionResult> =>
  requestJson(
    '/seo/description-prompt',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    options,
  );

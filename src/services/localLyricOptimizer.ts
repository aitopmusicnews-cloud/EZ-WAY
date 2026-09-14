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
const SERVICE_UNAVAILABLE_MESSAGE = 'Local Lyrics Service is not running on this computer. Start it, then try again.';

const runtimeBaseUrl = (): string => {
  const configured = String((import.meta as any).env?.VITE_LOCAL_LYRIC_OPTIMIZER_URL || '').trim();
  return configured || DEFAULT_BASE_URL;
};

const normalizeLoopbackBaseUrl = (value: string): string => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Local Lyrics Service URL must be a valid loopback URL.');
  }

  const host = parsed.hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('Local Lyrics Service URL must use a loopback host (127.0.0.1, localhost, or ::1).');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Local Lyrics Service URL must use HTTP or HTTPS on a loopback host.');
  }
  return raw;
};

const resolveOptions = (options: LocalLyricOptimizerOptions = {}) => ({
  baseUrl: normalizeLoopbackBaseUrl(options.baseUrl || runtimeBaseUrl()),
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
      return new Error(text.trim() || `Local Lyrics Service returned ${response.status}.`);
    }
  }
  return new Error(`Local Lyrics Service returned ${response.status}.`);
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
    const permissionHint = /cors|permission|private network|local network|access/i.test(detail)
      ? ' Allow loopback/local-network access in the browser, then try again.'
      : '';
    throw new Error(`${SERVICE_UNAVAILABLE_MESSAGE}${permissionHint}`);
  }

  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
};

export const checkLocalLyricOptimizer = async (
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricOptimizerHealth> => requestJson<LocalLyricOptimizerHealth>('/health', {
  method: 'GET',
}, options);

export const transcribeLyricsFile = async (
  file: File,
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricTranscript> => {
  const form = new FormData();
  form.append('file', file, file.name);
  return requestJson<LocalLyricTranscript>('/lyrics/transcribe', {
    method: 'POST',
    body: form,
  }, options);
};

export const researchLocalLyricSeo = async (
  seed: string,
  genre = '',
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricSeoResearch> => requestJson<LocalLyricSeoResearch>('/seo/research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ seed, genre }),
}, options);

export const buildLocalLyricDescription = async (
  input: LocalLyricDescriptionInput,
  options: LocalLyricOptimizerOptions = {},
): Promise<LocalLyricDescriptionResult> => requestJson<LocalLyricDescriptionResult>('/seo/description-prompt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
}, options);

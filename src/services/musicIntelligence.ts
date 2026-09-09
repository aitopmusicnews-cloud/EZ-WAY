import type { Track } from '../types.ts';
import { getIdToken } from './auth.ts';
import {
  analyzeTrackLocally,
  LOCAL_MUSIC_INTELLIGENCE_VERSION,
} from './localMusicIntelligence.ts';
import {
  buildAnalysisSourceFingerprint,
  hasUsableMusicIntelligenceProfile,
  profileToLegacyTrackUpdates,
  shouldReuseAnalysis,
  type MusicIntelligenceProfile,
} from './musicIntelligenceCore.ts';

export const MUSIC_INTELLIGENCE_VERSION = LOCAL_MUSIC_INTELLIGENCE_VERSION;
const LOCAL_CACHE_KEY = 'ezway_music_intelligence_v1';

export interface TrackAnalysisRecord {
  track_id: string;
  analyzer_version: string;
  profile: MusicIntelligenceProfile;
  status: 'processing' | 'ready' | 'error';
  error?: string | null;
  source_fingerprint?: string | null;
  created_at?: string;
  updated_at?: string;
}

const getEnv = (name: string): string => {
  try {
    return String((import.meta as any).env?.[name] || '').trim();
  } catch {
    return '';
  }
};

const cleanBase = (value: unknown): string => String(value ?? '').trim().replace(/\/+$/, '');

// Local browser analysis is the default source of truth. A separate profile API can
// still be configured explicitly, but the Render Audio Tools service is no longer
// treated as an analysis-profile backend merely because VITE_AUDIO_TOOLS_URL exists.
const getCloudReadBase = (): string => cleanBase(getEnv('VITE_MUSIC_INTELLIGENCE_API_URL'));
const getCloudWriteBase = (): string => cleanBase(getEnv('VITE_MUSIC_INTELLIGENCE_API_URL'));
const getAppDataBase = (): string => cleanBase(getEnv('VITE_EZWAY_API_URL'));

const getCloudReadRecordUrl = (trackId: string): string => {
  const base = getCloudReadBase();
  return base ? `${base}/${encodeURIComponent(trackId)}` : '';
};

const getCloudWriteRecordUrl = (trackId: string): string => {
  const base = getCloudWriteBase();
  return base ? `${base}/${encodeURIComponent(trackId)}` : '';
};

const readLocalCache = (): Record<string, TrackAnalysisRecord> => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeLocalRecord = (record: TrackAnalysisRecord) => {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache = readLocalCache();
    cache[record.track_id] = record;
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Browser profile caching is best-effort.
  }
};

const emptyProfile = (): MusicIntelligenceProfile => ({
  version: MUSIC_INTELLIGENCE_VERSION,
  analyzed_at: new Date().toISOString(),
  bpm: 0,
  primary_genre: 'Unknown',
  genre_confident: false,
  genres: [],
  moods: [],
  styles: [],
  instruments: [],
  sections: [],
  chapters: [],
  keywords: [],
  evidence: {},
  warnings: [],
});

const unwrapRecordResponse = (payload: unknown): TrackAnalysisRecord | null => {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as any).record || payload;
  if (!candidate || typeof candidate !== 'object' || !candidate.track_id) return null;
  return candidate as TrackAnalysisRecord;
};

interface RefreshTrackAnalysisSourceOptions {
  apiBase?: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
}

export async function refreshTrackAnalysisSource(
  track: Track,
  options: RefreshTrackAnalysisSourceOptions = {},
): Promise<Track> {
  // Tracks stored by object key receive temporary S3 read URLs. Refresh that URL
  // immediately before browser analysis so a long-open tab does not fetch an expired URL.
  if (!track.file_key || track.file_data) return track;

  const apiBase = cleanBase(options.apiBase === undefined ? getAppDataBase() : options.apiBase);
  const token = options.token === undefined ? getIdToken() : options.token;
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  if (!apiBase || !token) return track;

  try {
    const response = await fetchImpl(`${apiBase}/bootstrap`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`EZ-WAY source refresh failed (${response.status}).`);
    }
    const payload = await response.json() as { tracks?: Track[] };
    const refreshed = (payload.tracks || []).find((candidate) => candidate.id === track.id);
    if (!refreshed?.file_url || refreshed.file_url.startsWith('blob:')) return track;
    return { ...track, ...refreshed };
  } catch (error) {
    console.warn('[MusicIntelligence] Could not refresh track source; using the current source URL.', error);
    return track;
  }
}

export async function getTrackAnalysisRecord(trackId: string): Promise<TrackAnalysisRecord | null> {
  const local = readLocalCache()[trackId] || null;
  const cloudUrl = getCloudReadRecordUrl(trackId);
  if (cloudUrl) {
    try {
      const response = await fetch(cloudUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (response.status === 404) return local;
      if (!response.ok) {
        throw new Error(`Music Intelligence profile lookup failed (${response.status}).`);
      }

      const record = unwrapRecordResponse(await response.json());
      if (record) {
        writeLocalRecord(record);
        return record;
      }
      return local;
    } catch (error) {
      console.warn('[MusicIntelligence] Profile lookup unavailable; using local cache.', error);
      return local;
    }
  }

  return local;
}

export async function getTrackMusicIntelligence(trackId: string): Promise<MusicIntelligenceProfile | null> {
  const record = await getTrackAnalysisRecord(trackId);
  return record && hasUsableMusicIntelligenceProfile(record.profile) ? record.profile : null;
}

export async function saveTrackAnalysisRecord(record: TrackAnalysisRecord): Promise<void> {
  const now = new Date().toISOString();
  const normalized: TrackAnalysisRecord = {
    ...record,
    created_at: record.created_at || now,
    updated_at: now,
  };

  writeLocalRecord(normalized);

  // Browser analysis works without a remote profile service. Write remotely only when
  // an explicit authenticated Music Intelligence profile API is configured.
  const cloudUrl = getCloudWriteRecordUrl(record.track_id);
  if (!cloudUrl) return;

  const response = await fetch(cloudUrl, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalized),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(
      `Music Intelligence save failed (${response.status})${message ? `: ${message.slice(0, 240)}` : ''}`,
    );
  }
}

export interface AnalyzeMusicOptions {
  force?: boolean;
  onProgress?: (status: string) => void;
}

export async function analyzeAndPersistTrack(
  track: Track,
  options: AnalyzeMusicOptions = {},
): Promise<MusicIntelligenceProfile> {
  const analysisTrack = await refreshTrackAnalysisSource(track);
  const hasLocalBlob = Boolean(analysisTrack.file_data);
  const hasFetchableUrl = Boolean(
    analysisTrack.file_url
    && !analysisTrack.file_url.startsWith('blob:'),
  );
  if (!hasLocalBlob && !hasFetchableUrl) {
    throw new Error('Music Intelligence requires an available audio source.');
  }

  const sourceFingerprint = buildAnalysisSourceFingerprint(analysisTrack);
  const saved = await getTrackAnalysisRecord(analysisTrack.id);

  if (!options.force && saved?.profile && shouldReuseAnalysis(saved, sourceFingerprint, MUSIC_INTELLIGENCE_VERSION)) {
    options.onProgress?.('Using saved song analysis…');
    return saved.profile;
  }

  const previousGoodProfile = saved
    && saved.source_fingerprint === sourceFingerprint
    && hasUsableMusicIntelligenceProfile(saved.profile)
    ? saved.profile
    : null;

  await saveTrackAnalysisRecord({
    track_id: analysisTrack.id,
    analyzer_version: MUSIC_INTELLIGENCE_VERSION,
    profile: previousGoodProfile || emptyProfile(),
    status: 'processing',
    error: null,
    source_fingerprint: sourceFingerprint,
    created_at: saved?.created_at,
  });

  try {
    options.onProgress?.('Analyzing genre, BPM, key, mood, and production locally…');
    const profile = await analyzeTrackLocally(analysisTrack);
    if (!hasUsableMusicIntelligenceProfile(profile)) {
      throw new Error('Music Intelligence could not produce a usable song profile.');
    }

    await saveTrackAnalysisRecord({
      track_id: analysisTrack.id,
      analyzer_version: profile.version || MUSIC_INTELLIGENCE_VERSION,
      profile,
      status: 'ready',
      error: null,
      source_fingerprint: sourceFingerprint,
      created_at: saved?.created_at,
    });
    return profile;
  } catch (error: any) {
    try {
      await saveTrackAnalysisRecord({
        track_id: analysisTrack.id,
        analyzer_version: MUSIC_INTELLIGENCE_VERSION,
        profile: previousGoodProfile || emptyProfile(),
        status: 'error',
        error: error?.message || String(error),
        source_fingerprint: sourceFingerprint,
        created_at: saved?.created_at,
      });
    } catch (persistenceError) {
      console.warn('[MusicIntelligence] Could not persist the analysis failure state.', persistenceError);
    }
    throw error;
  }
}

export async function runManualTrackAnalysis(
  track: Track,
  updateTrack: (trackId: string, updates: Partial<Track>) => Promise<void>,
  analyze: typeof analyzeAndPersistTrack = analyzeAndPersistTrack,
): Promise<MusicIntelligenceProfile> {
  await updateTrack(track.id, { status: 'processing' });

  try {
    const profile = await analyze(track, { force: true });
    const legacyUpdates = profileToLegacyTrackUpdates(profile, track.tags || []);
    await updateTrack(track.id, {
      ...legacyUpdates,
      status: 'ready',
    });
    return profile;
  } catch (error) {
    await updateTrack(track.id, { status: 'error' });
    throw error;
  }
}

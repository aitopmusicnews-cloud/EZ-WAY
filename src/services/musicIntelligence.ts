import type { Track } from '../types';
import { runAudioToolsJob } from './audioTools';
import {
  buildAnalysisSourceFingerprint,
  hasUsableMusicIntelligenceProfile,
  shouldReuseAnalysis,
  type MusicIntelligenceProfile,
} from './musicIntelligenceCore';

export const MUSIC_INTELLIGENCE_VERSION = 'music-intelligence-v1';
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

const getCloudApiBase = (): string => {
  try {
    return String((import.meta as any).env?.VITE_MUSIC_INTELLIGENCE_API_URL || '')
      .trim()
      .replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const getCloudRecordUrl = (trackId: string): string => {
  const base = getCloudApiBase();
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
    // Local cache is a best-effort development/offline fallback only.
  }
};

const deleteLocalRecord = (trackId: string) => {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache = readLocalCache();
    if (!cache[trackId]) return;
    delete cache[trackId];
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Best effort only.
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

export async function getTrackAnalysisRecord(trackId: string): Promise<TrackAnalysisRecord | null> {
  const cloudUrl = getCloudRecordUrl(trackId);
  if (cloudUrl) {
    try {
      const response = await fetch(cloudUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (response.status === 404) {
        deleteLocalRecord(trackId);
        return null;
      }
      if (!response.ok) {
        throw new Error(`AWS Music Intelligence lookup failed (${response.status}).`);
      }

      const record = unwrapRecordResponse(await response.json());
      if (record) {
        writeLocalRecord(record);
        return record;
      }
      return null;
    } catch (error) {
      console.warn('[MusicIntelligence] AWS profile lookup unavailable; using local cache.', error);
      return readLocalCache()[trackId] || null;
    }
  }

  return readLocalCache()[trackId] || null;
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

  const cloudUrl = getCloudRecordUrl(record.track_id);
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
      `AWS Music Intelligence save failed (${response.status})${message ? `: ${message.slice(0, 240)}` : ''}`,
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
  if (!track.file_url || track.file_url.startsWith('blob:')) {
    throw new Error('Music Intelligence requires the uploaded cloud audio URL.');
  }

  const sourceFingerprint = buildAnalysisSourceFingerprint(track);
  const saved = await getTrackAnalysisRecord(track.id);

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
    track_id: track.id,
    analyzer_version: MUSIC_INTELLIGENCE_VERSION,
    profile: previousGoodProfile || emptyProfile(),
    status: 'processing',
    error: null,
    source_fingerprint: sourceFingerprint,
    created_at: saved?.created_at,
  });

  try {
    options.onProgress?.('Analyzing song structure, genre, mood, and production…');
    const result = await runAudioToolsJob(track, 'analysis', undefined, options.onProgress);
    if (!result.profile) {
      throw new Error('Music Intelligence did not return a song profile.');
    }

    const profile = result.profile;
    await saveTrackAnalysisRecord({
      track_id: track.id,
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
        track_id: track.id,
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
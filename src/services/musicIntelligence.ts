import type { Track } from '../types';
import { getSupabaseClient } from '../lib/supabase';
import { runAudioToolsJob } from './audioTools';
import {
  buildAnalysisSourceFingerprint,
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
    // Local cache is a best-effort fallback only.
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

export async function getTrackAnalysisRecord(trackId: string): Promise<TrackAnalysisRecord | null> {
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('track_analysis')
      .select('*')
      .eq('track_id', trackId)
      .maybeSingle();

    if (!error && data) {
      const record = data as TrackAnalysisRecord;
      writeLocalRecord(record);
      return record;
    }
  } catch (error) {
    console.warn('[MusicIntelligence] Database profile lookup unavailable; using local cache.', error);
  }

  return readLocalCache()[trackId] || null;
}

export async function getTrackMusicIntelligence(trackId: string): Promise<MusicIntelligenceProfile | null> {
  const record = await getTrackAnalysisRecord(trackId);
  return record?.status === 'ready' ? record.profile : null;
}

export async function saveTrackAnalysisRecord(record: TrackAnalysisRecord): Promise<void> {
  const now = new Date().toISOString();
  const normalized: TrackAnalysisRecord = {
    ...record,
    created_at: record.created_at || now,
    updated_at: now,
  };

  writeLocalRecord(normalized);

  try {
    const client = await getSupabaseClient();
    const { error } = await client
      .from('track_analysis')
      .upsert(normalized, { onConflict: 'track_id' });
    if (error) {
      console.warn('[MusicIntelligence] Database profile save unavailable; local cache retained.', error.message);
    }
  } catch (error) {
    console.warn('[MusicIntelligence] Database profile save unavailable; local cache retained.', error);
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
  if (!options.force) {
    const saved = await getTrackAnalysisRecord(track.id);
    if (saved?.profile && shouldReuseAnalysis(saved, sourceFingerprint, MUSIC_INTELLIGENCE_VERSION)) {
      options.onProgress?.('Using saved song analysis…');
      return saved.profile;
    }
  }

  await saveTrackAnalysisRecord({
    track_id: track.id,
    analyzer_version: MUSIC_INTELLIGENCE_VERSION,
    profile: emptyProfile(),
    status: 'processing',
    error: null,
    source_fingerprint: sourceFingerprint,
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
    });
    return profile;
  } catch (error: any) {
    await saveTrackAnalysisRecord({
      track_id: track.id,
      analyzer_version: MUSIC_INTELLIGENCE_VERSION,
      profile: emptyProfile(),
      status: 'error',
      error: error?.message || String(error),
      source_fingerprint: sourceFingerprint,
    });
    throw error;
  }
}

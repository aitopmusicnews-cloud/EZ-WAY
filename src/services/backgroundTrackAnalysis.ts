import type { Track } from '../types.ts';
import { analyzeAndPersistTrack } from './musicIntelligence.ts';
import {
  profileToLegacyTrackUpdates,
  type MusicIntelligenceProfile,
} from './musicIntelligenceCore.ts';

interface UploadedTrackAnalysisOptions {
  track: Track;
  onUploadComplete: () => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => Promise<void>;
  analyze?: (track: Track) => Promise<MusicIntelligenceProfile>;
  reportError?: (message: string, error: unknown) => void;
}

export async function runUploadedTrackAnalysis({
  track,
  onUploadComplete,
  updateTrack,
  analyze = (uploadedTrack) => analyzeAndPersistTrack(uploadedTrack, { force: true }),
  reportError = (message, error) => console.error(message, error),
}: UploadedTrackAnalysisOptions): Promise<'ready' | 'error'> {
  onUploadComplete();

  try {
    const profile = await analyze(track);
    const legacyUpdates = profileToLegacyTrackUpdates(profile, track.tags || []);
    await updateTrack(track.id, {
      ...legacyUpdates,
      status: 'ready',
    });
    return 'ready';
  } catch (error) {
    reportError('[BackgroundTrackAnalysis] Analysis failed:', error);
    try {
      await updateTrack(track.id, { status: 'error' });
    } catch (updateError) {
      reportError('[BackgroundTrackAnalysis] Could not save retry status:', updateError);
    }
    return 'error';
  }
}

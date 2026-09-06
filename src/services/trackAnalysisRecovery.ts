import type { Track } from '../types.ts';
import type { TrackAnalysisRecord } from './musicIntelligence.ts';
import {
  hasUsableMusicIntelligenceProfile,
  profileToLegacyTrackUpdates,
} from './musicIntelligenceCore.ts';

export function resolveTrackAnalysisRecovery(
  track: Track,
  record: TrackAnalysisRecord | null | undefined,
): Partial<Track> | null {
  if (!record || track.status === 'ready') return null;

  if (record.status === 'processing') return null;
  if (record.status === 'error') return { status: 'error' };

  if (record.status !== 'ready' || !hasUsableMusicIntelligenceProfile(record.profile)) {
    return null;
  }

  return {
    ...profileToLegacyTrackUpdates(record.profile, track.tags || []),
    status: 'ready',
  };
}

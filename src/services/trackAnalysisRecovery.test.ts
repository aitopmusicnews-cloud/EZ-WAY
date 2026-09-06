import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTrackAnalysisRecovery } from './trackAnalysisRecovery.ts';
import type { Track } from '../types.ts';
import type { TrackAnalysisRecord } from './musicIntelligence.ts';

const track: Track = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Recovered Track',
  artist: 'OGBeatz',
  bpm: 0,
  key_signature: 'Analyzing…',
  duration: 180,
  tags: ['custom-tag'],
  status: 'processing',
  size: 123456,
  type: 'audio/mpeg',
  file_url: 'https://example.com/audio.mp3?signature=fresh',
  file_key: 'tracks/audio/example.mp3',
  plays: 0,
  likes: 0,
  created_at: '2026-09-01T00:00:00.000Z',
};

const readyRecord: TrackAnalysisRecord = {
  track_id: track.id,
  analyzer_version: 'music-intelligence-v1',
  status: 'ready',
  source_fingerprint: 'v1-old-presigned-url',
  profile: {
    version: 'music-intelligence-v1',
    analyzed_at: '2026-09-01T00:01:00.000Z',
    bpm: 87,
    key: 'D Major',
    camelot_key: '10B',
    primary_genre: 'Latin Pop',
    genre_confident: true,
    genres: [{ label: 'Latin Pop', score: 0.9 }],
    moods: [{ label: 'Confident', score: 0.8 }],
    styles: [{ label: 'Melodic Trap', score: 0.7 }],
    instruments: [{ label: 'Lead Synth', score: 0.6 }],
    sections: [],
    chapters: [],
    keywords: ['radio-ready'],
    evidence: { provider: 'aws-ecs' },
    warnings: [],
  },
};

test('repairs a processing track from a completed canonical AWS profile', () => {
  assert.deepEqual(resolveTrackAnalysisRecovery(track, readyRecord), {
    bpm: 87,
    key_signature: 'D Major (10B)',
    tags: [
      'camelot_key:10B',
      'genre_category:Latin Pop',
      'mood:Confident',
      'vibe:Melodic Trap',
      'instruments:Lead Synth',
      'radio-ready',
      'custom-tag',
    ],
    status: 'ready',
  });
});

test('does not require the current presigned URL fingerprint to match a completed record', () => {
  const recovered = resolveTrackAnalysisRecovery(
    { ...track, file_url: 'https://example.com/audio.mp3?signature=new-session' },
    readyRecord,
  );
  assert.equal(recovered?.status, 'ready');
});

test('reflects a canonical analysis failure instead of leaving the track spinning forever', () => {
  assert.deepEqual(
    resolveTrackAnalysisRecovery(track, { ...readyRecord, status: 'error' }),
    { status: 'error' },
  );
});

test('leaves active analysis alone while AWS still reports processing', () => {
  assert.equal(
    resolveTrackAnalysisRecovery(track, { ...readyRecord, status: 'processing' }),
    null,
  );
});

test('does not rewrite tracks that are already ready', () => {
  assert.equal(resolveTrackAnalysisRecovery({ ...track, status: 'ready' }, readyRecord), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Track } from '../types.ts';
import type { MusicIntelligenceProfile } from './musicIntelligenceCore.ts';
import { runUploadedTrackAnalysis } from './backgroundTrackAnalysis.ts';

const track: Track = {
  id: 'track-1',
  name: 'Background Song',
  artist: 'Artist',
  bpm: 0,
  key_signature: 'Analyzing…',
  duration: 180,
  tags: ['Master'],
  status: 'processing',
  size: 1000,
  type: 'audio/wav',
  file_url: 'https://cdn.example.com/song.wav',
  plays: 0,
  likes: 0,
  created_at: '2026-08-30T00:00:00Z',
};

const profile: MusicIntelligenceProfile = {
  version: 'music-intelligence-v1',
  analyzed_at: '2026-08-30T00:01:00Z',
  bpm: 126,
  key: 'C Minor',
  camelot_key: '5A',
  primary_genre: 'Rock',
  genre_confident: true,
  genres: [{ label: 'Rock', score: 0.9 }],
  moods: [{ label: 'Energetic', score: 0.8 }],
  styles: [{ label: 'Alternative', score: 0.7 }],
  instruments: [{ label: 'Electric Guitar', score: 0.8 }],
  sections: [],
  chapters: [],
  keywords: ['anthemic'],
  evidence: {},
  warnings: [],
};

test('uploaded track is released to the library before background analysis finishes', async () => {
  let finishAnalysis: (value: MusicIntelligenceProfile) => void = () => {};
  const pendingAnalysis = new Promise<MusicIntelligenceProfile>((resolve) => {
    finishAnalysis = resolve;
  });
  let uploadCompleted = 0;
  let current = { ...track };

  const backgroundWork = runUploadedTrackAnalysis({
    track,
    onUploadComplete: () => { uploadCompleted += 1; },
    analyze: async () => pendingAnalysis,
    updateTrack: async (_trackId, updates) => {
      current = { ...current, ...updates };
    },
  });

  assert.equal(uploadCompleted, 1);
  assert.equal(current.status, 'processing');

  finishAnalysis(profile);
  const result = await backgroundWork;

  assert.equal(result, 'ready');
  assert.equal(current.status, 'ready');
  assert.equal(current.bpm, 126);
  assert.equal(current.key_signature, 'C Minor (5A)');
});

test('background analysis failure keeps the uploaded track and marks it for retry', async () => {
  let uploadCompleted = 0;
  let current = { ...track };

  const result = await runUploadedTrackAnalysis({
    track,
    onUploadComplete: () => { uploadCompleted += 1; },
    analyze: async () => {
      throw new Error('worker unavailable');
    },
    reportError: () => {},
    updateTrack: async (_trackId, updates) => {
      current = { ...current, ...updates };
    },
  });

  assert.equal(uploadCompleted, 1);
  assert.equal(result, 'error');
  assert.equal(current.status, 'error');
  assert.equal(current.file_url, 'https://cdn.example.com/song.wav');
});

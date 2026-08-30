import test from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../types.ts';
import type { MusicIntelligenceProfile } from './musicIntelligenceCore.ts';

const track: Track = {
  id: 'track-1',
  name: 'AWS Song',
  artist: 'Artist',
  bpm: 0,
  key_signature: '',
  duration: 180,
  tags: ['keep-me'],
  status: 'ready',
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
  primary_genre: 'House',
  genre_confident: true,
  genres: [{ label: 'House', score: 0.9 }],
  moods: [{ label: 'Energetic', score: 0.8 }],
  styles: [{ label: 'Club', score: 0.7 }],
  instruments: [{ label: 'Synth Pad', score: 0.6 }],
  sections: [],
  chapters: [],
  keywords: ['House music'],
  evidence: {},
  warnings: [],
};

test('manual track analysis saves AWS Music Intelligence results to the track', async () => {
  const intelligenceModule = await import('./musicIntelligence.ts');
  const runManualTrackAnalysis = (intelligenceModule as any).runManualTrackAnalysis;

  assert.equal(typeof runManualTrackAnalysis, 'function');

  let current = { ...track };
  const statuses: string[] = [];
  const result = await runManualTrackAnalysis(
    track,
    async (_trackId: string, updates: Partial<Track>) => {
      current = { ...current, ...updates };
      statuses.push(current.status);
    },
    async () => profile,
  );

  assert.equal(result, profile);
  assert.deepEqual(statuses, ['processing', 'ready']);
  assert.equal(current.bpm, 126);
  assert.equal(current.key_signature, 'C Minor (5A)');
  assert.ok(current.tags.includes('keep-me'));
  assert.ok(current.tags.includes('genre_category:House'));
});

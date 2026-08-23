import assert from 'node:assert/strict';
import test from 'node:test';

import type { Track } from '../types.ts';
import type { MusicIntelligenceProfile } from './musicIntelligenceCore.ts';
import {
  DEFAULT_COVER_VARIATION_COUNT,
  buildAlbumCoverDraft,
  trackNeedsCoverPrompt,
} from './albumCoverCore.ts';

const track: Track = {
  id: 'track-1',
  name: 'Midnight Drive',
  artist: 'The Artist Cut',
  bpm: 92,
  key_signature: 'F# Minor',
  duration: 181,
  tags: [
    'genre_category:R&B',
    'mood:Moody',
    'vibe:Late Night',
    'instruments:808 Bass, Electric Piano',
  ],
  status: 'ready',
  size: 1234,
  type: 'audio/mpeg',
  file_url: 'https://cdn.example.com/midnight-drive.mp3',
  file_data: new Blob(['audio'], { type: 'audio/mpeg' }),
  image_url: null,
  plays: 0,
  likes: 0,
  created_at: '2026-08-22T00:00:00Z',
  lyrics: 'City lights keep calling me home',
};

const profile: MusicIntelligenceProfile = {
  version: 'music-intelligence-v1',
  analyzed_at: '2026-08-22T00:00:00Z',
  bpm: 94,
  key: 'F# Minor',
  camelot_key: '11A',
  primary_genre: 'Alternative R&B',
  genre_confident: true,
  genres: [{ label: 'Alternative R&B', score: 0.82 }],
  moods: [{ label: 'Nocturnal', score: 0.77 }],
  styles: [{ label: 'Trap Soul', score: 0.73 }],
  instruments: [
    { label: '808 Bass', score: 0.81 },
    { label: 'Electric Piano', score: 0.66 },
  ],
  sections: [],
  chapters: [],
  keywords: ['night drive', 'neon', 'intimate'],
  evidence: {},
  warnings: [],
};

test('Albumcover Studio defaults to exactly three cover variations', () => {
  assert.equal(DEFAULT_COVER_VARIATION_COUNT, 3);
});

test('buildAlbumCoverDraft prefers saved Music Intelligence while preserving track identity and lyrics', () => {
  const draft = buildAlbumCoverDraft(track, profile);

  assert.equal(draft.trackId, 'track-1');
  assert.equal(draft.title, 'Midnight Drive');
  assert.equal(draft.artist, 'The Artist Cut');
  assert.equal(draft.lyrics, 'City lights keep calling me home');
  assert.equal(draft.genre, 'Alternative R&B');
  assert.equal(draft.mood, 'Nocturnal');
  assert.equal(draft.style, 'Trap Soul');
  assert.equal(draft.bpm, 94);
  assert.equal(draft.key, 'F# Minor (11A)');
  assert.deepEqual(draft.instruments, ['808 Bass', 'Electric Piano']);
  assert.deepEqual(draft.keywords, ['night drive', 'neon', 'intimate']);
});

test('buildAlbumCoverDraft falls back to legacy track tags when no Music Intelligence profile exists', () => {
  const draft = buildAlbumCoverDraft(track, null);

  assert.equal(draft.genre, 'R&B');
  assert.equal(draft.mood, 'Moody');
  assert.equal(draft.style, 'Late Night');
  assert.equal(draft.bpm, 92);
  assert.equal(draft.key, 'F# Minor');
  assert.deepEqual(draft.instruments, ['808 Bass', 'Electric Piano']);
});

test('trackNeedsCoverPrompt returns true only when the track has no usable artwork', () => {
  assert.equal(trackNeedsCoverPrompt(track), true);
  assert.equal(trackNeedsCoverPrompt({ ...track, image_url: 'https://cdn.example.com/cover.png' }), false);
  assert.equal(trackNeedsCoverPrompt({ ...track, image_data: new Blob(['cover'], { type: 'image/png' }) }), false);
});

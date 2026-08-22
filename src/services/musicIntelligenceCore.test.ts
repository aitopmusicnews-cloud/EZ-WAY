import assert from 'node:assert/strict';
import test from 'node:test';

import { profileToLegacyTrackUpdates } from './musicIntelligenceCore.ts';

test('profileToLegacyTrackUpdates preserves custom tags and replaces analyzer tags', () => {
  const profile = {
    version: 'music-intelligence-v1',
    analyzed_at: '2026-08-22T00:00:00Z',
    bpm: 92,
    key: 'F# Minor',
    camelot_key: '11A',
    primary_genre: 'Alternative R&B',
    genre_confident: true,
    genres: [{ label: 'Alternative R&B', score: 0.82 }],
    moods: [{ label: 'Moody', score: 0.77 }],
    styles: [{ label: 'Trap Soul', score: 0.73 }],
    instruments: [{ label: '808 Bass', score: 0.81 }, { label: 'Electric Piano', score: 0.66 }],
    sections: [],
    chapters: [],
    keywords: ['alternative r&b', 'trap soul'],
    evidence: {},
    warnings: [],
  };

  const updates = profileToLegacyTrackUpdates(profile, [
    'Master',
    'genre_category:Old Genre',
    'mood:Old Mood',
    'Master',
  ]);

  assert.equal(updates.bpm, 92);
  assert.equal(updates.key_signature, 'F# Minor (11A)');
  assert.deepEqual(updates.tags, [
    'camelot_key:11A',
    'genre_category:Alternative R&B',
    'mood:Moody',
    'vibe:Trap Soul',
    'instruments:808 Bass, Electric Piano',
    'alternative r&b',
    'trap soul',
    'Master',
  ]);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyManualGenreOverride,
  hasUsableMusicIntelligenceProfile,
  profileToLegacyTrackUpdates,
} from './musicIntelligenceCore.ts';

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
    'trap soul',
    'Master',
  ]);
});

test('profileToLegacyTrackUpdates hides uncertain genre guesses and keeps one verified genre only', () => {
  const profile = {
    version: 'music-intelligence-v1',
    analyzed_at: '2026-08-30T00:00:00Z',
    bpm: 140,
    key: 'F Minor',
    camelot_key: '4A',
    primary_genre: 'Latin Pop',
    genre_confident: false,
    genres: [
      { label: 'Latin Pop', score: 0.51 },
      { label: 'Afrobeats', score: 0.50 },
      { label: 'Boom Bap', score: 0.49 },
    ],
    moods: [],
    styles: [],
    instruments: [],
    sections: [],
    chapters: [],
    keywords: ['Latin Pop', 'Afrobeats', 'Boom Bap', 'club-ready'],
    evidence: {},
    warnings: ['Genre classification is uncertain'],
  };

  const updates = profileToLegacyTrackUpdates(profile, [
    'genre_category:Latin Pop',
    'Latin Pop',
    'Afrobeats',
    'Boom Bap',
    'Master',
  ]);

  assert.equal(updates.tags.some((tag) => tag.startsWith('genre_category:')), false);
  assert.equal(updates.tags.includes('Latin Pop'), false);
  assert.equal(updates.tags.includes('Afrobeats'), false);
  assert.equal(updates.tags.includes('Boom Bap'), false);
  assert.equal(updates.tags.includes('club-ready'), true);
  assert.equal(updates.tags.includes('Master'), true);
});

test('profileToLegacyTrackUpdates keeps a manual Trap override through reanalysis', () => {
  const profile = {
    version: 'music-intelligence-v1',
    analyzed_at: '2026-08-30T00:00:00Z',
    bpm: 140,
    primary_genre: 'Latin Pop',
    genre_confident: true,
    genres: [
      { label: 'Latin Pop', score: 0.72 },
      { label: 'Afrobeats', score: 0.61 },
      { label: 'Boom Bap', score: 0.58 },
    ],
    moods: [],
    styles: [],
    instruments: [],
    sections: [],
    chapters: [],
    keywords: ['Latin Pop', 'Afrobeats', 'Boom Bap'],
    evidence: {},
    warnings: [],
  };

  const updates = profileToLegacyTrackUpdates(profile, [
    'genre_override:Trap',
    'genre_category:Latin Pop',
    'Latin Pop',
    'Afrobeats',
    'Boom Bap',
    'Master',
  ]);

  assert.deepEqual(
    updates.tags.filter((tag) => tag.startsWith('genre_category:')),
    ['genre_category:Trap'],
  );
  assert.equal(updates.tags.includes('genre_override:Trap'), true);
  assert.equal(updates.tags.includes('Latin Pop'), false);
  assert.equal(updates.tags.includes('Afrobeats'), false);
  assert.equal(updates.tags.includes('Boom Bap'), false);
});

test('applyManualGenreOverride replaces old genre metadata without deleting custom tags', () => {
  const tags = applyManualGenreOverride([
    'genre_category:Latin Pop',
    'genre_override:R&B',
    'Latin Pop',
    'Afrobeats',
    'Master',
  ], 'Trap');

  assert.deepEqual(tags, ['Master', 'genre_override:Trap', 'genre_category:Trap']);
});

test('analysis source fingerprint changes when the audio source changes', async () => {
  const { buildAnalysisSourceFingerprint } = await import('./musicIntelligenceCore.ts');
  const first = buildAnalysisSourceFingerprint({ file_url: 'https://cdn/a.wav', size: 100, duration: 180, type: 'audio/wav' });
  const same = buildAnalysisSourceFingerprint({ file_url: 'https://cdn/a.wav', size: 100, duration: 180, type: 'audio/wav' });
  const changed = buildAnalysisSourceFingerprint({ file_url: 'https://cdn/b.wav', size: 100, duration: 180, type: 'audio/wav' });
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test('shouldReuseAnalysis requires ready status, matching fingerprint, and matching version', async () => {
  const { shouldReuseAnalysis } = await import('./musicIntelligenceCore.ts');
  const saved = {
    status: 'ready' as const,
    analyzer_version: 'music-intelligence-v1',
    source_fingerprint: 'abc',
  };
  assert.equal(shouldReuseAnalysis(saved, 'abc', 'music-intelligence-v1'), true);
  assert.equal(shouldReuseAnalysis(saved, 'def', 'music-intelligence-v1'), false);
  assert.equal(shouldReuseAnalysis(saved, 'abc', 'music-intelligence-v2'), false);
  assert.equal(shouldReuseAnalysis({ ...saved, status: 'error' as const }, 'abc', 'music-intelligence-v1'), false);
});

test('hasUsableMusicIntelligenceProfile keeps a prior good profile available after failed re-analysis', () => {
  const goodProfile = {
    version: 'music-intelligence-v1',
    analyzed_at: '2026-08-22T00:00:00Z',
    bpm: 92,
    primary_genre: 'Alternative R&B',
    genre_confident: true,
    genres: [{ label: 'Alternative R&B', score: 0.82 }],
    moods: [],
    styles: [],
    instruments: [],
    sections: [],
    chapters: [],
    keywords: [],
    evidence: {},
    warnings: [],
  };

  const emptyProfile = {
    ...goodProfile,
    bpm: 0,
    primary_genre: 'Unknown',
    genre_confident: false,
    genres: [],
  };

  assert.equal(hasUsableMusicIntelligenceProfile(goodProfile), true);
  assert.equal(hasUsableMusicIntelligenceProfile(emptyProfile), false);
});

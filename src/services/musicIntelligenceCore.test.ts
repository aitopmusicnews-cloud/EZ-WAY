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

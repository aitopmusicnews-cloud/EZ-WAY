import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_MUSIC_INTELLIGENCE_VERSION,
  profileFromDspAnalysis,
} from './localMusicIntelligence.ts';

test('local DSP analysis produces a genre-bearing canonical profile for downstream features', () => {
  const profile = profileFromDspAnalysis({
    bpm: 142,
    key: 'D Minor',
    camelotKey: '7A',
    genreCategory: 'Deep Obsidian Trap / Drill',
    mood: 'Gritty & Menacing',
    vibe: 'Smoky Obsidian Vibe',
    instruments: ['Sliding 808 Sub', 'Rapid Triple Hats', 'Solfeggio Flute'],
    tags: ['Drill', 'Trap', 'Hard-Hitting', 'Active'],
    pitch: 'D',
    spectralMetrics: {
      crestFactor: 7.1,
      brightnessRatio: 0.71,
      tempoConfidence: 0.82,
      keyConfidence: 0.74,
    },
    frequencyBands: {
      subBass: 0.42,
      bass: 0.31,
      midrange: 0.19,
      treble: 0.08,
    },
    loudnessLUFS: -10.2,
    stereoWidth: 61,
    phaseCorrelation: 0.63,
    peakResonanceHz: 36.7,
    tuningNote: 'D1',
    waveformPoints: [0.1, 0.2, 0.15],
  });

  assert.equal(profile.version, LOCAL_MUSIC_INTELLIGENCE_VERSION);
  assert.equal(profile.bpm, 142);
  assert.equal(profile.key, 'D Minor');
  assert.equal(profile.camelot_key, '7A');
  assert.equal(profile.primary_genre, 'Deep Obsidian Trap / Drill');
  assert.equal(profile.genre_confident, true);
  assert.equal(profile.genres[0]?.label, 'Deep Obsidian Trap / Drill');
  assert.ok(profile.genres[0]?.score >= 0.55);
  assert.equal(profile.moods[0]?.label, 'Gritty & Menacing');
  assert.equal(profile.styles[0]?.label, 'Smoky Obsidian Vibe');
  assert.deepEqual(
    profile.instruments.map((item) => item.label),
    ['Sliding 808 Sub', 'Rapid Triple Hats', 'Solfeggio Flute'],
  );
  assert.ok(profile.keywords.includes('Drill'));
  assert.equal(profile.evidence.provider, 'browser-dsp');
});

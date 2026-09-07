import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('MediaStore no longer exposes the legacy local or /api/analyze engines', () => {
  const source = read('src/context/MediaStoreContext.tsx');

  assert.doesNotMatch(source, /analyzeAudioDsp/);
  assert.doesNotMatch(source, /analysisEngine/);
  assert.doesNotMatch(source, /setAnalysisEngine/);
  assert.doesNotMatch(source, /fetch\(['"]\/api\/analyze['"]/);
  assert.doesNotMatch(source, /analyzeTrack:/);
});

test('Edit Metadata re-analysis uses the shared AWS Music Intelligence path', () => {
  const source = read('src/components/EditTrackModal.tsx');

  assert.match(source, /runManualTrackAnalysis/);
  assert.match(source, /profileToLegacyTrackUpdates/);
  assert.doesNotMatch(source, /analyzeTrack/);
  assert.doesNotMatch(source, /Reanalyze Track with Gemini AI/);
  assert.match(source, /Re-Analyze with AWS Music Intelligence/);
});

test('App no longer offers competing local DSP and Gemini analysis engine selectors', () => {
  const source = read('src/App.tsx');

  assert.doesNotMatch(source, /analysisEngine/);
  assert.doesNotMatch(source, /setAnalysisEngine/);
  assert.doesNotMatch(source, /Web Audio DSP \(Local Engine\)/);
  assert.doesNotMatch(source, /Cognitive AI \(Gemini Agent\)/);
  assert.doesNotMatch(source, />Web Audio DSP</);
});

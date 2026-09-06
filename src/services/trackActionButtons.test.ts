import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('track tools Analyze action stays wired to the manual analysis handler', () => {
  const menu = read('../components/TrackOptionsMenu.tsx');
  const app = read('../App.tsx');
  assert.match(menu, /Analyze Track/);
  assert.match(menu, /onClick=\{onAnalyze\}/);
  assert.match(app, /onAnalyze=\{\(\) => handleAnalyzeTrackManual\(track\)\}/);
});

test('analyzer screen Analyze button stays wired to shared Music Intelligence', () => {
  const studio = read('../components/AudioAnalyzerStudio.tsx');
  assert.match(studio, /onClick=\{\(\) => runSharedAnalysis\(true\)\}/);
  assert.match(studio, /analyzeAndPersistTrack\(selectedTrack/);
});

test('metadata Commit button stays wired to save and does not close before save resolves', () => {
  const modal = read('../components/EditTrackModal.tsx');
  assert.match(modal, /const handleSave = async \(\) =>/);
  assert.match(modal, /await onSave\(track\.id, formData\)/);
  assert.match(modal, /onClick=\{handleSave\}/);
});

test('button actions have visible toast feedback instead of silenced console-only messages', () => {
  const store = read('../context/MediaStoreContext.tsx');
  assert.doesNotMatch(store, /Toast Silenced/);
  assert.match(store, /setToasts\(/);
});

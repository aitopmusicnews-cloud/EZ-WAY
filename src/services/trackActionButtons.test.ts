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

test('Lyrics and Stems consumers use the shared Audio Tools facade instead of remote jobs', () => {
  const menu = read('../components/TrackOptionsMenu.tsx');
  const studio = read('../components/AudioAnalyzerStudio.tsx');
  for (const source of [menu, studio]) {
    assert.match(source, /runLocalAudioTool/);
    assert.doesNotMatch(source, /runAudioToolsJob/);
  }
  assert.doesNotMatch(menu, /needs a cloud audio source before/i);
  assert.doesNotMatch(studio, /needs a cloud audio source before synced lyrics/i);
});

test('Lyrics UI clearly uses the local Intel Faster Whisper companion and keeps stems separate', () => {
  const menu = read('../components/TrackOptionsMenu.tsx');
  assert.match(menu, /Extract Lyrics — Local Intel/);
  assert.match(menu, /Local Intel Lyrics/);
  assert.match(menu, /Faster Whisper on your Intel CPU/);
  assert.match(menu, /Stem separation remains a separate tool/);
  assert.match(menu, /Connecting to Local Lyrics Service/);
  assert.match(menu, /Clean lyrics saved to this track/);
  assert.doesNotMatch(menu, /Isolates vocals locally with HTDemucs, then transcribes/);
  assert.doesNotMatch(menu, /transcribes the vocal stem in your browser/);
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

test('track library Filters button applies a real status filter', () => {
  const app = read('../App.tsx');
  assert.match(app, /trackStatusFilter/);
  assert.match(app, /setTrackStatusFilter/);
  assert.match(app, /matchesStatus = trackStatusFilter === "all" \|\| t\.status === trackStatusFilter/);
});

test('message Settings button opens the selected client editor', () => {
  const app = read('../App.tsx');
  assert.match(app, /onClick=\{\(\) => setEditingClient\(activeChatClient\)\}/);
});

test('share link delete button removes its exact link', () => {
  const app = read('../App.tsx');
  assert.match(app, /onClick=\{\(\) => void deleteShareLink\(link\.id\)\}/);
});

test('audio player back, forward, volume, and detail controls are wired', () => {
  const player = read('../components/AudioPlayer.tsx');
  assert.match(player, /onClick=\{skipBack\}/);
  assert.match(player, /onClick=\{skipForward\}/);
  assert.match(player, /onChange=\{\(event\) => setVolume\(Number\(event\.target\.value\)\)\}/);
  assert.match(player, /onClick=\{\(\) => onEdit\?\.\(activeTrack\)\}/);
});

test('shared audio playback refreshes expiring track URLs and never substitutes synthesized audio', () => {
  const context = read('../context/AudioContext.tsx');
  assert.match(context, /refreshTrackAudioSource/);
  assert.match(context, /await refreshTrackAudioSource\(track\)/);
  assert.doesNotMatch(context, /startProceduralSynth/);
  assert.doesNotMatch(context, /Activating dynamic high-fidelity procedural synth/);
});

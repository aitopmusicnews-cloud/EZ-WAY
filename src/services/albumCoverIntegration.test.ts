import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

// Final-head verification: selected tracks must hydrate both source inputs before generation.
// Keep the standalone studio workflow intact while EZ-WAY supplies only its track integration actions.
test('Album Cover Studio preserves the standalone workflow and EZ-WAY actions', () => {
  const component = read('../components/AlbumCoverStudio.tsx');
  const service = read('./albumCoverStudio.ts');

  for (const label of ['Release + source material', 'Generated directions', 'Studio metrics', 'Input versions']) {
    assert.match(component, new RegExp(label.replace(/[+]/g, '\\+')));
  }
  assert.match(component, /Analyze and generate/);
  assert.match(component, /Generate Better/);
  assert.match(component, /Fresh blend/);
  assert.match(component, /Fresh audio path/);
  assert.match(component, /Fresh lyric path/);
  assert.match(component, /Save to EZ-WAY Track/);
  assert.match(service, /collections\/\$\{encodeURIComponent\(collectionId\)\}\/versions/);
  assert.match(service, /collections\/\$\{encodeURIComponent\(collectionId\)\}\/metrics/);
  assert.match(service, /generations\/\$\{encodeURIComponent\(generationId\)\}\/improve/);
  assert.match(service, /generations\/\$\{encodeURIComponent\(generationId\)\}\/retry/);
});

test('selected EZ-WAY track auto-loads its MP3 and saved lyrics into Album Cover Studio', () => {
  const component = read('../components/AlbumCoverStudio.tsx');

  assert.match(component, /loadTrackAudioFile\(selectedTrack\)/);
  assert.match(component, /setAudioFile\(hydratedAudio\)/);
  assert.match(component, /setLyricsText\(selectedTrack\.lyrics \|\| ''\)/);
  assert.match(component, /Auto-loaded EZ-WAY MP3/);
  assert.match(component, /Auto-loaded saved lyrics/);
});

test('global AudioPlayer is scoped to music workspace views instead of every page', () => {
  const app = read('../App.tsx');

  assert.match(app, /const shouldShowGlobalPlayer = \['dashboard', 'tracks', 'playlists'\]\.includes\(activeView\);/);
  assert.match(app, /\{shouldShowGlobalPlayer && <AudioPlayer onEdit=\{\(track\) => setEditingTrack\(track\)\} \/>\}/);
  assert.doesNotMatch(app, /\n\s*<AudioPlayer onEdit=\{\(track\) => setEditingTrack\(track\)\} \/>\n/);
});

test('Edit Metadata contains manual artwork only and no cover-specific Pollinations or Flux generator', () => {
  const modal = read('../components/EditTrackModal.tsx');

  assert.match(modal, />Edit Metadata</);
  assert.doesNotMatch(modal, /enter\.pollinations\.ai|gen\.pollinations\.ai|VITE_POLLINATIONS_CLIENT_ID|pollinationsKeyConnected|flux-realism|flux-anime|handleGenerateAiArt|aiPrompt|aiModel|aiAspect|aiSeed|artStyle/);
  assert.match(modal, /handleDownloadArtwork/);
  assert.match(modal, /imageInputRef/);
  assert.match(modal, /transcribe-lyrics-pollinations/);
});
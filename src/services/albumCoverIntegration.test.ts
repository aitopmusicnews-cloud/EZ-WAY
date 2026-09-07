import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

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

test('Edit Metadata contains manual artwork only and no cover-specific Pollinations or Flux generator', () => {
  const modal = read('../components/EditTrackModal.tsx');

  assert.match(modal, />Edit Metadata</);
  assert.doesNotMatch(modal, /enter\.pollinations\.ai|gen\.pollinations\.ai|VITE_POLLINATIONS_CLIENT_ID|pollinationsKeyConnected|flux-realism|flux-anime|handleGenerateAiArt|aiPrompt|aiModel|aiAspect|aiSeed|artStyle/);
  assert.match(modal, /handleDownloadArtwork/);
  assert.match(modal, /imageInputRef/);
  assert.match(modal, /transcribe-lyrics-pollinations/);
});

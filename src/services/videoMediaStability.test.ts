import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const previewSource = readFileSync(
  new URL('../components/VideoPreviewModal.tsx', import.meta.url),
  'utf8',
);
const makerSource = readFileSync(
  new URL('../components/MusicVideoMaker.tsx', import.meta.url),
  'utf8',
);

test('saved video preview resolves stable video, thumbnail, and track audio keys before use', () => {
  assert.match(previewSource, /resolveMediaAccess/);
  assert.match(previewSource, /video\.video_key/);
  assert.match(previewSource, /video\.thumbnail_key/);
  assert.match(previewSource, /refreshTrackAudioSource/);
  assert.doesNotMatch(previewSource, /src=\{getProxyVideoUrl\(video\.video_url\)\}/);
  assert.doesNotMatch(previewSource, /src=\{track\.file_url\}/);
});

test('Music Video Maker reuses a preloaded background image instead of allocating one every frame', () => {
  const drawStart = makerSource.indexOf('const drawVisualizer =');
  const setupStart = makerSource.indexOf('const setupAudioGraph =', drawStart);
  assert.ok(drawStart >= 0 && setupStart > drawStart, 'drawVisualizer block should exist');
  const drawBlock = makerSource.slice(drawStart, setupStart);

  assert.doesNotMatch(drawBlock, /new Image\(\)/);
  assert.match(makerSource, /backgroundImgRef/);
  assert.match(drawBlock, /backgroundImgRef\.current/);
});

test('Music Video Maker keeps watermark, default cover, and library audio as separate stable sources', () => {
  assert.match(makerSource, /\/ogbeatz_watermark\.jpeg/);
  assert.match(makerSource, /\/ogbeatz_default_cover\.jpeg/);
  assert.match(makerSource, /refreshTrackAudioSource/);
  assert.doesNotMatch(makerSource, /img\.src\s*=\s*['"]\/ogbeatz_logo\.svg['"]/);
});

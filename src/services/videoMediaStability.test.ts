import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const previewSource = readFileSync(
  new URL('../components/VideoPreviewModal.tsx', import.meta.url),
  'utf8',
);
const makerSource = readFileSync(
  new URL('../components/MusicVideoMaker.tsx', import.meta.url),
  'utf8',
);
const brandUrl = new URL('../lib/brandAssets.ts', import.meta.url);
const brandSource = existsSync(brandUrl) ? readFileSync(brandUrl, 'utf8') : '';

test('saved video preview resolves stable video, thumbnail, and track audio keys before use', () => {
  assert.match(previewSource, /resolveMediaAccess/);
  assert.match(previewSource, /video\.video_key/);
  assert.match(previewSource, /video\.thumbnail_key/);
  assert.match(previewSource, /refreshTrackAudioSource/);
  assert.match(previewSource, /resolvedVideoUrl/);
  assert.match(previewSource, /resolvedThumbnailUrl/);
  assert.match(previewSource, /resolvedTrackAudioUrl/);
  assert.match(previewSource, /isVideoSource/);
  assert.doesNotMatch(previewSource, /src=\{getProxyVideoUrl\(video\.video_url\)\}/);
  assert.doesNotMatch(previewSource, /src=\{track\.file_url\}/);
});

test('watermark and default cover have separate centralized brand assets', () => {
  assert.match(brandSource, /WATERMARK_ASSET\s*=\s*['"]\/ogbeatz_watermark\.webp['"]/);
  assert.match(brandSource, /DEFAULT_COVER_ASSET\s*=\s*['"]\/ogbeatz_default_cover\.webp['"]/);
  assert.match(makerSource, /refreshTrackAudioSource/);
  assert.doesNotMatch(makerSource, /img\.src\s*=\s*['"]\/ogbeatz_logo\.svg['"]/);
});

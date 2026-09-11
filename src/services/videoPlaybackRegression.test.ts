import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const videoMakerSource = readFileSync(
  new URL('../components/MusicVideoMaker.tsx', import.meta.url),
  'utf8',
);

test('Video Maker plays AWS media URLs directly instead of the unavailable Amplify proxy', () => {
  assert.doesNotMatch(videoMakerSource, /\/api\/proxy-audio/);
});

test('Video Maker synchronizes the audio element source before calling play', () => {
  const toggleStart = videoMakerSource.indexOf('const togglePreview =');
  const generateStart = videoMakerSource.indexOf('// Real-time video generation', toggleStart);
  assert.ok(toggleStart >= 0 && generateStart > toggleStart, 'togglePreview block should exist');
  const toggleBlock = videoMakerSource.slice(toggleStart, generateStart);

  assert.match(toggleBlock, /getAttribute\(['"]src['"]\)\s*!==\s*resolvedAudioUrl/);
  assert.match(toggleBlock, /\.src\s*=\s*resolvedAudioUrl/);
  assert.match(toggleBlock, /\.load\(\)/);

  const assignIndex = toggleBlock.indexOf('.src = resolvedAudioUrl');
  const playIndex = toggleBlock.indexOf('.play()');
  assert.ok(assignIndex >= 0 && playIndex > assignIndex, 'source assignment must happen before play()');
});

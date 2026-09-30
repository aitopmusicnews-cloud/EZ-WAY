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

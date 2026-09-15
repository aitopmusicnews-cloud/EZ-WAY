import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const audioContextSource = readFileSync(
  new URL('../context/AudioContext.tsx', import.meta.url),
  'utf8',
);

test('resume refreshes an expired keyed track source once before giving up', () => {
  const resumeStart = audioContextSource.indexOf('const resume =');
  const stopStart = audioContextSource.indexOf('const stop =', resumeStart);
  assert.ok(resumeStart >= 0 && stopStart > resumeStart, 'resume block should exist');
  const resumeBlock = audioContextSource.slice(resumeStart, stopStart);

  assert.match(resumeBlock, /refreshTrackAudioSource\(activeTrackRef\.current\)/);
  assert.match(resumeBlock, /resumeRefreshRef\.current/);
  assert.match(resumeBlock, /audio\.src\s*=\s*source/);
  assert.match(resumeBlock, /await\s+audio\.play\(\)/);
});

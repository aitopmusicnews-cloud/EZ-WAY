import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMusicIntelligenceReadBase } from './musicIntelligenceAws.ts';

test('explicit Music Intelligence API wins over the AWS Audio Tools fallback', () => {
  assert.equal(
    resolveMusicIntelligenceReadBase('https://profiles.example.com/track-analysis/', 'https://audio.example.com/'),
    'https://profiles.example.com/track-analysis',
  );
});

test('AWS Audio Tools becomes the canonical read fallback when no explicit profile API is configured', () => {
  assert.equal(
    resolveMusicIntelligenceReadBase('', 'https://audio-tools-api.theartistcut.com/'),
    'https://audio-tools-api.theartistcut.com/track-analysis',
  );
  assert.equal(resolveMusicIntelligenceReadBase('', ''), '');
});

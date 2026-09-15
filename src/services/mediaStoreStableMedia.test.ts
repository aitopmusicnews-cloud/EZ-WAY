import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../context/MediaStoreContext.tsx', import.meta.url),
  'utf8',
);

test('MediaStore renews keyed workspace media without rewriting every image consumer', () => {
  assert.match(source, /refreshWorkspaceMediaSources/);
  assert.match(source, /resolveMediaAccess/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /MEDIA_REFRESH_INTERVAL_MS/);
});

test('MediaStore local cache does not persist signed URLs as durable identity', () => {
  assert.match(source, /sanitizeMediaForCache/);
  assert.match(source, /JSON\.stringify\(sanitizeMediaForCache\(tracks\)\)/);
  assert.match(source, /JSON\.stringify\(sanitizeMediaForCache\(promoVideos\)\)/);
});

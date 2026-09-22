import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../context/MediaStoreContext.tsx', import.meta.url), 'utf8');

test('MediaStoreContext uses the AWS dataStore boundary', () => {
  assert.match(source, /from ['"]@\/src\/services\/dataStore['"]/);
  assert.doesNotMatch(source, /\.from\(['"]/);
});

test('MediaStoreContext initializes owner data through one bootstrap call', () => {
  assert.match(source, /dataStore\.health\(\)/);
  assert.match(source, /dataStore\.bootstrap\(\)/);
  assert.doesNotMatch(source, /ALTER TABLE|createBucket/);
});

test('profile fallback id is accepted by the AWS UUID contract', () => {
  const fallback = source.match(/const PROFILE_FALLBACK:[\s\S]*?id:\s*['"]([^'"]+)['"]/);
  assert.ok(fallback, 'PROFILE_FALLBACK id must be present');

  // Mirrors aws/app-data/api/contract.mjs requireUuid validation.
  const awsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(fallback[1], awsUuid);
});

test('MediaStoreContext preserves public share and upload component contracts', () => {
  assert.match(source, /getShareContent: \(token: string\)/);
  assert.match(source, /uploadFile: \(bucket: string, file: File\) => Promise<string \| null>/);
  assert.match(source, /dataStore\.getPublicShare\(token\)/);
  assert.match(source, /pendingMediaKeys/);
});

test('MediaStoreContext preserves the original AWS media upload failure for the caller', () => {
  const uploadFileStart = source.indexOf('const uploadFile = async');
  const uploadFileEnd = source.indexOf('const handleSetEnableMockData', uploadFileStart);
  const uploadFileSource = source.slice(uploadFileStart, uploadFileEnd);
  assert.match(uploadFileSource, /throw error;/);
});

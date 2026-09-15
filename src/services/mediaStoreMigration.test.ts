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

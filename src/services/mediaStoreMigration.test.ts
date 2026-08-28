import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../context/MediaStoreContext.tsx', import.meta.url), 'utf8');

test('MediaStoreContext uses the AWS dataStore boundary instead of Supabase', () => {
  assert.match(source, /from ['"]@\/src\/services\/dataStore['"]/);
  assert.doesNotMatch(source, /getSupabaseClient|@supabase\/supabase-js|\.from\(['"]/);
});

test('MediaStoreContext initializes owner data through one bootstrap call', () => {
  assert.match(source, /dataStore\.health\(\)/);
  assert.match(source, /dataStore\.bootstrap\(\)/);
  assert.doesNotMatch(source, /Seeding .*Supabase|ALTER TABLE|createBucket/);
});

test('MediaStoreContext preserves public share and upload component contracts', () => {
  assert.match(source, /getShareContent: \(token: string\)/);
  assert.match(source, /uploadFile: \(bucket: string, file: File\) => Promise<string \| null>/);
  assert.match(source, /dataStore\.getPublicShare\(token\)/);
  assert.match(source, /pendingMediaKeys/);
});

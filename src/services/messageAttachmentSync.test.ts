import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('message model exposes generic attachment metadata', () => {
  const types = read('../types.ts');
  assert.match(types, /attachment_url\?: string \| null/);
  assert.match(types, /attachment_key\?: string \| null/);
  assert.match(types, /attachment_name\?: string \| null/);
  assert.match(types, /attachment_type\?: string \| null/);
  assert.match(types, /attachment_size\?: number \| null/);
});

test('data store exposes token-scoped message refresh without reloading the full share', () => {
  const dataStore = read('./dataStore.ts');
  assert.match(dataStore, /getPublicShareMessages/);
  assert.match(dataStore, /\/public\/share\/\$\{encoded\(token\)\}\/messages/);
});

test('public client portal polls for new admin messages while open', () => {
  const portal = read('../components/SharePortal.tsx');
  assert.match(portal, /getPublicShareMessages/);
  assert.match(portal, /setInterval\(/);
  assert.match(portal, /attachment_url/);
  assert.match(portal, /download/);
});

test('admin message composer accepts general files and renders downloadable attachments', () => {
  const app = read('../App.tsx');
  assert.doesNotMatch(app, /ref=\{chatImageInputRef\}[\s\S]{0,180}accept="image\/\*"/);
  assert.match(app, /attachment_name/);
  assert.match(app, /attachment_url/);
  assert.match(app, /download/);
});

test('media store can send generic attachment metadata instead of image-only messages', () => {
  const store = read('../context/MediaStoreContext.tsx');
  assert.match(store, /attachment_url/);
  assert.match(store, /attachment_name/);
  assert.match(store, /attachment_type/);
  assert.match(store, /attachment_size/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildObjectKey, normalizeUploadRequest } from './storage.mjs';

test('audio upload gets a server-owned key', () => {
  const key = buildObjectKey({ category: 'tracks', relatedId: 't1', filename: 'master.wav' });
  assert.match(key, /^tracks\/audio\/t1\/[0-9a-f-]+-master\.wav$/i);
});

test('unsafe filenames are rejected', () => {
  assert.throws(
    () => buildObjectKey({ category: 'tracks', relatedId: 't1', filename: '../secret' }),
    /filename/i,
  );
});

test('category content family and size limits are enforced', () => {
  assert.throws(() => normalizeUploadRequest({
    category: 'artwork', relatedId: 't1', filename: 'x.exe', contentType: 'application/octet-stream', size: 100,
  }), /content type/i);
  assert.throws(() => normalizeUploadRequest({
    category: 'artwork', relatedId: 't1', filename: 'cover.png', contentType: 'image/png', size: 21 * 1024 * 1024,
  }), /size/i);
});

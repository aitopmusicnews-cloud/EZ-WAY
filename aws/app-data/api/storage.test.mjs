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

test('message attachments accept arbitrary file types up to 100 MB', () => {
  const executable = normalizeUploadRequest({
    category: 'message-attachment',
    relatedId: 'm1',
    filename: 'notes.bin',
    contentType: 'application/octet-stream',
    size: 100 * 1024 * 1024,
  });
  assert.equal(executable.contentType, 'application/octet-stream');
  assert.match(
    buildObjectKey(executable),
    /^messages\/attachments\/m1\/[0-9a-f-]+-notes\.bin$/i,
  );
  assert.throws(() => normalizeUploadRequest({
    category: 'message-attachment',
    relatedId: 'm1',
    filename: 'too-large.zip',
    contentType: 'application/zip',
    size: 100 * 1024 * 1024 + 1,
  }), /size/i);
});

test('message attachments normalize missing browser MIME types safely', () => {
  const input = normalizeUploadRequest({
    category: 'message-attachment',
    relatedId: 'm1',
    filename: 'unknown.custom',
    contentType: '',
    size: 42,
  });
  assert.equal(input.contentType, 'application/octet-stream');
});

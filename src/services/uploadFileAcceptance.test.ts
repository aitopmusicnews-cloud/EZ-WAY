import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyUploadFile } from './uploadFileAcceptance.ts';

const fakeFile = (name: string, type = '') => ({ name, type } as File);

test('dragged WAV/MP3 files are accepted even when the browser omits MIME type', () => {
  assert.equal(classifyUploadFile(fakeFile('Master.WAV')), 'audio');
  assert.equal(classifyUploadFile(fakeFile('single.mp3')), 'audio');
});

test('generic MIME audio files are accepted by extension fallback', () => {
  assert.equal(classifyUploadFile(fakeFile('mix.flac', 'application/octet-stream')), 'audio');
  assert.equal(classifyUploadFile(fakeFile('mix.m4a', 'application/octet-stream')), 'audio');
});

test('artwork and lyric files keep their existing classifications', () => {
  assert.equal(classifyUploadFile(fakeFile('cover.PNG')), 'image');
  assert.equal(classifyUploadFile(fakeFile('lyrics.LRC')), 'lyrics');
  assert.equal(classifyUploadFile(fakeFile('notes.txt', 'text/plain')), 'lyrics');
});

test('unsupported files are rejected', () => {
  assert.equal(classifyUploadFile(fakeFile('archive.zip')), 'unsupported');
});

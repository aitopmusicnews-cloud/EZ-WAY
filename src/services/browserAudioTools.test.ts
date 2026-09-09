import assert from 'node:assert/strict';
import test from 'node:test';

import type { Track } from '../types.ts';
import { runLocalAudioTool } from './browserAudioTools.ts';
import { trackHasUsableAudioSource } from './trackAudioSource.ts';

const baseTrack: Track = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Local Song',
  artist: 'OGBeatz',
  bpm: 100,
  key_signature: 'A Minor',
  duration: 4,
  tags: [],
  status: 'ready',
  size: 4,
  type: 'audio/wav',
  file_url: null,
  file_data: new Blob(['song'], { type: 'audio/wav' }),
  plays: 0,
  likes: 0,
  created_at: '2026-09-08T00:00:00.000Z',
};

const fakeStereo = () => ({
  left: new Float32Array([0, 0.1, -0.1, 0]),
  right: new Float32Array([0, 0.1, -0.1, 0]),
  sampleRate: 44100,
});

const baseDeps = () => ({
  refreshSource: async (track: Track) => track,
  loadSourceFile: async () => new File(['song'], 'Local-Song.wav', { type: 'audio/wav' }),
  decodeLyrics: async () => ({ pcm: new Float32Array([0, 0.1, 0]), sampleRate: 16000 }),
  transcribe: async () => ({
    language: 'en',
    language_probability: 0.99,
    chunks: [{ text: 'Hello world', timestamp: [0, 1.5] as [number, number] }],
  }),
  decodeStems: async () => fakeStereo(),
  separate: async () => ({
    vocals: fakeStereo(),
    drums: fakeStereo(),
    bass: fakeStereo(),
    other: fakeStereo(),
  }),
  createObjectUrl: (file: File) => `blob:local/${file.name}`,
  uploadFile: undefined,
});

test('a local file_data source is sufficient even without a cloud URL', () => {
  assert.equal(trackHasUsableAudioSource(baseTrack), true);
  assert.equal(trackHasUsableAudioSource({ ...baseTrack, file_data: undefined, file_url: null }), false);
});

test('browser lyrics returns timestamped lyrics and local LRC/plain downloads', async () => {
  const progress: string[] = [];
  const result = await runLocalAudioTool(
    baseTrack,
    'lyrics',
    undefined,
    (message) => progress.push(message),
    baseDeps(),
  );

  assert.equal(result.status, 'completed');
  assert.equal(result.action, 'lyrics');
  assert.equal(result.lyrics, '[00:00.00] Hello world');
  assert.match(result.files?.lrc || '', /^blob:local\//);
  assert.match(result.files?.plain || '', /^blob:local\//);
  assert.ok(progress.some((message) => /transcrib/i.test(message)));
});

test('browser lyrics rejects an empty transcript instead of replacing lyrics with invented text', async () => {
  const deps = baseDeps();
  deps.transcribe = async () => ({ language: null, language_probability: null, chunks: [] });
  await assert.rejects(
    () => runLocalAudioTool(baseTrack, 'lyrics', undefined, undefined, deps),
    /no reliable lyrics/i,
  );
});

test('vocals_instrumental derives the no-vocal mix and returns a ZIP bundle', async () => {
  const result = await runLocalAudioTool(baseTrack, 'stems', 'vocals_instrumental', undefined, baseDeps());
  assert.equal(result.status, 'completed');
  assert.equal(result.mode, 'vocals_instrumental');
  assert.deepEqual(Object.keys(result.files || {}).sort(), ['instrumental', 'vocals']);
  assert.match(result.bundle_url || '', /^blob:local\//);
});

test('full separation returns vocals, drums, bass, other and a ZIP bundle', async () => {
  const result = await runLocalAudioTool(baseTrack, 'stems', 'full', undefined, baseDeps());
  assert.deepEqual(Object.keys(result.files || {}).sort(), ['bass', 'drums', 'other', 'vocals']);
  assert.match(result.bundle_url || '', /^blob:local\//);
});

test('successful local processing survives an AWS output upload failure with a warning', async () => {
  const deps = baseDeps();
  deps.uploadFile = async () => { throw new Error('cloud save unavailable'); };
  const result = await runLocalAudioTool(baseTrack, 'lyrics', undefined, undefined, deps);
  assert.match(result.files?.lrc || '', /^blob:local\//);
  assert.match(result.warning || '', /cloud save/i);
});

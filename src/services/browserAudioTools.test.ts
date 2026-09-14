import assert from 'node:assert/strict';
import test from 'node:test';

import type { Track } from '../types.ts';
import {
  runLocalAudioTool,
  type BrowserAudioToolsDependencies,
} from './browserAudioTools.ts';
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

const fakeStereo = (value = 0.1) => ({
  left: new Float32Array([0, value, -value, 0]),
  right: new Float32Array([0, value, -value, 0]),
  sampleRate: 44100,
});

const baseDeps = (): BrowserAudioToolsDependencies => ({
  refreshSource: async (track: Track) => track,
  loadSourceFile: async () => new File(['song'], 'Local-Song.wav', { type: 'audio/wav' }),
  transcribeFile: async () => ({
    text: 'Hello world',
    language: 'en',
    language_probability: 0.99,
    segments: [{ start: 0, end: 1.5, text: 'Hello world' }],
  }),
  decodeStems: async () => fakeStereo(),
  separate: async () => ({
    vocals: fakeStereo(0.9),
    drums: fakeStereo(0.2),
    bass: fakeStereo(0.3),
    other: fakeStereo(0.4),
  }),
  createObjectUrl: (file: File) => `blob:local/${file.name}`,
  uploadFile: undefined,
} as BrowserAudioToolsDependencies);

test('a local file_data source is sufficient even without a cloud URL', () => {
  assert.equal(trackHasUsableAudioSource(baseTrack), true);
  assert.equal(trackHasUsableAudioSource({ ...baseTrack, file_data: undefined, file_url: null }), false);
});

test('lyrics uses the original file with the local service and returns clean text plus LRC/plain downloads', async () => {
  const calls: string[] = [];
  const progress: string[] = [];
  const deps = baseDeps();
  deps.decodeStems = async () => { throw new Error('lyrics must not decode stems'); };
  deps.separate = async () => { throw new Error('lyrics must not run Demucs'); };
  deps.transcribeFile = async (file: File) => {
    calls.push(file.name);
    return {
      text: 'Hello world',
      language: 'en',
      language_probability: 0.99,
      segments: [{ start: 0, end: 1.5, text: 'Hello world' }],
    };
  };

  const result = await runLocalAudioTool(
    baseTrack,
    'lyrics',
    undefined,
    (message) => progress.push(message),
    deps,
  );

  assert.equal(result.status, 'completed');
  assert.equal(result.action, 'lyrics');
  assert.equal(result.lyrics, 'Hello world');
  assert.deepEqual(calls, ['Local-Song.wav']);
  assert.match(result.files?.lrc || '', /^blob:local\//);
  assert.match(result.files?.plain || '', /^blob:local\//);
  assert.ok(progress.some((message) => /local lyrics|transcrib/i.test(message)));
  assert.equal(progress.some((message) => /demucs|vocal isolation/i.test(message)), false);
});

test('lyrics builds timestamped LRC content from returned local-service segments', async () => {
  const deps = baseDeps();
  const captured: File[] = [];
  deps.transcribeFile = async () => ({
    text: 'First line\nSecond line',
    language: 'en',
    language_probability: 0.97,
    segments: [
      { start: 0, end: 1.2, text: 'First line' },
      { start: 2.34, end: 3.8, text: 'Second line' },
    ],
  });
  deps.createObjectUrl = (file: File) => {
    captured.push(file);
    return `blob:local/${file.name}`;
  };

  const result = await runLocalAudioTool(baseTrack, 'lyrics', undefined, undefined, deps);

  assert.equal(result.lyrics, 'First line\nSecond line');
  const lrc = captured.find((file) => file.name.endsWith('.lrc'));
  assert.ok(lrc);
  assert.equal(await lrc!.text(), '[00:00.00] First line\n[00:02.34] Second line\n');
});

test('lyrics rejects an empty local transcript instead of replacing existing lyrics', async () => {
  const deps = baseDeps();
  deps.transcribeFile = async () => ({
    text: '',
    language: null,
    language_probability: null,
    segments: [],
  });
  await assert.rejects(
    () => runLocalAudioTool(baseTrack, 'lyrics', undefined, undefined, deps),
    /no reliable lyrics/i,
  );
});

test('vocals_instrumental still derives the no-vocal mix and returns a ZIP bundle', async () => {
  const result = await runLocalAudioTool(baseTrack, 'stems', 'vocals_instrumental', undefined, baseDeps());
  assert.equal(result.status, 'completed');
  assert.equal(result.mode, 'vocals_instrumental');
  assert.deepEqual(Object.keys(result.files || {}).sort(), ['instrumental', 'vocals']);
  assert.match(result.bundle_url || '', /^blob:local\//);
});

test('full separation still returns vocals, drums, bass, other and a ZIP bundle', async () => {
  const result = await runLocalAudioTool(baseTrack, 'stems', 'full', undefined, baseDeps());
  assert.deepEqual(Object.keys(result.files || {}).sort(), ['bass', 'drums', 'other', 'vocals']);
  assert.match(result.bundle_url || '', /^blob:local\//);
});

test('successful local lyric processing survives an output upload failure with a warning', async () => {
  const deps = baseDeps();
  deps.uploadFile = async () => { throw new Error('cloud save unavailable'); };
  const result = await runLocalAudioTool(baseTrack, 'lyrics', undefined, undefined, deps);
  assert.equal(result.lyrics, 'Hello world');
  assert.match(result.files?.lrc || '', /^blob:local\//);
  assert.match(result.warning || '', /cloud save/i);
});

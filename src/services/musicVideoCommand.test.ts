import assert from 'node:assert/strict';
import test from 'node:test';
import { musicVideoCommand, musicVideoFilename, validateMusicVideoFiles } from './musicVideoCommand.ts';

test('MP4 conversion maps song audio explicitly and renders until the song ends', () => {
  const args = musicVideoCommand('cover.png', 'audio.mp3');
  assert.deepEqual(args.filter((_, i) => args[i - 1] === '-map'), ['0:v:0', '1:a:0']);
  assert.ok(args.includes('-shortest'));
  assert.ok(!args.includes('-t'));
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
  assert.ok(args.includes('yuv420p'));
  assert.equal(args.at(-1), 'output.mp4');
});

test('validates uploaded formats, empty files, and memory limits before loading WASM', () => {
  const image = new File(['image'], 'cover.PNG');
  const audio = new File(['song'], 'track.MP3');
  assert.doesNotThrow(() => validateMusicVideoFiles(image, audio));
  assert.throws(() => validateMusicVideoFiles(new File(['bad'], 'bad.svg'), audio), /JPG or PNG/);
  assert.throws(() => validateMusicVideoFiles(image, new File([], 'empty.wav')), /empty/);
  assert.throws(() => validateMusicVideoFiles(image, {name: 'big.wav', size: 251 * 1024 * 1024} as File), /250 MB/);
});

test('download uses the audio filename with a real MP4 extension', () => {
  assert.equal(musicVideoFilename('Bay Swag.mp3'), 'Bay Swag.mp4');
  assert.equal(musicVideoFilename('song:demo.wav'), 'song_demo.mp4');
});

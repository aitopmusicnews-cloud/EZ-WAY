import assert from 'node:assert/strict';
import test from 'node:test';
import { musicVideoCommand, musicVideoFilename, validateMusicVideoFiles, DEFAULT_VIDEO_OPTIONS, VIDEO_PRESETS, buildVideoLyrics } from './musicVideoCommand.ts';

test('MP4 conversion maps song audio explicitly and renders until the song ends', () => {
  const args = musicVideoCommand('cover.png', 'audio.mp3');
  assert.deepEqual(args.filter((_, i) => args[i - 1] === '-map'), ['[base]', '1:a:0']);
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


test('social sizes preserve artwork and cap clips at the song duration', () => {
  for (const preset of Object.keys(VIDEO_PRESETS) as Array<keyof typeof VIDEO_PRESETS>) {
    const options = { ...DEFAULT_VIDEO_OPTIONS, preset, duration: 60 };
    const args = musicVideoCommand('cover.png', 'song.wav', options, 12);
    assert.equal(args[args.indexOf('-t') + 1], '12');
    const { width, height } = VIDEO_PRESETS[preset];
    assert.ok(args[args.indexOf('-filter_complex') + 1].includes(`pad=${width}:${height}`));
  }
});

test('all overlays are composed onto the video without replacing song audio', () => {
  const args = musicVideoCommand('cover.png', 'song.wav', {
    ...DEFAULT_VIDEO_OPTIONS, watermark: true, soundwave: true, lyrics: '[00:00] Hello',
  }, 180);
  const filters = args[args.indexOf('-filter_complex') + 1];
  assert.match(filters, /showwaves/);
  assert.match(filters, /colorchannelmixer/);
  assert.match(filters, /ass=lyrics.ass:fontsdir=fonts/);
  assert.deepEqual(args.filter((_, i) => args[i - 1] === '-map'), ['[subtitled]', '1:a:0']);
  assert.equal(args[args.indexOf('-t') + 1], '180');
});

test('LRC captions use their timestamps and stop at the clip boundary', () => {
  const ass = buildVideoLyrics({ ...DEFAULT_VIDEO_OPTIONS, lyrics: '[00:01] Hello\n[00:03] Goodbye\n[00:08] Too late' }, 5);
  assert.match(ass, /0:00:01.00,0:00:03.00/);
  assert.match(ass, /0:00:03.00,0:00:05.00/);
  assert.doesNotMatch(ass, /Too late/);
  assert.throws(() => buildVideoLyrics({ ...DEFAULT_VIDEO_OPTIONS, lyrics: 'Untimed text' }, 5), /timestamps/);
  assert.throws(() => buildVideoLyrics({ ...DEFAULT_VIDEO_OPTIONS, lyrics: '[00:10] Late' }, 5), /No timed lyrics/);
});

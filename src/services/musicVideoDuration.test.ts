import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { readMusicVideoDuration } from './musicVideoDuration.ts';

test('accepts valid duration output even when WASM retains the -1 status', async () => {
  assert.equal(await readMusicVideoDuration({ ffprobe: async () => -1, readFile: async () => '123.456\n' }, 'audio.mp3'), 123.456);
});

test('still rejects empty, unavailable, invalid, and nonpositive durations', async () => {
  for (const output of ['', 'N/A', 'Infinity', '0', '-1', 'bad']) {
    await assert.rejects(readMusicVideoDuration({ ffprobe: async () => -1, readFile: async () => output }, 'audio.wav'), /Could not read/);
  }
});

test('reads an actual WAV through the installed FFmpeg WASM core and worker reset sequence', async () => {
  const require = createRequire(import.meta.url);
  const previousSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { value: { location: { href: 'file:///ffmpeg-core.js' } }, configurable: true });
  try {
    const core = await require('@ffmpeg/core')({ wasmBinary: readFileSync(require.resolve('@ffmpeg/core/wasm')) });
    // A one-second PCM WAV. No external fixtures or ffmpeg installation needed.
    const pcm = Buffer.alloc(44 + 16000);
    pcm.write('RIFF'); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
    pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
    pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28);
    pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
    pcm.write('data', 36); pcm.writeUInt32LE(16000, 40);
    core.FS.writeFile('audio.wav', pcm);
    const duration = await readMusicVideoDuration({
      ffprobe: async args => { core.ffprobe(...args); const status = core.ret; core.reset(); return status; },
      readFile: async path => core.FS.readFile(path, { encoding: 'utf8' }),
    }, 'audio.wav');
    assert.equal(duration, 1);
  } finally {
    if (previousSelf) Object.defineProperty(globalThis, 'self', previousSelf);
    else Reflect.deleteProperty(globalThis, 'self');
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeStereoWav } from './wav.ts';

test('encodeStereoWav writes a valid stereo PCM RIFF header', async () => {
  const blob = encodeStereoWav(
    new Float32Array([0, 0.5, -0.5, 1]),
    new Float32Array([0, -0.5, 0.5, -1]),
    44100,
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const view = new DataView(bytes.buffer);

  assert.equal(blob.type, 'audio/wav');
  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(ascii(36, 4), 'data');
  assert.equal(view.getUint32(40, true), 16);
});

test('encodeStereoWav rejects channel length mismatches', () => {
  assert.throws(
    () => encodeStereoWav(new Float32Array([0]), new Float32Array([0, 1]), 44100),
    /same length/i,
  );
});

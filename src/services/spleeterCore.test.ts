import assert from 'node:assert/strict';
import test from 'node:test';

import {
  periodicHann,
  normalizeStemMasks,
  extendMaskByAverage,
} from './spleeterCore.ts';
import {
  DEMUCS_SAMPLE_RATE,
  DEMUCS_SEGMENT_SAMPLES,
  DEMUCS_OVERLAP_SAMPLES,
  DEMUCS_STRIDE_SAMPLES,
  DEMUCS_STEMS,
  createDemucsWindow,
  extractDemucsStemRows,
} from './demucsCore.ts';

test('periodicHann matches the periodic 4-sample Spleeter window', () => {
  const window = periodicHann(4);
  assert.equal(window.length, 4);
  assert.ok(Math.abs(window[0] - 0) < 1e-8);
  assert.ok(Math.abs(window[1] - 0.5) < 1e-8);
  assert.ok(Math.abs(window[2] - 1) < 1e-8);
  assert.ok(Math.abs(window[3] - 0.5) < 1e-8);
});

test('normalizeStemMasks makes four positive masks sum to one per bin', () => {
  const result = normalizeStemMasks([
    new Float32Array([1, 2]),
    new Float32Array([1, 1]),
    new Float32Array([2, 1]),
    new Float32Array([0, 4]),
  ]);

  for (let bin = 0; bin < 2; bin += 1) {
    const total = result.reduce((sum, mask) => sum + mask[bin], 0);
    assert.ok(Math.abs(total - 1) < 1e-6);
  }
});

test('extendMaskByAverage preserves modeled bins and fills high bins with their average', () => {
  const extended = extendMaskByAverage(new Float32Array([0.25, 0.75]), 5);
  assert.deepEqual(Array.from(extended.slice(0, 2)), [0.25, 0.75]);
  assert.deepEqual(Array.from(extended.slice(2)), [0.5, 0.5, 0.5]);
});

test('HTDemucs browser constants match the 4-stem ONNX contract', () => {
  assert.equal(DEMUCS_SAMPLE_RATE, 44100);
  assert.equal(DEMUCS_SEGMENT_SAMPLES, 343980);
  assert.equal(DEMUCS_OVERLAP_SAMPLES, Math.floor(343980 / 4));
  assert.equal(DEMUCS_STRIDE_SAMPLES, 343980 - Math.floor(343980 / 4));
  assert.deepEqual(DEMUCS_STEMS, ['drums', 'bass', 'other', 'vocals']);
});

test('createDemucsWindow fades overlap edges and leaves the middle at full weight', () => {
  const window = createDemucsWindow(8, 2);
  assert.deepEqual(Array.from(window), [0, 0.5, 1, 1, 1, 1, 0.5, 0]);
});

test('extractDemucsStemRows reads channel-major rows from four-stem output', () => {
  const segmentSamples = 3;
  const channels = 2;
  const values = new Float32Array(4 * channels * segmentSamples);
  for (let index = 0; index < values.length; index += 1) values[index] = index;

  const vocals = extractDemucsStemRows(values, 3, channels, segmentSamples);
  assert.deepEqual(Array.from(vocals[0]), [18, 19, 20]);
  assert.deepEqual(Array.from(vocals[1]), [21, 22, 23]);
});

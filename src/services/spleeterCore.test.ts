import assert from 'node:assert/strict';
import test from 'node:test';

import {
  periodicHann,
  normalizeStemMasks,
  extendMaskByAverage,
} from './spleeterCore.ts';

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

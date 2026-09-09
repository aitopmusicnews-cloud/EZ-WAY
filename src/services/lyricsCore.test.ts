import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLyricsFiles, formatLrcTime } from './lyricsCore.ts';

test('formatLrcTime formats minutes, seconds, and centiseconds', () => {
  assert.equal(formatLrcTime(0), '[00:00.00]');
  assert.equal(formatLrcTime(65.239), '[01:05.24]');
  assert.equal(formatLrcTime(-4), '[00:00.00]');
});

test('buildLyricsFiles creates timestamped and plain lyrics without blank chunks', () => {
  const result = buildLyricsFiles([
    { text: '  First line  ', timestamp: [0, 2.2] },
    { text: '   ', timestamp: [2.2, 3] },
    { text: 'Second line', timestamp: [61.5, 64] },
  ]);

  assert.equal(result.lyrics, '[00:00.00] First line\n[01:01.50] Second line');
  assert.equal(result.plain, 'First line\nSecond line');
});

test('buildLyricsFiles returns empty strings when no reliable text exists', () => {
  const result = buildLyricsFiles([{ text: ' ', timestamp: [0, 1] }]);
  assert.equal(result.lyrics, '');
  assert.equal(result.plain, '');
});

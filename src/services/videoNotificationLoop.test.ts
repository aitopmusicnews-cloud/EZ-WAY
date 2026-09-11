import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mediaStoreSource = readFileSync(new URL('../context/MediaStoreContext.tsx', import.meta.url), 'utf8');

test('MediaStore keeps addToast stable so Video Maker does not retrigger its loaded-track notification', () => {
  const addToastStart = mediaStoreSource.indexOf('const addToast =');
  const removeToastStart = mediaStoreSource.indexOf('const removeToast =', addToastStart);

  assert.notEqual(addToastStart, -1, 'addToast implementation must exist');
  assert.notEqual(removeToastStart, -1, 'removeToast implementation must follow addToast');

  const addToastBlock = mediaStoreSource.slice(addToastStart, removeToastStart);
  assert.match(
    addToastBlock,
    /const addToast = useCallback\(/,
    'addToast must be memoized with useCallback so toast state updates do not change its identity',
  );
  assert.match(
    addToastBlock,
    /\},\s*\[\]\s*\);/s,
    'addToast should have no reactive dependencies',
  );
});

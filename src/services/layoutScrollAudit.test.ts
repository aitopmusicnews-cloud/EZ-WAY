import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssPath = fileURLToPath(new URL('../index.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

test('the document viewport is locked so the app owns vertical scrolling', () => {
  assert.match(
    css,
    /html\s*,\s*body\s*,\s*#root\s*\{[^}]*height\s*:\s*100%\s*;[^}]*overflow\s*:\s*hidden\s*;/s,
    'html, body, and #root must be height: 100% with overflow hidden',
  );
});

test('main content can shrink inside the fixed viewport before scrolling', () => {
  assert.match(
    css,
    /main\s*\{[^}]*min-height\s*:\s*0\s*;/s,
    'main must use min-height: 0 so its own overflow-y-auto scrollbar can fit the viewport',
  );
});

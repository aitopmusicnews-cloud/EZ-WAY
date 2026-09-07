import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('external share actions use browser-safe web flows', () => {
  const modal = read('../components/ShareModal.tsx');

  assert.doesNotMatch(modal, /mailto:/);
  assert.doesNotMatch(modal, /fb-messenger:\/\//);
  assert.doesNotMatch(modal, /window\.open\(/);
  assert.match(modal, /https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1/);
  assert.match(modal, /https:\/\/wa\.me\/\?text=/);
  assert.match(modal, /https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
  assert.match(modal, /navigator\.share/);
});

test('public share payload includes owner outbound messages for two-way portal messaging', () => {
  const handler = read('../../aws/app-data/api/handler.mjs');
  assert.doesNotMatch(handler, /AND direction = 'inbound'/);
  assert.match(handler, /SELECT \* FROM messages WHERE client_id = CAST\(:client_id AS uuid\) ORDER BY timestamp ASC/);
});

test('share portal renders both owner messages and client replies', () => {
  const portal = read('../components/SharePortal.tsx');
  assert.match(portal, /conversationMessages/);
  assert.match(portal, /message\.direction === 'outbound'/);
  assert.match(portal, /message\.direction === 'inbound'/);
});

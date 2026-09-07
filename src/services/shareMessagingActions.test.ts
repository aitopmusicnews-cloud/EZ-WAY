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

// Keep Gmail as a native _top link: it must escape any app/browser shell without using popup or scripted navigation.
test('Gmail share uses a native top-level link', () => {
  const modal = read('../components/ShareModal.tsx');

  assert.match(modal, /href=\{gmailShareUrl\}/);
  assert.match(modal, /target="_top"/);
  assert.doesNotMatch(modal, /const handleGmailShare = \(\) =>/);
  assert.doesNotMatch(modal, /window\.location\.assign\(gmailShareUrl\)/);
  assert.doesNotMatch(modal, /href=\{gmailShareUrl\}[\s\S]{0,240}target="_blank"/);
});

test('public share payload includes owner outbound messages for two-way portal messaging', () => {
  const handler = read('../../aws/app-data/api/handler.mjs');
  assert.doesNotMatch(handler, /AND direction = 'inbound'/);
  assert.match(handler, /SELECT \* FROM messages WHERE client_id = CAST\(:client_id AS uuid\) ORDER BY timestamp ASC/);
});

test('public portal refreshes messages without reloading the share payload', () => {
  const handler = read('../../aws/app-data/api/handler.mjs');
  const portal = read('../components/SharePortal.tsx');
  const dataStore = read('./dataStore.ts');

  assert.match(handler, /\/public\/share\/\[\^\/\]\+\\\/messages/);
  assert.match(dataStore, /getPublicShareMessages/);
  assert.match(portal, /getPublicShareMessages\(shareLink\.token\)/);
  assert.match(portal, /setInterval\(refreshMessages, 5000\)/);
});

test('message refresh path does not increment share access count', () => {
  const handler = read('../../aws/app-data/api/handler.mjs');
  const messageRouteIndex = handler.indexOf("rawPath.match(/^\\/public\\/share\\/[^/]+\\/messages$/)");
  const shareRouteIndex = handler.indexOf("rawPath.startsWith('/public/share/')");
  assert.ok(messageRouteIndex >= 0 && shareRouteIndex > messageRouteIndex);
  const messageRoute = handler.slice(messageRouteIndex, shareRouteIndex);
  assert.doesNotMatch(messageRoute, /access_count/);
});

test('share portal renders both owner messages and client replies', () => {
  const portal = read('../components/SharePortal.tsx');
  assert.match(portal, /conversationMessages/);
  assert.match(portal, /message\.direction === 'outbound'/);
  assert.match(portal, /message\.direction === 'inbound'/);
});

test('admin and client messaging accept general files instead of image-only attachments', () => {
  const app = read('../App.tsx');
  const portal = read('../components/SharePortal.tsx');
  const context = read('../context/MediaStoreContext.tsx');
  const storage = read('../../aws/app-data/api/storage.mjs');

  assert.match(app, /handleChatAttachmentUpload/);
  assert.match(app, /uploadFile\('messages', chatAttachment\)/);
  assert.doesNotMatch(app, /onChange=\{handleChatAttachmentUpload\}[\s\S]{0,120}accept="image\/\*"/);
  assert.match(portal, /uploadPublicShareAttachment\(shareLink\.token, selectedAttachment\)/);
  assert.match(portal, /100 \* 1024 \* 1024/);
  assert.match(context, /MessageAttachment/);
  assert.match(storage, /'message-attachment': \{ prefix: 'messages\/attachments', family: null, max: 100 \* 1024 \* 1024 \}/);
});

test('message bubbles expose saved attachments as downloads in both portals', () => {
  const app = read('../App.tsx');
  const portal = read('../components/SharePortal.tsx');

  assert.match(app, /msg\.attachment_url/);
  assert.match(app, /download=\{msg\.attachment_name \|\| undefined\}/);
  assert.match(portal, /item\.attachment_url/);
  assert.match(portal, /download=\{item\.attachment_name \|\| undefined\}/);
});

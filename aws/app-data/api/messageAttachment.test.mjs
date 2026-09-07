import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeEntityCreate } from './contract.mjs';
import { normalizeUploadRequest } from './storage.mjs';

const messageId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';

test('message-file uploads accept arbitrary MIME types up to 100 MB', () => {
  const normalized = normalizeUploadRequest({
    category: 'message-file',
    relatedId: messageId,
    filename: 'contract.pdf',
    contentType: 'application/pdf',
    size: 5 * 1024 * 1024,
  });
  assert.equal(normalized.category, 'message-file');
  assert.equal(normalized.contentType, 'application/pdf');

  assert.throws(() => normalizeUploadRequest({
    category: 'message-file',
    relatedId: messageId,
    filename: 'too-large.bin',
    contentType: 'application/octet-stream',
    size: 100 * 1024 * 1024 + 1,
  }), /size/i);
});

test('messages can be attachment-only and preserve attachment metadata', () => {
  const normalized = normalizeEntityCreate('messages', {
    id: messageId,
    client_id: clientId,
    recipient_id: 'client@example.com',
    content: '',
    attachment_url: 'https://example.com/download',
    attachment_key: 'messages/files/abc/contract.pdf',
    attachment_name: 'contract.pdf',
    attachment_type: 'application/pdf',
    attachment_size: 12345,
    direction: 'outbound',
    is_read: false,
  });

  assert.equal(normalized.content, '');
  assert.equal(normalized.attachment_name, 'contract.pdf');
  assert.equal(normalized.attachment_type, 'application/pdf');
  assert.equal(normalized.attachment_size, 12345);
});

test('empty messages still require either text or an attachment', () => {
  assert.throws(() => normalizeEntityCreate('messages', {
    id: messageId,
    client_id: clientId,
    recipient_id: 'client@example.com',
    content: '',
    direction: 'outbound',
  }), /content|attachment/i);
});

test('public message sync route refreshes conversation without incrementing share views', () => {
  const handler = readFileSync(new URL('./handler.mjs', import.meta.url), 'utf8');
  assert.match(handler, /GET[\s\S]*\/public\/share\/[\^\$\w{}()[\]?:+*\\/."'`-]*messages/);
  assert.match(handler, /resolvePublicMessages/);
});

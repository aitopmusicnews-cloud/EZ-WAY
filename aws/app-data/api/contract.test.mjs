import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEntityCreate,
  normalizePatch,
  normalizePublicEvent,
  normalizeShareCreate,
  normalizeTrackCreate,
} from './contract.mjs';

test('track create serializes tags as JSON text', () => {
  const track = normalizeTrackCreate({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Song',
    tags: ['R&B'],
  });
  assert.equal(track.tagsJson, '["R&B"]');
});

test('track patch rejects database/internal fields', () => {
  assert.throws(
    () => normalizePatch('tracks', { created_at: 'forged', file_key: '../../bad' }),
    /not allowed/i,
  );
});

test('share links target exactly one asset', () => {
  assert.throws(
    () => normalizeShareCreate({
      id: '00000000-0000-4000-8000-000000000001',
      token: 'share-token',
      track_id: '00000000-0000-4000-8000-000000000002',
      playlist_id: '00000000-0000-4000-8000-000000000003',
    }),
    /exactly one/i,
  );
});

test('public feedback accepts only token-scoped review events', () => {
  const trackId = '00000000-0000-4000-8000-000000000002';
  assert.equal(normalizePublicEvent({ type: 'play', track_id: trackId }).type, 'play');
  assert.equal(normalizePublicEvent({ type: 'thumbs_up', track_id: trackId }).type, 'thumbs_up');
  assert.equal(normalizePublicEvent({ type: 'thumbs_down', track_id: trackId }).type, 'thumbs_down');
  assert.equal(normalizePublicEvent({ type: 'comment', track_id: trackId, content: 'Bring the vocal up.' }).content, 'Bring the vocal up.');
  assert.throws(() => normalizePublicEvent({ type: 'delete_track', track_id: trackId }), /event/i);
  assert.throws(() => normalizePublicEvent({ type: 'comment', track_id: trackId, content: '   ' }), /comment/i);
});

test('messages preserve general attachment metadata', () => {
  const message = normalizeEntityCreate('messages', {
    id: '00000000-0000-4000-8000-000000000010',
    client_id: '00000000-0000-4000-8000-000000000011',
    recipient_id: 'client@example.com',
    content: '',
    attachment_key: 'messages/attachments/m1/file.pdf',
    attachment_name: 'contract.pdf',
    attachment_type: 'application/pdf',
    attachment_size: 2048,
    direction: 'outbound',
  });
  assert.equal(message.attachment_name, 'contract.pdf');
  assert.equal(message.attachment_type, 'application/pdf');
  assert.equal(message.attachment_size, 2048);
});

test('messages require text or an attachment', () => {
  assert.throws(() => normalizeEntityCreate('messages', {
    id: '00000000-0000-4000-8000-000000000010',
    client_id: '00000000-0000-4000-8000-000000000011',
    recipient_id: 'client@example.com',
    content: '   ',
    direction: 'outbound',
  }), /content|attachment/i);
});

test('public comments can carry token-scoped attachment metadata', () => {
  const trackId = '00000000-0000-4000-8000-000000000002';
  const event = normalizePublicEvent({
    type: 'comment',
    track_id: trackId,
    content: '',
    attachment_key: 'messages/attachments/m1/reference.zip',
    attachment_name: 'reference.zip',
    attachment_type: 'application/zip',
    attachment_size: 4096,
  });
  assert.equal(event.attachment_name, 'reference.zip');
  assert.equal(event.attachment_size, 4096);
});

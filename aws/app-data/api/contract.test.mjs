import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePatch,
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

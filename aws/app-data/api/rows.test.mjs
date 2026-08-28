import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonArray, resolveMediaUrls, rowToTrack, rowToPlaylist, rowToProfile } from './rows.mjs';

test('JSONB arrays return normal frontend arrays', () => {
  assert.deepEqual(rowToTrack({ id: 't1', name: 'Song', tags: '["R&B","Smooth"]' }).tags, ['R&B', 'Smooth']);
  assert.deepEqual(rowToPlaylist({ id: 'p1', name: 'Set', track_ids: '["t1","t2"]' }).track_ids, ['t1', 't2']);
});

test('missing or invalid JSONB arrays become empty arrays', () => {
  assert.deepEqual(rowToTrack({ id: 't1', name: 'Song', tags: null }).tags, []);
  assert.deepEqual(parseJsonArray('{"not":"an array"}'), []);
  assert.deepEqual(parseJsonArray('not-json'), []);
});

test('profile social links preserve object JSON', () => {
  const profile = rowToProfile({
    id: 'p1',
    name: 'Admin',
    artist_name: 'Artist',
    email: 'admin@example.com',
    avatar_key: null,
    bio: '',
    social_links: '{"instagram":"https://example.com"}'
  });
  assert.deepEqual(profile.social_links, { instagram: 'https://example.com' });
});

test('private media keys resolve to temporary URLs without changing keys', async () => {
  const track = rowToTrack({ id: 't1', name: 'Song', file_key: 'tracks/audio/t1/file.wav', image_key: 'tracks/artwork/t1/cover.png' });
  const resolved = await resolveMediaUrls('tracks', track, async (key) => `https://signed.example/${key}`);
  assert.equal(resolved.file_key, 'tracks/audio/t1/file.wav');
  assert.equal(resolved.file_url, 'https://signed.example/tracks/audio/t1/file.wav');
  assert.equal(resolved.image_url, 'https://signed.example/tracks/artwork/t1/cover.png');
});

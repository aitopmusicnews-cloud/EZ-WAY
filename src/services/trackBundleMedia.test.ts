import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataStoreClient } from './dataStore.ts';
import { resolveTrackBundleAsset } from './trackBundleMedia.ts';

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
);

test('data store requests a fresh signed URL for a permanent media key', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => 'id-token',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({
        url: 'https://s3.example.com/fresh-cover?signature=fresh',
        object_key: 'tracks/artwork/t1/cover.png',
      });
    },
  });

  const result = await client.refreshMediaUrl({
    objectKey: 'tracks/artwork/t1/cover.png',
    url: 'https://s3.example.com/expired-cover?signature=expired',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.com/media/read-url');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    objectKey: 'tracks/artwork/t1/cover.png',
    url: 'https://s3.example.com/expired-cover?signature=expired',
  });
  assert.equal(result.url, 'https://s3.example.com/fresh-cover?signature=fresh');
});

test('track bundle artwork prefers the permanent key over a stale signed URL', async () => {
  const refreshCalls: Array<{ objectKey?: string | null; url?: string | null }> = [];
  const fetched: string[] = [];
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

  const result = await resolveTrackBundleAsset({
    label: 'artwork',
    data: undefined,
    objectKey: 'tracks/artwork/t1/cover.png',
    url: 'https://old.example.com/cover.png?expired=yes',
    refreshMediaUrl: async (input) => {
      refreshCalls.push(input);
      return { url: 'https://fresh.example.com/cover.png?fresh=yes', objectKey: input.objectKey || null };
    },
    fetchBlob: async (url) => {
      fetched.push(url);
      return blob;
    },
  });

  assert.equal(result, blob);
  assert.deepEqual(refreshCalls, [{
    objectKey: 'tracks/artwork/t1/cover.png',
    url: 'https://old.example.com/cover.png?expired=yes',
  }]);
  assert.deepEqual(fetched, ['https://fresh.example.com/cover.png?fresh=yes']);
});

test('track bundle can recover a legacy stale URL even when the permanent key is absent in old browser state', async () => {
  const blob = new Blob([new Uint8Array([9])], { type: 'image/jpeg' });
  let refreshInput: { objectKey?: string | null; url?: string | null } | null = null;

  const result = await resolveTrackBundleAsset({
    label: 'artwork',
    url: 'https://bucket.example.com/tracks/artwork/t1/old.jpg?signature=expired',
    refreshMediaUrl: async (input) => {
      refreshInput = input;
      return { url: 'https://bucket.example.com/tracks/artwork/t1/old.jpg?signature=fresh', objectKey: 'tracks/artwork/t1/old.jpg' };
    },
    fetchBlob: async () => blob,
  });

  assert.equal(result, blob);
  assert.deepEqual(refreshInput, {
    objectKey: null,
    url: 'https://bucket.example.com/tracks/artwork/t1/old.jpg?signature=expired',
  });
});

test('associated media failure rejects instead of silently producing an incomplete ZIP', async () => {
  await assert.rejects(
    resolveTrackBundleAsset({
      label: 'artwork',
      objectKey: 'tracks/artwork/t1/cover.png',
      url: 'https://old.example.com/cover.png?expired=yes',
      refreshMediaUrl: async () => ({
        url: 'https://fresh.example.com/cover.png',
        objectKey: 'tracks/artwork/t1/cover.png',
      }),
      fetchBlob: async () => { throw new Error('S3 read failed'); },
    }),
    /Could not include artwork in the track download/i,
  );
});

test('tracks with no associated artwork return null without error', async () => {
  const result = await resolveTrackBundleAsset({
    label: 'artwork',
    refreshMediaUrl: async () => { throw new Error('should not refresh'); },
    fetchBlob: async () => { throw new Error('should not fetch'); },
  });
  assert.equal(result, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataStoreClient, DataStoreError } from './dataStore.ts';

const jsonResponse = (body: unknown, status = 200) => new Response(
  status === 204 ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
);

test('owner requests attach the Cognito ID token', async () => {
  const calls: RequestInit[] = [];
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com/',
    getToken: () => 'id-token',
    fetchImpl: async (_url, init) => {
      calls.push(init || {});
      return jsonResponse({ tracks: [], playlists: [], clients: [], activities: [], share_links: [], messages: [], promo_videos: [], profile: null });
    },
  });
  await client.bootstrap();
  assert.equal((calls[0].headers as Record<string, string>).Authorization, 'Bearer id-token');
});

test('public share requests never attach owner Authorization', async () => {
  let headers: Record<string, string> = {};
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => 'secret-owner-token',
    fetchImpl: async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return jsonResponse({ link: { id: 'l1', token: 'share1' }, track: null, playlist: null, tracks: [], messages: [] });
    },
  });
  await client.getPublicShare('share1');
  assert.equal(headers.Authorization, undefined);
});

test('non-2xx JSON becomes a typed DataStoreError', async () => {
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => 'id-token',
    fetchImpl: async () => jsonResponse({ error: 'Bad record.' }, 400),
  });
  await assert.rejects(client.createTrack({ id: 't1' } as any), (error: unknown) => {
    assert.ok(error instanceof DataStoreError);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'Bad record.');
    return true;
  });
});

test('upload requests a presign then PUTs the original file', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => 'id-token',
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/uploads/presign')) {
        return jsonResponse({
          upload_url: 'https://s3.example.com/signed-put',
          object_key: 'tracks/audio/t1/file.wav',
          read_url: 'https://s3.example.com/signed-get',
          headers: { 'content-type': 'audio/wav' },
        });
      }
      return new Response(null, { status: 200 });
    },
  });
  const file = new File([new Uint8Array([1, 2, 3])], 'file.wav', { type: 'audio/wav' });
  const result = await client.uploadFile('tracks', 't1', file);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://s3.example.com/signed-put');
  assert.equal(calls[1].init?.method, 'PUT');
  assert.equal(result.objectKey, 'tracks/audio/t1/file.wav');
  assert.equal(result.url, 'https://s3.example.com/signed-get');
});

test('configured cloud uploads are not blocked by a failed workspace bootstrap', async () => {
  const dataStoreModule = await import('./dataStore.ts');
  const uploadMediaForWorkspace = (dataStoreModule as any).uploadMediaForWorkspace;

  assert.equal(typeof uploadMediaForWorkspace, 'function');

  const file = new File([new Uint8Array([1, 2, 3])], 'song.wav', { type: 'audio/wav' });
  const result = await uploadMediaForWorkspace({
    bootstrapConnected: false,
    cloudApiConfigured: true,
    category: 'tracks',
    relatedId: 'track-1',
    file,
    createLocalUrl: () => 'blob:local-only',
    cloudUpload: async () => ({
      url: 'https://s3.example.com/signed-get',
      objectKey: 'tracks/audio/track-1/song.wav',
    }),
  });

  assert.deepEqual(result, {
    url: 'https://s3.example.com/signed-get',
    objectKey: 'tracks/audio/track-1/song.wav',
  });
});

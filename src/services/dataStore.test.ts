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

test('bootstrap repairs a stuck track from completed canonical analysis', async () => {
  const track = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Recovered Track',
    artist: 'OGBeatz',
    bpm: 0,
    key_signature: 'Analyzing…',
    duration: 180,
    tags: ['custom-tag'],
    status: 'processing',
    size: 123456,
    type: 'audio/mpeg',
    file_url: 'https://example.com/audio.mp3?signature=fresh',
    file_key: 'tracks/audio/example.mp3',
    plays: 0,
    likes: 0,
    created_at: '2026-09-01T00:00:00.000Z',
  } as const;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => 'id-token',
    getAnalysisRecord: async () => ({
      track_id: track.id,
      analyzer_version: 'music-intelligence-v1',
      status: 'ready',
      source_fingerprint: 'v1-old-presigned-url',
      profile: {
        version: 'music-intelligence-v1',
        analyzed_at: '2026-09-01T00:01:00.000Z',
        bpm: 87,
        key: 'D Major',
        camelot_key: '10B',
        primary_genre: 'Latin Pop',
        genre_confident: true,
        genres: [{ label: 'Latin Pop', score: 0.9 }],
        moods: [{ label: 'Confident', score: 0.8 }],
        styles: [{ label: 'Melodic Trap', score: 0.7 }],
        instruments: [{ label: 'Lead Synth', score: 0.6 }],
        sections: [],
        chapters: [],
        keywords: ['radio-ready'],
        evidence: { provider: 'aws-ecs' },
        warnings: [],
      },
    }),
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/bootstrap')) {
        return jsonResponse({
          tracks: [track], playlists: [], clients: [], activities: [], share_links: [], messages: [], promo_videos: [], profile: null,
        });
      }
      if (url.endsWith(`/tracks/${track.id}`)) {
        const updates = JSON.parse(String(init?.body || '{}'));
        return jsonResponse({ ...track, ...updates });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const payload = await client.bootstrap();
  assert.equal(payload.tracks[0].status, 'ready');
  assert.equal(payload.tracks[0].bpm, 87);
  assert.equal(payload.tracks[0].key_signature, 'D Major (10B)');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init?.method, 'PATCH');
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

test('track metadata updates send only fields accepted by the AWS PATCH contract', async () => {
  let requestBody: Record<string, unknown> | null = null;
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => 'id-token',
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body || '{}'));
      return jsonResponse({ id: '11111111-1111-4111-8111-111111111111', ...requestBody });
    },
  });

  await client.updateTrack('11111111-1111-4111-8111-111111111111', {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Edited Title',
    artist: 'Edited Artist',
    bpm: 92,
    key_signature: 'A Minor',
    duration: 180,
    tags: ['edited'],
    status: 'ready',
    size: 123456,
    type: 'audio/mpeg',
    file_url: 'https://example.com/audio.mp3',
    file_key: 'tracks/audio/example.mp3',
    image_url: 'https://example.com/cover.jpg',
    image_key: 'tracks/artwork/example.jpg',
    plays: 4,
    likes: 2,
    created_at: '2026-09-01T00:00:00.000Z',
    lyrics: 'Updated lyrics',
  } as any);

  assert.deepEqual(requestBody, {
    name: 'Edited Title',
    artist: 'Edited Artist',
    bpm: 92,
    key_signature: 'A Minor',
    duration: 180,
    tags: ['edited'],
    status: 'ready',
    size: 123456,
    type: 'audio/mpeg',
    file_key: 'tracks/audio/example.mp3',
    image_key: 'tracks/artwork/example.jpg',
    plays: 4,
    likes: 2,
    lyrics: 'Updated lyrics',
  });
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

test('authenticated request restores an expired session before sending the request', async () => {
  let token: string | null = null;
  let restoreCalls = 0;
  let authorization = '';
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => token,
    restoreAuth: async () => {
      restoreCalls += 1;
      token = 'refreshed-id-token';
      return true;
    },
    fetchImpl: async (_url, init) => {
      authorization = String((init?.headers as Record<string, string>)?.Authorization || '');
      return jsonResponse({ tracks: [], playlists: [], clients: [], activities: [], share_links: [], messages: [], promo_videos: [], profile: null });
    },
  } as any);

  await client.bootstrap();
  assert.equal(restoreCalls, 1);
  assert.equal(authorization, 'Bearer refreshed-id-token');
});

test('authenticated request refreshes once and retries after an API 401', async () => {
  let token = 'stale-id-token';
  let restoreCalls = 0;
  const authorizations: string[] = [];
  const client = createDataStoreClient({
    apiBase: 'https://api.example.com',
    getToken: () => token,
    restoreAuth: async () => {
      restoreCalls += 1;
      token = 'fresh-id-token';
      return true;
    },
    fetchImpl: async (_url, init) => {
      authorizations.push(String((init?.headers as Record<string, string>)?.Authorization || ''));
      if (authorizations.length === 1) return jsonResponse({ error: 'Unauthorized' }, 401);
      return jsonResponse({ tracks: [], playlists: [], clients: [], activities: [], share_links: [], messages: [], promo_videos: [], profile: null });
    },
  } as any);

  await client.bootstrap();
  assert.equal(restoreCalls, 1);
  assert.deepEqual(authorizations, ['Bearer stale-id-token', 'Bearer fresh-id-token']);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createDataStoreClient } from './dataStore.ts';

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
);

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
  });

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
  });

  await client.bootstrap();

  assert.equal(restoreCalls, 1);
  assert.deepEqual(authorizations, ['Bearer stale-id-token', 'Bearer fresh-id-token']);
});

test('media upload helper rethrows the original AWS upload error instead of hiding it', () => {
  const source = fs.readFileSync(new URL('../context/MediaStoreContext.tsx', import.meta.url), 'utf8');
  const uploadFileStart = source.indexOf('const uploadFile = async');
  const uploadFileEnd = source.indexOf('const handleSetEnableMockData', uploadFileStart);
  const uploadFileSource = source.slice(uploadFileStart, uploadFileEnd);

  assert.match(uploadFileSource, /throw error;/, 'uploadFile must preserve the original AWS upload failure');
});

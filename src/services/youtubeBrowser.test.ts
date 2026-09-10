import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createYouTubeBrowserClient,
  createYouTubeFetchBridge,
  YOUTUBE_OAUTH_SENTINEL_URL,
} from './youtubeBrowser.ts';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json', ...headers } },
);

test('YouTube browser client reports a clear configuration error without a public client ID', async () => {
  const client = createYouTubeBrowserClient({
    clientId: '',
    storage: memoryStorage(),
    fetchImpl: async () => jsonResponse({}),
    getGoogleOAuth: () => null,
  });

  await assert.rejects(client.connect(), /VITE_GOOGLE_CLIENT_ID/);
});

test('connected YouTube state comes from the authenticated channel API', async () => {
  const storage = memoryStorage();
  storage.setItem('EZWAY_YOUTUBE_OAUTH_TOKEN', JSON.stringify({ accessToken: 'token-123', expiresAt: Date.now() + 60_000 }));
  const calls: Array<{ url: string; authorization: string }> = [];
  const client = createYouTubeBrowserClient({
    clientId: 'client.apps.googleusercontent.com',
    storage,
    fetchImpl: async (input, init) => {
      calls.push({
        url: String(input),
        authorization: String((init?.headers as Record<string, string>)?.Authorization || ''),
      });
      return jsonResponse({
        items: [{
          id: 'channel-1',
          snippet: { title: 'THE BEATZ WAY TV', thumbnails: { default: { url: 'https://example.com/avatar.jpg' } } },
          statistics: { subscriberCount: '1234', viewCount: '5678' },
          contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
        }],
      });
    },
    getGoogleOAuth: () => null,
  });

  const state = await client.getState();
  assert.equal(state.connected, true);
  assert.equal(state.channelName, 'THE BEATZ WAY TV');
  assert.equal(state.subscriberCount, '1,234');
  assert.equal(state.channelId, 'channel-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].authorization, 'Bearer token-123');
});

test('fetch bridge answers legacy auth-url locally and leaves unrelated requests alone', async () => {
  const passthrough: string[] = [];
  const bridge = createYouTubeFetchBridge({
    nativeFetch: async (input) => {
      passthrough.push(String(input));
      return jsonResponse({ native: true });
    },
    client: {
      configured: true,
      getState: async () => ({ connected: false }),
      getAnalytics: async () => ({}),
      getVideos: async () => ({ success: true, videos: [] }),
      getComments: async () => ({ success: true, comments: [] }),
      disconnect: async () => undefined,
      upload: async () => ({ success: true, videoId: 'video-1', videoUrl: 'https://www.youtube.com/watch?v=video-1' }),
    } as any,
  });

  const authResponse = await bridge('/api/youtube/auth-url?origin=https%3A%2F%2Fezwaypro.theartistcut.com');
  assert.equal(authResponse.status, 200);
  assert.deepEqual(await authResponse.json(), { url: YOUTUBE_OAUTH_SENTINEL_URL });

  const nativeResponse = await bridge('/api/youtube/generate-meta', { method: 'POST' });
  assert.deepEqual(await nativeResponse.json(), { native: true });
  assert.deepEqual(passthrough, ['/api/youtube/generate-meta']);
});

test('fetch bridge routes legacy YouTube upload payloads to the browser client', async () => {
  let uploadPayload: Record<string, unknown> | null = null;
  const bridge = createYouTubeFetchBridge({
    nativeFetch: async () => jsonResponse({ native: true }),
    client: {
      configured: true,
      getState: async () => ({ connected: true }),
      getAnalytics: async () => ({}),
      getVideos: async () => ({ success: true, videos: [] }),
      getComments: async () => ({ success: true, comments: [] }),
      disconnect: async () => undefined,
      upload: async (payload: Record<string, unknown>) => {
        uploadPayload = payload;
        return { success: true, videoId: 'video-123', videoUrl: 'https://www.youtube.com/watch?v=video-123' };
      },
    } as any,
  });

  const response = await bridge('/api/youtube/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      videoData: 'data:video/mp4;base64,AQID',
      title: 'Release',
      description: 'Description',
      tags: 'one,two',
      privacy: 'unlisted',
    }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).videoId, 'video-123');
  assert.deepEqual(uploadPayload, {
    videoData: 'data:video/mp4;base64,AQID',
    title: 'Release',
    description: 'Description',
    tags: 'one,two',
    privacy: 'unlisted',
  });
});

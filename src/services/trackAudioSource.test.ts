import assert from 'node:assert/strict';
import test from 'node:test';
import type { Track } from '../types.ts';
import { refreshTrackAudioSource } from './trackAudioSource.ts';

const track: Track = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Stable Audio',
  artist: 'OG Beatz',
  duration: 120,
  bpm: 90,
  key_signature: 'C',
  file_url: 'https://signed.example/expired-audio',
  file_key: 'tracks/111/master.wav',
  image_url: '',
  image_key: null,
  size: 100,
  type: 'audio/wav',
  plays: 0,
  likes: 0,
  tags: [],
  lyrics: '',
  status: 'ready',
  created_at: new Date(0).toISOString(),
};

test('refreshTrackAudioSource refreshes only the track object key, not the whole bootstrap payload', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const refreshed = await refreshTrackAudioSource(track, {
    apiBase: 'https://api.example',
    token: 'owner-token',
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({
        url: 'https://signed.example/fresh-audio',
        object_key: track.file_key,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.example/media/read-url');
  assert.equal(requests[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    objectKey: track.file_key,
    url: track.file_url,
  });
  assert.equal(refreshed.file_url, 'https://signed.example/fresh-audio');
  assert.equal(refreshed.file_key, track.file_key);
});

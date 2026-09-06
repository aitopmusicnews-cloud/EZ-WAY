import assert from 'node:assert/strict';
import test from 'node:test';

import { refreshTrackAnalysisSource } from './musicIntelligence.ts';

const track = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'City_of_Shadows',
  artist: 'OGBeatz',
  bpm: 94,
  key_signature: 'G Minor (6A)',
  duration: 180,
  tags: [],
  status: 'ready',
  size: 123456,
  type: 'audio/mpeg',
  file_key: 'tracks/audio/city-of-shadows.mp3',
  file_url: 'https://old-signed.example.com/city.mp3',
  image_url: null,
  plays: 0,
  likes: 0,
  created_at: '2026-09-01T00:00:00.000Z',
} as any;

test('refreshTrackAnalysisSource replaces a stale signed URL with the current AWS workspace URL', async () => {
  let requestedUrl = '';
  let authorization = '';

  const refreshed = await refreshTrackAnalysisSource(track, {
    apiBase: 'https://data.example.com/',
    token: 'owner-id-token',
    fetchImpl: async (url, init) => {
      requestedUrl = String(url);
      authorization = String((init?.headers as Record<string, string>)?.Authorization || '');
      return new Response(JSON.stringify({
        tracks: [{ ...track, file_url: 'https://fresh-signed.example.com/city.mp3' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(requestedUrl, 'https://data.example.com/bootstrap');
  assert.equal(authorization, 'Bearer owner-id-token');
  assert.equal(refreshed.file_url, 'https://fresh-signed.example.com/city.mp3');
});

test('refreshTrackAnalysisSource keeps the original track when refresh is unavailable', async () => {
  const refreshed = await refreshTrackAnalysisSource(track, {
    apiBase: '',
    token: null,
    fetchImpl: async () => { throw new Error('should not fetch'); },
  });

  assert.equal(refreshed, track);
});

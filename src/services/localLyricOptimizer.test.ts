import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLocalLyricDescription,
  checkLocalLyricOptimizer,
  researchLocalLyricSeo,
  transcribeLyricsFile,
} from './localLyricOptimizer.ts';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('health check uses the loopback service by default', async () => {
  let capturedUrl = '';
  const result = await checkLocalLyricOptimizer({
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return jsonResponse({
        ok: true,
        service: 'ezway-local-lyric-optimizer',
        model: 'small',
        device: 'cpu',
        compute_type: 'int8',
      });
    },
  });

  assert.equal(capturedUrl, 'http://127.0.0.1:8765/health');
  assert.equal(result.device, 'cpu');
  assert.equal(result.compute_type, 'int8');
});

test('transcription sends the selected file as multipart form data', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const source = new File([new Uint8Array([1, 2, 3])], 'song.wav', { type: 'audio/wav' });

  const result = await transcribeLyricsFile(source, {
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({
        text: 'First line\nSecond line',
        language: 'en',
        language_probability: 0.99,
        segments: [
          { start: 0, end: 1.2, text: 'First line' },
          { start: 1.2, end: 2.4, text: 'Second line' },
        ],
      });
    },
  });

  assert.equal(capturedUrl, 'http://127.0.0.1:8765/lyrics/transcribe');
  assert.equal(capturedInit?.method, 'POST');
  const form = capturedInit?.body as FormData;
  const uploaded = form.get('file') as File;
  assert.equal(uploaded.name, 'song.wav');
  assert.equal(result.text, 'First line\nSecond line');
  assert.equal(result.segments.length, 2);
});

test('backend validation detail is surfaced to the user', async () => {
  const source = new File([new Uint8Array([1])], 'song.wav', { type: 'audio/wav' });

  await assert.rejects(
    () => transcribeLyricsFile(source, {
      fetchImpl: async () => jsonResponse({ detail: 'Only MP3 or WAV audio files are supported.' }, 415),
    }),
    /Only MP3 or WAV audio files are supported\./,
  );
});

test('network failure explains that the local service must be started', async () => {
  const source = new File([new Uint8Array([1])], 'song.wav', { type: 'audio/wav' });

  await assert.rejects(
    () => transcribeLyricsFile(source, {
      fetchImpl: async () => { throw new TypeError('fetch failed'); },
    }),
    /Local Lyrics Service is not running on this computer\. Start it, then try again\./,
  );
});

test('SEO research preserves missing-key warning for OAuth fallback', async () => {
  const result = await researchLocalLyricSeo('Song Artist', 'r&b', {
    fetchImpl: async () => jsonResponse({
      queries: ['Song Artist', 'Song Artist lyrics'],
      suggestions: ['song artist lyrics'],
      competitor_tags: [],
      ranked_tags: ['lyrics', 'lyric video'],
      warning: 'youtube_api_key_missing',
    }),
  });

  assert.equal(result.warning, 'youtube_api_key_missing');
  assert.deepEqual(result.competitor_tags, []);
});

test('description request sends extracted lyrics to the local builder', async () => {
  let requestBody: any = null;
  const result = await buildLocalLyricDescription({
    song_title: 'Song',
    artist: 'Artist',
    genre: 'Pop',
    mood: 'uplifting',
    lyrics: 'Line one\nLine two',
  }, {
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({ prompt: 'prompt', skeleton: 'skeleton' });
    },
  });

  assert.equal(requestBody.lyrics, 'Line one\nLine two');
  assert.equal(result.skeleton, 'skeleton');
});

test('runtime service URL rejects non-loopback hosts before upload', async () => {
  const source = new File([new Uint8Array([1])], 'song.wav', { type: 'audio/wav' });
  let called = false;

  await assert.rejects(
    () => transcribeLyricsFile(source, {
      baseUrl: 'https://example.com',
      fetchImpl: async () => {
        called = true;
        return jsonResponse({});
      },
    }),
    /loopback/,
  );
  assert.equal(called, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as seoCore from './youtubeUploadCore.ts';
import { createYouTubeBrowserClient } from './youtubeBrowser.ts';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('keyword research expands a seed into lyric-search autocomplete modifiers', () => {
  const buildQueries = (seoCore as any).buildLyricAutocompleteQueries;
  assert.equal(typeof buildQueries, 'function');
  assert.deepEqual(buildQueries('Blinding Lights'), [
    'Blinding Lights',
    'Blinding Lights lyrics',
    'Blinding Lights lyric video',
    'Blinding Lights karaoke',
    'Blinding Lights clean lyrics',
  ]);
});

test('legacy lyric tag ranking keeps foundational intent for callers without song context', () => {
  const rankTags = (seoCore as any).rankLyricSeoTags;
  assert.equal(typeof rankTags, 'function');
  const ranked = rankTags(
    ['Synth Pop', 'Lyrics', 'Official Video', 'Sing Along', 'lyrics', 'Synth Pop'],
    ['pop music', 'synthwave'],
  );
  assert.deepEqual(ranked.slice(0, 5), [
    'lyrics',
    'lyric video',
    'lyrics video',
    'sing along',
    'clean lyrics',
  ]);
  assert.ok(ranked.indexOf('synth pop') < ranked.indexOf('pop music'));
});

test('SEO package is structured for full-track lyric videos and keeps all lyrics', () => {
  const generate = seoCore.generateYouTubeSEO as any;
  const pkg = generate({
    name: 'Blinding Lights',
    artist: 'The Weeknd',
    bpm: 171,
    key_signature: 'F minor',
    duration: 200,
    tags: ['pop', 'synthwave'],
    lyrics: 'Line one\nLine two\nLine three\nLine four',
  }, {
    spotifyLink: '',
    appleLink: '',
    amazonLink: '',
    autocompleteSuggestions: ['blinding lights lyrics meaning'],
    competitorTags: ['synth pop lyrics'],
  });

  const lines = pkg.description.split('\n');
  assert.match(lines[0], /Blinding Lights.*The Weeknd.*pop/i);
  assert.match(lines[1], /lyric|sing|track/i);
  assert.match(pkg.description, /🎧 STREAM \/ DOWNLOAD/);
  assert.match(pkg.description, /Spotify: \[Spotify link\]/);
  assert.match(pkg.description, /Apple Music: \[Apple Music link\]/);
  assert.match(pkg.description, /Amazon Music: \[Amazon Music link\]/);
  assert.match(pkg.description, /📝 LYRICS/);
  assert.match(pkg.description, /Line one\nLine two\nLine three\nLine four/);
  assert.match(pkg.description, /🎼 CREDITS/);
  assert.match(pkg.description, /Producer: \[Producer\]/);
  assert.match(pkg.description, /Songwriter\(s\): \[Songwriters\]/);
  assert.match(pkg.description, /Vocalist\(s\): \[Vocalists\]/);

  const tags = pkg.tags.split(', ').map((tag: string) => tag.toLowerCase());
  assert.equal(tags[0], 'the weeknd blinding lights lyrics');
  assert.ok(tags.indexOf('blinding lights lyrics meaning') < tags.indexOf('lyrics'));
  assert.ok(tags.includes('synth pop lyrics'));
  assert.ok(tags.includes('lyric video'));
  assert.match(pkg.keywords, /blinding lights lyrics meaning/i);
});

test('AI lyric description prompt explicitly requires the lyric-video template', () => {
  const buildPrompt = (seoCore as any).buildLyricDescriptionSystemPrompt;
  assert.equal(typeof buildPrompt, 'function');
  const prompt = buildPrompt('Blinding Lights', 'The Weeknd', 'Synth Pop');
  assert.match(prompt, /YouTube Music SEO assistant specializing in Lyric Channels/i);
  assert.match(prompt, /first 2 lines/i);
  assert.match(prompt, /Spotify/i);
  assert.match(prompt, /Apple Music/i);
  assert.match(prompt, /Amazon Music/i);
  assert.match(prompt, /LYRICS SECTION/i);
  assert.match(prompt, /Producer/i);
  assert.match(prompt, /Songwriter/i);
  assert.match(prompt, /Vocalist/i);
});

test('server-side AI metadata prompt uses the same lyric-video description contract', () => {
  const serverPath = fileURLToPath(new URL('../../server.ts', import.meta.url));
  const source = readFileSync(serverPath, 'utf8');
  assert.match(source, /YouTube Music SEO assistant specializing in Lyric Channels/i);
  assert.match(source, /LYRICS SECTION/i);
  assert.match(source, /first 2 lines/i);
  assert.match(source, /Amazon Music/i);
  assert.match(source, /Producer/i);
  assert.match(source, /Songwriter\(s\)/i);
  assert.match(source, /Vocalist\(s\)/i);
  assert.match(source, /amazonLink/);
});

test('browser SEO research queries YouTube autocomplete modifiers and top lyric-video tags', async () => {
  const storage = memoryStorage();
  storage.setItem('EZWAY_YOUTUBE_OAUTH_TOKEN', JSON.stringify({
    accessToken: 'token-123',
    expiresAt: Date.now() + 60_000,
  }));
  const calls: string[] = [];
  const client = createYouTubeBrowserClient({
    clientId: 'client.apps.googleusercontent.com',
    storage,
    getGoogleOAuth: () => null,
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('suggestqueries.google.com')) {
        const query = new URL(url).searchParams.get('q') || '';
        return jsonResponse([query, [`${query} suggestion`]]);
      }
      if (url.includes('/youtube/v3/search')) {
        return jsonResponse({
          items: [
            { id: { videoId: 'video-1' } },
            { id: { videoId: 'video-2' } },
          ],
        });
      }
      if (url.includes('/youtube/v3/videos')) {
        return jsonResponse({
          items: [
            { snippet: { tags: ['Lyrics', 'Synth Pop'] } },
            { snippet: { tags: ['Sing Along', 'Lyrics'] } },
          ],
        });
      }
      return jsonResponse({});
    },
  });

  const research = (client as any).researchLyricSEO;
  assert.equal(typeof research, 'function');
  const result = await research('Blinding Lights');

  assert.equal(calls.filter((url) => url.includes('suggestqueries.google.com')).length, 5);
  assert.ok(calls.some((url) => url.includes('ds=yt') && url.includes('Blinding+Lights+clean+lyrics')));
  assert.ok(calls.some((url) => url.includes('/youtube/v3/search') && url.includes('type=video') && url.includes('maxResults=10') && url.includes('order=relevance')));
  assert.ok(calls.some((url) => url.includes('/youtube/v3/videos') && url.includes('part=snippet')));
  assert.ok(result.suggestions.includes('Blinding Lights lyrics suggestion'));
  assert.deepEqual(result.competitorTags, ['lyrics', 'synth pop', 'sing along']);
});

test('YouTube Hub uses local ranked SEO terms and retains OAuth research fallback', () => {
  const hubPath = fileURLToPath(new URL('../components/YouTubeHub.tsx', import.meta.url));
  const source = readFileSync(hubPath, 'utf8');
  assert.match(source, /researchLocalLyricSeo/);
  assert.match(source, /competitor_tags/);
  assert.match(source, /ranked_tags/);
  assert.match(source, /rankedTags/);
  assert.match(source, /youtube_api_key_missing/);
  assert.match(source, /seo-research/);
  assert.match(source, /Local optimizer unavailable; using OAuth research/);
  assert.match(source, /Amazon Music/);
  assert.match(source, /amazon/i);
});

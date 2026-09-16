import assert from 'node:assert/strict';
import test from 'node:test';

import { generateYouTubeSEO } from './youtubeUploadCore.ts';

const track = {
  name: 'After Midnight',
  artist: 'Nova Rae',
  bpm: 92,
  key_signature: 'F minor',
  duration: 214,
  tags: ['rnb', 'moody', 'late night'],
  lyrics: [
    'Heartbeat under neon rain',
    'Heartbeat under neon rain',
    'City lights keep pulling me home',
    'Heartbeat while the skyline fades',
  ].join('\n'),
};

const liveResearch = {
  videoStyle: 'Official Lyric Video',
  autocompleteSuggestions: [
    'Nova Rae After Midnight lyrics',
    'After Midnight lyrics meaning',
    'After Midnight karaoke',
    'unrelated celebrity gossip',
  ],
  competitorTags: [
    'late night r&b',
    'official video',
    'late night r&b',
    'new music',
  ],
};

test('song-specific live searches outrank generic lyric foundation tags', () => {
  const pkg = generateYouTubeSEO(track as any, liveResearch);
  const tags = pkg.tags.split(', ').map((tag) => tag.toLowerCase());

  assert.equal(tags[0], 'nova rae after midnight lyrics');
  assert.ok(tags.indexOf('after midnight lyrics meaning') < tags.indexOf('lyrics'));
  assert.ok(!tags.includes('unrelated celebrity gossip'));
});

test('SEO title is search-first instead of stuffing genre and year', () => {
  const pkg = generateYouTubeSEO(track as any, liveResearch);

  assert.equal(pkg.title, 'Nova Rae - After Midnight (Official Lyric Video)');
  assert.doesNotMatch(pkg.title, /\[[^\]]+\]\s+20\d{2}/);
});

test('repeated lyric themes become discovery keywords while BPM and key stay informational', () => {
  const pkg = generateYouTubeSEO(track as any, liveResearch);
  const keywords = pkg.keywords.toLowerCase();
  const tags = pkg.tags.toLowerCase();

  assert.match(keywords, /heartbeat/);
  assert.doesNotMatch(tags, /92 bpm/);
  assert.doesNotMatch(tags, /f minor/);
});

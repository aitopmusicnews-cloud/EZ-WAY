import assert from 'node:assert/strict';
import test from 'node:test';

import { generateYouTubeSEO, OG_BEATZ_LINKS } from './youtubeUploadCore.ts';

test('OG BEATZ defaults expose verified social and music profiles', () => {
  assert.deepEqual(OG_BEATZ_LINKS, {
    youtube: 'https://www.youtube.com/@Og-Beatz-rus',
    youtubeMusic: 'https://music.youtube.com/channel/UCzcl8OAzNUNztrAfCxH0VLA',
    instagram: 'https://www.instagram.com/ogbeatzofficial/',
    appleMusic: 'https://music.apple.com/us/artist/og-beatz/1709404287',
    amazonMusic: 'https://music.amazon.com/artists/B07DS3S9QM/og-beatz',
  });
});

test('generated YouTube SEO description automatically includes OG BEATZ defaults', () => {
  const pkg = generateYouTubeSEO({
    name: 'After Midnight',
    artist: 'OG BEATZ',
    bpm: 92,
    key_signature: 'A minor',
    duration: 190,
    tags: ['rnb'],
    lyrics: 'heartbeat heartbeat midnight midnight',
  });

  assert.match(pkg.description, /https:\/\/www\.youtube\.com\/@Og-Beatz-rus/);
  assert.match(pkg.description, /https:\/\/music\.youtube\.com\/channel\/UCzcl8OAzNUNztrAfCxH0VLA/);
  assert.match(pkg.description, /https:\/\/www\.instagram\.com\/ogbeatzofficial\//);
  assert.match(pkg.description, /https:\/\/music\.apple\.com\/us\/artist\/og-beatz\/1709404287/);
  assert.match(pkg.description, /https:\/\/music\.amazon\.com\/artists\/B07DS3S9QM\/og-beatz/);
});

test('track-specific Apple and Amazon links override defaults without changing social profiles', () => {
  const pkg = generateYouTubeSEO({
    name: 'After Midnight',
    artist: 'OG BEATZ',
    bpm: 92,
    key_signature: 'A minor',
    duration: 190,
    tags: ['rnb'],
    lyrics: '',
  }, {
    appleLink: 'https://music.apple.com/custom-release',
    amazonLink: 'https://music.amazon.com/custom-release',
  });

  assert.match(pkg.description, /Apple Music: https:\/\/music\.apple\.com\/custom-release/);
  assert.match(pkg.description, /Amazon Music: https:\/\/music\.amazon\.com\/custom-release/);
  assert.match(pkg.description, /https:\/\/www\.youtube\.com\/@Og-Beatz-rus/);
  assert.match(pkg.description, /https:\/\/www\.instagram\.com\/ogbeatzofficial\//);
});

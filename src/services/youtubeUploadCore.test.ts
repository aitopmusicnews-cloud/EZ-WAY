import assert from 'node:assert/strict';
import test from 'node:test';

import type { PromoVideo } from '../types.ts';
import { promoVideosForTrack } from './youtubeUploadCore.ts';

const videos: PromoVideo[] = [
  {
    id: 'video-a1',
    track_id: 'track-a',
    video_url: 'https://example.com/a1.mp4',
    thumbnail_url: 'https://example.com/a1.jpg',
    style: 'Visualizer',
    status: 'ready',
    created_at: '2026-08-24T00:00:00Z',
  },
  {
    id: 'video-b1',
    track_id: 'track-b',
    video_url: 'https://example.com/b1.mp4',
    thumbnail_url: 'https://example.com/b1.jpg',
    style: 'Lyric Video',
    status: 'ready',
    created_at: '2026-08-24T00:00:00Z',
  },
  {
    id: 'video-a2',
    track_id: 'track-a',
    video_url: 'https://example.com/a2.mp4',
    thumbnail_url: 'https://example.com/a2.jpg',
    style: 'Motion Cover',
    status: 'ready',
    created_at: '2026-08-24T00:00:00Z',
  },
];

test('promoVideosForTrack returns only promo videos for the selected track', () => {
  assert.deepEqual(
    promoVideosForTrack(videos, 'track-a').map((video) => video.id),
    ['video-a1', 'video-a2'],
  );
});

test('promoVideosForTrack returns no videos until a track is selected', () => {
  assert.deepEqual(promoVideosForTrack(videos, ''), []);
});

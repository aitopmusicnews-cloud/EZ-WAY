import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshWorkspaceMediaSources, sanitizeMediaForCache } from './workspaceMediaRefresh.ts';

const resolver = async ({ objectKey, url }: { objectKey?: string | null; url?: string | null }) => ({
  url: objectKey ? `https://fresh.example/${encodeURIComponent(objectKey)}` : String(url || ''),
  objectKey: objectKey || null,
});

test('refreshWorkspaceMediaSources refreshes every keyed workspace media family', async () => {
  const workspace = {
    tracks: [{ id: 't1', file_key: 'tracks/audio/t1/a.wav', file_url: 'old-audio', image_key: 'tracks/artwork/t1/a.jpg', image_url: 'old-art' }],
    playlists: [{ id: 'p1', image_key: 'tracks/artwork/p1/a.jpg', image_url: 'old-playlist' }],
    clients: [{ id: 'c1', avatar_key: 'profiles/c1/a.jpg', avatar_url: 'old-client' }],
    messages: [{ id: 'm1', image_key: 'messages/images/m1/a.jpg', image_url: 'old-message', attachment_key: 'messages/attachments/m1/a.pdf', attachment_url: 'old-attachment' }],
    promoVideos: [{ id: 'v1', video_key: 'promo/videos/v1/a.mp4', video_url: 'old-video', thumbnail_key: 'tracks/artwork/v1/a.jpg', thumbnail_url: 'old-thumb' }],
    profile: { id: 'me', avatar_key: 'profiles/me/a.jpg', avatar_url: 'old-profile' },
  };

  const refreshed = await refreshWorkspaceMediaSources(workspace, resolver);

  assert.match(refreshed.tracks[0].file_url, /tracks%2Faudio/);
  assert.match(refreshed.tracks[0].image_url, /tracks%2Fartwork/);
  assert.match(refreshed.playlists[0].image_url, /tracks%2Fartwork/);
  assert.match(refreshed.clients[0].avatar_url, /profiles%2F/);
  assert.match(refreshed.messages[0].image_url, /messages%2Fimages/);
  assert.match(refreshed.messages[0].attachment_url, /messages%2Fattachments/);
  assert.match(refreshed.promoVideos[0].video_url, /promo%2Fvideos/);
  assert.match(refreshed.promoVideos[0].thumbnail_url, /tracks%2Fartwork/);
  assert.match(refreshed.profile!.avatar_url, /profiles%2F/);
});

test('sanitizeMediaForCache removes disposable URLs when a stable key exists', () => {
  const cached = sanitizeMediaForCache({
    file_key: 'tracks/audio/t1/a.wav',
    file_url: 'https://signed.example/audio',
    image_key: 'tracks/artwork/t1/a.jpg',
    image_url: 'https://signed.example/art',
    avatar_url: 'https://public.example/avatar.jpg',
  });

  assert.equal(cached.file_url, null);
  assert.equal(cached.image_url, null);
  assert.equal(cached.avatar_url, 'https://public.example/avatar.jpg');
});

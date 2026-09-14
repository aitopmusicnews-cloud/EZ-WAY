import type { PromoVideo, Track } from '../types';

// Keep YouTube's promo-video chooser scoped to the track selected first.
export const promoVideosForTrack = (
  promoVideos: PromoVideo[],
  trackId: string,
): PromoVideo[] => {
  const selectedTrackId = String(trackId || '').trim();
  if (!selectedTrackId) return [];
  return promoVideos.filter((video) => video.track_id === selectedTrackId);
};

export interface YouTubeSEOPackage {
  title: string;
  description: string;
  tags: string;
  keywords: string;
}

// Genre/mood keywords inferred from track tags
const GENRE_MAP: Record<string, string[]> = {
  trap: ['trap beat', 'trap music', 'hip hop instrumental', 'rap beat'],
  lofi: ['lofi hip hop', 'chill beats', 'study music', 'relaxing beats'],
  drill: ['drill beat', 'uk drill', 'drill music', 'dark trap'],
  rnb: ['r&b beat', 'soul music', 'neo soul', 'smooth r&b'],
  pop: ['pop beat', 'pop music', 'catchy beat', 'mainstream music'],
  afrobeats: ['afrobeats', 'afro pop', 'afro music', 'dancehall'],
  reggae: ['reggae beat', 'dancehall', 'reggae music', 'island vibes'],
  jazz: ['jazz beat', 'jazz music', 'smooth jazz', 'jazz instrumental'],
  ambient: ['ambient music', 'atmospheric beat', 'cinematic music', 'background music'],
};

const inferGenreKeywords = (tags: string[]): string[] => {
  const lower = tags.map((t) => t.toLowerCase());
  const found: string[] = [];
  for (const [key, kws] of Object.entries(GENRE_MAP)) {
    if (lower.some((t) => t.includes(key))) found.push(...kws);
  }
  return found.length ? found : ['instrumental beat', 'music producer', 'original music'];
};

const camelotToKey = (key: string): string => key || 'C Major';

export function generateYouTubeSEO(
  track: Pick<Track, 'name' | 'artist' | 'bpm' | 'key_signature' | 'tags' | 'lyrics' | 'duration'>,
  options: { videoStyle?: string; spotifyLink?: string; appleLink?: string; instagramHandle?: string } = {},
): YouTubeSEOPackage {
  const name = track.name || 'Untitled';
  const artist = track.artist || 'Independent Artist';
  const bpm = track.bpm ? `${track.bpm} BPM` : '';
  const key = camelotToKey(track.key_signature || '');
  const tags = track.tags || [];
  const genreKws = inferGenreKeywords(tags);
  const primaryGenre = genreKws[0] || 'instrumental';
  const style = options.videoStyle || 'Official Lyric Video';

  // Title: front-load track name + artist, include genre signal and year
  const year = new Date().getFullYear();
  const title = `${name} - ${artist} (${style}) [${primaryGenre}] ${year}`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  // Tags: track-specific + genre + producer terms
  const tagList = [
    name,
    artist,
    ...tags,
    ...genreKws,
    'music producer',
    'new music',
    `${year} music`,
    bpm,
    key,
    style.toLowerCase(),
    'free beat',
    'type beat',
  ]
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 30)
    .join(', ');

  // Keywords (YouTube doesn't have a separate keywords field but we surface these for the UI)
  const keywords = [
    name,
    artist,
    primaryGenre,
    bpm,
    key,
    ...tags.slice(0, 5),
  ]
    .filter(Boolean)
    .join(', ');

  // Duration string
  const dur = track.duration
    ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}`
    : '';

  // Streaming links block
  const links = [
    options.spotifyLink ? `🟢 Spotify: ${options.spotifyLink}` : '',
    options.appleLink ? `🍎 Apple Music: ${options.appleLink}` : '',
    options.instagramHandle
      ? `📸 Instagram: @${options.instagramHandle.replace('@', '')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Lyrics snippet (first 3 non-empty lines, strip LRC timestamps)
  const lyricsSnippet = (track.lyrics || '')
    .split('\n')
    .map((l) => l.replace(/^\[\d+:\d+\.\d+\]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ');

  const description = [
    `🎵 "${name}" by ${artist}`,
    style ? `📽️ ${style}` : '',
    '',
    links,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🎹 TRACK INFO',
    `Artist: ${artist}`,
    bpm ? `Tempo: ${bpm}` : '',
    `Key: ${key}`,
    dur ? `Duration: ${dur}` : '',
    primaryGenre ? `Genre: ${primaryGenre}` : '',
    '',
    lyricsSnippet ? `🎤 Lyrics preview:\n${lyricsSnippet}` : '',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `🔔 Subscribe for new releases`,
    `#${name.replace(/\s+/g, '')} #${artist.replace(/\s+/g, '')} #${primaryGenre.replace(/\s+/g, '')}`,
  ]
    .filter((l) => l !== null && l !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, description, tags: tagList, keywords };
}

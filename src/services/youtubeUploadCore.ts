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

export interface YouTubeLyricSEOResearch {
  suggestions: string[];
  competitorTags: string[];
  rankedTags?: string[];
}

export interface YouTubeSEOOptions {
  videoStyle?: string;
  spotifyLink?: string;
  appleLink?: string;
  amazonLink?: string;
  instagramHandle?: string;
  autocompleteSuggestions?: string[];
  competitorTags?: string[];
  rankedTags?: string[];
}

export const LYRIC_FOUNDATION_TAGS = [
  'lyrics',
  'lyric video',
  'lyrics video',
  'sing along',
  'clean lyrics',
] as const;

// Genre/mood keywords inferred from track tags. These are release/discovery phrases,
// not beat-selling terms: the YouTube Hub publishes completed songs with lyrics.
const GENRE_MAP: Record<string, string[]> = {
  trap: ['trap music', 'hip hop music', 'rap music', 'dark trap'],
  lofi: ['lofi hip hop', 'chill music', 'study music', 'relaxing music'],
  drill: ['drill music', 'uk drill', 'hip hop music', 'dark trap'],
  rnb: ['r&b music', 'soul music', 'neo soul', 'smooth r&b'],
  pop: ['pop music', 'synth pop', 'new pop music', 'mainstream pop'],
  afrobeats: ['afrobeats', 'afro pop', 'afro music', 'dancehall'],
  reggae: ['reggae music', 'dancehall', 'island music', 'reggae song'],
  jazz: ['jazz music', 'smooth jazz', 'modern jazz', 'jazz song'],
  ambient: ['ambient music', 'atmospheric music', 'cinematic music', 'background music'],
};

const normalizePhrase = (value: unknown): string => String(value || '')
  .trim()
  .replace(/\s+/g, ' ');

const normalizeTag = (value: unknown): string => normalizePhrase(value).toLowerCase();

const uniquePhrases = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = normalizePhrase(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

const seoResearchCache = new Map<string, YouTubeLyricSEOResearch>();
let amazonMusicLinkOverride = '';

const researchKey = (seed: string): string => normalizePhrase(seed).toLowerCase();

export const buildYouTubeSEOSeed = (name: string, artist?: string): string =>
  normalizePhrase(`${artist || ''} ${name || ''}`);

export const cacheYouTubeSEOResearch = (seed: string, research: Partial<YouTubeLyricSEOResearch>) => {
  const key = researchKey(seed);
  if (!key) return;
  seoResearchCache.set(key, {
    suggestions: uniquePhrases(research.suggestions || []),
    competitorTags: uniquePhrases(research.competitorTags || []).map((tag) => tag.toLowerCase()),
    rankedTags: uniquePhrases(research.rankedTags || []).map((tag) => tag.toLowerCase()),
  });
};

export const setYouTubeAmazonMusicLink = (url: string) => {
  amazonMusicLinkOverride = normalizePhrase(url);
};

export const buildLyricAutocompleteQueries = (seedKeyword: string): string[] => {
  const seed = normalizePhrase(seedKeyword);
  if (!seed) return [];
  return [
    seed,
    `${seed} lyrics`,
    `${seed} lyric video`,
    `${seed} karaoke`,
    `${seed} clean lyrics`,
  ];
};

/**
 * Legacy/direct ranking helper. Foundation intent remains first for callers that
 * only provide competitor/genre terms. generateYouTubeSEO performs the richer
 * song-specific ranking when track and live-search context are available.
 */
export const rankLyricSeoTags = (
  competitorTags: string[] = [],
  genreTags: string[] = [],
): string[] => {
  const foundation = [...LYRIC_FOUNDATION_TAGS];
  const foundationKeys = new Set(foundation.map(normalizeTag));
  const counts = new Map<string, { count: number; first: number }>();

  competitorTags.forEach((raw, index) => {
    const tag = normalizeTag(raw);
    if (!tag || foundationKeys.has(tag)) return;
    const current = counts.get(tag);
    counts.set(tag, current
      ? { ...current, count: current.count + 1 }
      : { count: 1, first: index });
  });

  const competitorRanked = Array.from(counts.entries())
    .sort((a, b) => (b[1].count - a[1].count) || (a[1].first - b[1].first))
    .map(([tag]) => tag);

  return uniquePhrases([
    ...foundation,
    ...competitorRanked,
    ...genreTags.map(normalizeTag),
  ]).map((tag) => tag.toLowerCase());
};

const inferGenreKeywords = (tags: string[]): string[] => {
  const lower = tags.map((t) => t.toLowerCase());
  const found: string[] = [];
  for (const [key, kws] of Object.entries(GENRE_MAP)) {
    if (lower.some((t) => t.includes(key))) found.push(...kws);
  }
  return found.length ? uniquePhrases(found) : ['original music', 'independent artist'];
};

const inferPrimaryGenre = (tags: string[]): string => {
  const lower = tags.map((tag) => normalizeTag(tag));
  const matched = Object.keys(GENRE_MAP).find((genre) => lower.some((tag) => tag.includes(genre)));
  return matched || normalizePhrase(tags[0]) || 'original music';
};

const camelotToKey = (key: string): string => key || 'C Major';

const stripLrcTimestamps = (lyrics: string): string => lyrics
  .split('\n')
  .map((line) => line.replace(/^(?:\[\d{1,2}:\d{2}(?:[.:]\d+)?\]\s*)+/, '').trimEnd())
  .join('\n')
  .trim();

const hashtag = (value: string): string => value.replace(/[^a-zA-Z0-9]/g, '');

const LIVE_INTENT_WEIGHTS: Array<[RegExp, number]> = [
  [/\blyrics?\b/i, 20],
  [/\blyric video\b/i, 18],
  [/\bmeaning\b/i, 14],
  [/\bkaraoke\b/i, 12],
  [/\bclean lyrics?\b/i, 10],
  [/\bsing along\b/i, 8],
  [/\bofficial\b/i, 5],
];

const scoreSongSpecificPhrase = (
  phrase: string,
  name: string,
  artist: string,
): number => {
  const value = normalizeTag(phrase);
  const title = normalizeTag(name);
  const performer = normalizeTag(artist);
  const fullSeed = normalizeTag(`${artist} ${name}`);
  if (!value || !title) return -1;

  const containsFullSeed = Boolean(fullSeed && value.includes(fullSeed));
  const containsTitle = value.includes(title);
  const containsArtist = Boolean(performer && value.includes(performer));
  if (!containsFullSeed && !containsTitle) return -1;

  let score = containsFullSeed ? 60 : 35;
  if (containsArtist) score += 8;
  for (const [pattern, weight] of LIVE_INTENT_WEIGHTS) {
    if (pattern.test(value)) score += weight;
  }
  if (value === `${fullSeed} lyrics`) score += 100;
  return score;
};

const rankSongSpecificPhrases = (
  values: string[],
  name: string,
  artist: string,
): string[] => uniquePhrases(values)
  .map((value, index) => ({
    value: normalizeTag(value),
    index,
    score: scoreSongSpecificPhrase(value, name, artist),
  }))
  .filter((entry) => entry.score >= 0)
  .sort((a, b) => (b.score - a.score) || (a.index - b.index))
  .map((entry) => entry.value);

const rankCompetitorTerms = (competitorTags: string[]): string[] => {
  const foundation = new Set(LYRIC_FOUNDATION_TAGS.map(normalizeTag));
  const weak = new Set(['music', 'video', 'audio']);
  const counts = new Map<string, { count: number; first: number }>();

  competitorTags.forEach((raw, index) => {
    const tag = normalizeTag(raw);
    if (!tag || foundation.has(tag) || weak.has(tag)) return;
    const current = counts.get(tag);
    counts.set(tag, current
      ? { ...current, count: current.count + 1 }
      : { count: 1, first: index });
  });

  return Array.from(counts.entries())
    .sort((a, b) => (b[1].count - a[1].count) || (a[1].first - b[1].first))
    .map(([tag]) => tag);
};

const LYRIC_STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'along', 'also', 'because', 'been', 'before',
  'being', 'between', 'could', 'every', 'from', 'have', 'into', 'just', 'more', 'most',
  'never', 'only', 'other', 'over', 'should', 'some', 'than', 'that', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'very', 'want',
  'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your', 'youre',
  'lyrics', 'lyric', 'video', 'official', 'music', 'song',
]);

const extractLyricThemes = (lyrics: string, name: string, artist: string): string[] => {
  const excluded = new Set([
    ...LYRIC_STOP_WORDS,
    ...normalizeTag(name).match(/[a-z0-9']+/g) || [],
    ...normalizeTag(artist).match(/[a-z0-9']+/g) || [],
  ]);
  const counts = new Map<string, { count: number; first: number }>();
  const words = stripLrcTimestamps(lyrics)
    .toLowerCase()
    .match(/[a-z][a-z']{3,}/g) || [];

  words.forEach((word, index) => {
    if (excluded.has(word)) return;
    const current = counts.get(word);
    counts.set(word, current
      ? { ...current, count: current.count + 1 }
      : { count: 1, first: index });
  });

  return Array.from(counts.entries())
    .filter(([, data]) => data.count >= 2)
    .sort((a, b) => (b[1].count - a[1].count) || (a[1].first - b[1].first))
    .slice(0, 6)
    .map(([word]) => word);
};

export function buildLyricDescriptionSystemPrompt(
  songTitle: string,
  artistName: string,
  genre: string,
): string {
  const title = normalizePhrase(songTitle) || 'Untitled';
  const artist = normalizePhrase(artistName) || 'Independent Artist';
  const songGenre = normalizePhrase(genre) || 'music';

  return `You are an expert YouTube Music SEO assistant specializing in Lyric Channels.
Write a search-optimized description for the full track "${title}" by "${artist}" (${songGenre}).

STRICT LYRIC-VIDEO STRUCTURE:
- The first 2 lines must identify the Song Title, Artist, Genre, then deliver an engaging hook that naturally targets lyric-search intent.
- STREAMING SECTION: include Spotify, Apple Music, and Amazon Music. Preserve real URLs when supplied; otherwise keep clear editable placeholders.
- LYRICS SECTION: create a dedicated clean block for the complete song lyrics. Never summarize or truncate supplied lyrics. If none are supplied, use [PASTE_LYRICS_HERE].
- CREDITS: include editable lines for Producer, Songwriter(s), and Vocalist(s).
- Keep the copy about a completed artist release, not a beat for sale. Do not add beat leases, type-beat sales, or invented credits.
- End with concise discovery hashtags that include the artist, song title, genre, #lyrics, and #lyricvideo.

The hook should sound natural, engaging, and aesthetically appropriate for ${songGenre}.`;
}

export function generateYouTubeSEO(
  track: Pick<Track, 'name' | 'artist' | 'bpm' | 'key_signature' | 'tags' | 'lyrics' | 'duration'>,
  options: YouTubeSEOOptions = {},
): YouTubeSEOPackage {
  const name = normalizePhrase(track.name) || 'Untitled';
  const artist = normalizePhrase(track.artist) || 'Independent Artist';
  const bpm = track.bpm ? `${track.bpm} BPM` : '';
  const key = camelotToKey(track.key_signature || '');
  const trackTags = track.tags || [];
  const genreKws = inferGenreKeywords(trackTags);
  const primaryGenre = inferPrimaryGenre(trackTags);
  const style = normalizePhrase(options.videoStyle) || 'Official Lyric Video';

  const seed = buildYouTubeSEOSeed(name, artist);
  const cached = seoResearchCache.get(researchKey(seed));
  const suggestions = uniquePhrases([
    ...(options.autocompleteSuggestions || []),
    ...(cached?.suggestions || []),
  ]);
  const competitorTags = uniquePhrases([
    ...(options.competitorTags || []),
    ...(cached?.competitorTags || []),
  ]);
  const localRankedTags = uniquePhrases([
    ...(options.rankedTags || []),
    ...(cached?.rankedTags || []),
  ]);

  const exactSongSearch = normalizeTag(`${artist} ${name} lyrics`);
  const liveSongTerms = rankSongSpecificPhrases([
    exactSongSearch,
    ...suggestions,
    ...localRankedTags,
  ], name, artist);
  const competitorRanked = rankCompetitorTerms(competitorTags);
  const lyricThemes = extractLyricThemes(track.lyrics || '', name, artist);

  const title = `${artist} - ${name} (${style})`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  const tagList = uniquePhrases([
    ...liveSongTerms,
    ...competitorRanked,
    `${name} lyrics`,
    `${name} lyric video`,
    `${artist} lyrics`,
    ...lyricThemes,
    ...LYRIC_FOUNDATION_TAGS,
    ...genreKws,
    ...trackTags,
    primaryGenre,
    style.toLowerCase(),
    'official lyrics',
  ])
    .map((tag) => tag.toLowerCase())
    .slice(0, 30)
    .join(', ');

  const keywords = uniquePhrases([
    ...liveSongTerms,
    `${name} lyrics`,
    `${name} lyric video`,
    `${name} karaoke`,
    `${name} clean lyrics`,
    ...lyricThemes,
    ...competitorRanked,
    ...genreKws,
    primaryGenre,
    ...trackTags.slice(0, 5),
    ...LYRIC_FOUNDATION_TAGS,
  ])
    .map((term) => term.toLowerCase())
    .slice(0, 30)
    .join(', ');

  const dur = track.duration
    ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}`
    : '';

  const spotify = normalizePhrase(options.spotifyLink) || '[Spotify link]';
  const apple = normalizePhrase(options.appleLink) || '[Apple Music link]';
  const amazon = normalizePhrase(options.amazonLink) || amazonMusicLinkOverride || '[Amazon Music link]';
  const fullLyrics = stripLrcTimestamps(track.lyrics || '') || '[PASTE_LYRICS_HERE]';
  const themeHook = lyricThemes.length
    ? `Built around ${lyricThemes.slice(0, 2).join(' and ')}, this ${primaryGenre} lyric video keeps the words front and center.`
    : `Sing along with the official lyric video and experience every line of this ${primaryGenre} track.`;

  const description = [
    `🎵 ${name} — ${artist} | ${primaryGenre}`,
    themeHook,
    '',
    '🎧 STREAM / DOWNLOAD',
    `Spotify: ${spotify}`,
    `Apple Music: ${apple}`,
    `Amazon Music: ${amazon}`,
    '',
    options.instagramHandle
      ? `Follow ${artist}: Instagram @${options.instagramHandle.replace('@', '')}`
      : `Follow ${artist}: [Artist social links]`,
    '',
    '📝 LYRICS',
    fullLyrics,
    '',
    '🎼 CREDITS',
    'Producer: [Producer]',
    'Songwriter(s): [Songwriters]',
    'Vocalist(s): [Vocalists]',
    '',
    '🎹 TRACK INFO',
    `Artist: ${artist}`,
    `Genre: ${primaryGenre}`,
    bpm ? `Tempo: ${bpm}` : '',
    key ? `Key: ${key}` : '',
    dur ? `Duration: ${dur}` : '',
    '',
    '🎬 VISUAL CREDIT',
    '[Video / visual credit]',
    '',
    '📩 LICENSING / CONTACT',
    '[Contact email]',
    '',
    `#${hashtag(artist)} #${hashtag(name)} #${hashtag(primaryGenre)} #lyrics #lyricvideo`,
  ]
    .filter((line) => line !== '')
    .reduce<string[]>((lines, line, index, original) => {
      lines.push(line);
      const next = original[index + 1];
      const isSectionBoundary = next && /^(🎧|📝|🎼|🎹|🎬|📩|#)/.test(next);
      if (isSectionBoundary) lines.push('');
      return lines;
    }, [])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, description, tags: tagList, keywords };
}

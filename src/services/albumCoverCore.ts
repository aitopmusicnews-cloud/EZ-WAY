import type { Track } from '../types';
import type { MusicIntelligenceProfile } from './musicIntelligenceCore';

export const DEFAULT_COVER_VARIATION_COUNT = 3 as const;

export interface AlbumCoverDraft {
  trackId: string;
  title: string;
  artist: string;
  lyrics: string;
  genre: string;
  mood: string;
  style: string;
  bpm: number;
  key: string;
  instruments: string[];
  keywords: string[];
}

const clean = (value: unknown): string => String(value ?? '').trim();

const getTaggedValue = (tags: string[] | undefined, prefix: string): string => {
  const normalizedPrefix = prefix.toLocaleLowerCase();
  const match = (tags || []).find((tag) => clean(tag).toLocaleLowerCase().startsWith(normalizedPrefix));
  return match ? clean(match).slice(prefix.length).trim() : '';
};

const splitList = (value: string): string[] => value
  .split(',')
  .map((item) => clean(item))
  .filter(Boolean);

const firstRanked = (items: Array<{ label: string; score: number }> | undefined): string => clean(items?.[0]?.label);

export const buildAlbumCoverDraft = (
  track: Track,
  profile?: MusicIntelligenceProfile | null,
): AlbumCoverDraft => {
  const profileGenre = clean(profile?.primary_genre);
  const genre = profileGenre && profileGenre !== 'Unknown'
    ? profileGenre
    : getTaggedValue(track.tags, 'genre_category:');
  const mood = firstRanked(profile?.moods) || getTaggedValue(track.tags, 'mood:');
  const style = firstRanked(profile?.styles) || getTaggedValue(track.tags, 'vibe:');
  const profileInstruments = (profile?.instruments || [])
    .slice(0, 5)
    .map((item) => clean(item.label))
    .filter(Boolean);
  const instruments = profileInstruments.length
    ? profileInstruments
    : splitList(getTaggedValue(track.tags, 'instruments:'));
  const bpm = profile && Number.isFinite(profile.bpm) && Number(profile.bpm) > 0
    ? Math.round(Number(profile.bpm))
    : (Number.isFinite(track.bpm) && Number(track.bpm) > 0 ? Math.round(Number(track.bpm)) : 0);
  const profileKey = clean(profile?.key);
  const camelot = clean(profile?.camelot_key);
  const key = profileKey
    ? (camelot && !profileKey.includes(camelot) ? `${profileKey} (${camelot})` : profileKey)
    : clean(track.key_signature);

  return {
    trackId: track.id,
    title: clean(track.name),
    artist: clean(track.artist),
    lyrics: clean(track.lyrics),
    genre,
    mood,
    style,
    bpm,
    key,
    instruments,
    keywords: (profile?.keywords || []).map(clean).filter(Boolean).slice(0, 8),
  };
};

export const trackNeedsCoverPrompt = (track: Pick<Track, 'image_url' | 'image_data'>): boolean => {
  const hasRemoteArtwork = Boolean(clean(track.image_url));
  const hasLocalArtwork = track.image_data instanceof Blob && track.image_data.size > 0;
  return !hasRemoteArtwork && !hasLocalArtwork;
};

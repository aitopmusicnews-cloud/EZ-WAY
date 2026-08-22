import type { Track } from '../types';
import type { MusicIntelligenceProfile } from './musicIntelligenceCore';

export interface CopyrightDraft {
  trackId: string;
  title: string;
  artist: string;
  coArtists: string;
  genre: string;
  description: string;
  lyrics: string;
  dateCreated: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface CopyrightEvidenceRecord extends CopyrightDraft {
  id: string;
  dateRegistered: string;
  registrationNumber: string;
  digitalFingerprint: string;
  fileHash: string;
  status: 'registered';
  evidenceVersion: 'ezcopyright-v1';
}

const clean = (value: unknown): string => String(value ?? '').trim();

const getTaggedValue = (tags: string[] | undefined, prefix: string): string => {
  const normalizedPrefix = prefix.toLocaleLowerCase();
  const match = (tags || []).find((tag) => clean(tag).toLocaleLowerCase().startsWith(normalizedPrefix));
  return match ? clean(match).slice(prefix.length).trim() : '';
};

const safeCreationDate = (value: string | null | undefined): string => {
  const candidate = clean(value);
  if (!candidate) return '';
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const extensionForType = (fileType: string): string => {
  const normalized = clean(fileType).toLocaleLowerCase();
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('flac')) return 'flac';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('mp4')) return 'm4a';
  if (normalized.includes('webm')) return 'webm';
  return 'mp3';
};

const safeFileNameFromUrl = (fileUrl: string | null | undefined): string => {
  const source = clean(fileUrl);
  if (!source) return '';
  try {
    const pathname = new URL(source, 'https://ezway.local').pathname;
    const name = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
    return clean(name);
  } catch {
    return '';
  }
};

const fallbackFileName = (track: Track): string => {
  const base = clean(track.name)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'track';
  return `${base}.${extensionForType(track.type)}`;
};

const rankedLabel = (items: Array<{ label: string; score: number }> | undefined): string => clean(items?.[0]?.label);

const descriptionParts = (track: Track, profile?: MusicIntelligenceProfile | null): string[] => {
  const legacyGenre = getTaggedValue(track.tags, 'genre_category:');
  const legacyMood = getTaggedValue(track.tags, 'mood:');
  const legacyStyle = getTaggedValue(track.tags, 'vibe:');
  const legacyInstruments = getTaggedValue(track.tags, 'instruments:');

  const genre = profile && clean(profile.primary_genre) && clean(profile.primary_genre) !== 'Unknown'
    ? clean(profile.primary_genre)
    : legacyGenre;
  const mood = rankedLabel(profile?.moods) || legacyMood;
  const style = rankedLabel(profile?.styles) || legacyStyle;
  const instruments = (profile?.instruments || [])
    .slice(0, 4)
    .map((item) => clean(item.label))
    .filter(Boolean)
    .join(', ') || legacyInstruments;
  const bpmValue = profile && Number.isFinite(profile.bpm) && Number(profile.bpm) > 0
    ? Math.round(profile.bpm)
    : (Number.isFinite(track.bpm) && Number(track.bpm) > 0 ? Math.round(track.bpm) : 0);
  const key = clean(profile?.key) || clean(track.key_signature);
  const camelot = clean(profile?.camelot_key);
  const formattedKey = key && camelot && !key.includes(camelot) ? `${key} (${camelot})` : key;
  const keywords = (profile?.keywords || []).map(clean).filter(Boolean).slice(0, 5);

  return [
    genre ? `Genre: ${genre}` : '',
    mood ? `Mood: ${mood}` : '',
    style ? `Style: ${style}` : '',
    bpmValue ? `BPM: ${bpmValue}` : '',
    formattedKey ? `Key: ${formattedKey}` : '',
    instruments ? `Instruments: ${instruments}` : '',
    keywords.length ? `Keywords: ${keywords.join(', ')}` : '',
  ].filter(Boolean);
};

export const buildCopyrightDraft = (
  track: Track,
  profile?: MusicIntelligenceProfile | null,
): CopyrightDraft => {
  const profileGenre = profile && clean(profile.primary_genre) !== 'Unknown'
    ? clean(profile.primary_genre)
    : '';
  const fileName = safeFileNameFromUrl(track.file_url) || fallbackFileName(track);

  return {
    trackId: track.id,
    title: clean(track.name),
    artist: clean(track.artist),
    coArtists: '',
    genre: profileGenre || getTaggedValue(track.tags, 'genre_category:'),
    description: descriptionParts(track, profile).join(' • '),
    lyrics: clean(track.lyrics),
    dateCreated: safeCreationDate(track.created_at),
    fileName,
    fileSize: Number(track.size || 0),
    fileType: clean(track.type) || 'audio',
  };
};

const bytesToHex = (bytes: Uint8Array): string => Array.from(bytes)
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('')
  .toUpperCase();

const sha256Hex = async (data: ArrayBuffer | Uint8Array | string): Promise<string> => {
  let input: BufferSource;
  if (typeof data === 'string') {
    input = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    input = data;
  } else {
    input = data;
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return bytesToHex(new Uint8Array(digest));
};

const randomHex = (byteLength = 6): string => {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

const createRegistrationNumber = (dateRegistered: Date): string => (
  `EZ-${dateRegistered.getUTCFullYear()}-${randomHex(6)}`
);

export const createCopyrightEvidence = async (
  draft: CopyrightDraft,
  audio: Blob,
  options: { now?: Date; id?: string; registrationNumber?: string } = {},
): Promise<CopyrightEvidenceRecord> => {
  const now = options.now ?? new Date();
  const dateRegistered = now.toISOString();
  const fileHash = await sha256Hex(await audio.arrayBuffer());
  const registrationNumber = clean(options.registrationNumber) || createRegistrationNumber(now);
  const digitalFingerprint = await sha256Hex([
    clean(draft.title),
    clean(draft.artist),
    dateRegistered,
    fileHash,
  ].join('|'));

  return {
    ...draft,
    id: clean(options.id) || globalThis.crypto.randomUUID(),
    dateRegistered,
    registrationNumber,
    digitalFingerprint,
    fileHash,
    status: 'registered',
    evidenceVersion: 'ezcopyright-v1',
  };
};

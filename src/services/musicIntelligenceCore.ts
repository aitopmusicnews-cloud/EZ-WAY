export interface RankedLabel {
  label: string;
  score: number;
}

export interface MusicSection {
  label: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface MusicChapter {
  label: string;
  start: number;
  end: number;
  timestamp: string;
}

export interface MusicIntelligenceProfile {
  version: string;
  analyzed_at: string;
  bpm: number;
  bpm_confidence?: number;
  key?: string;
  key_confidence?: number;
  camelot_key?: string;
  primary_genre: string;
  genre_confident: boolean;
  genres: RankedLabel[];
  moods: RankedLabel[];
  styles: RankedLabel[];
  instruments: RankedLabel[];
  sections: MusicSection[];
  chapters: MusicChapter[];
  keywords: string[];
  evidence: Record<string, unknown>;
  warnings: string[];
}

export interface LegacyTrackAnalysisUpdates {
  bpm: number;
  key_signature: string;
  tags: string[];
}

const ANALYZER_TAG_PREFIXES = [
  'camelot_key:',
  'genre_category:',
  'mood:',
  'vibe:',
  'instruments:',
  'pitch:',
  'analysis_version:',
];

const MANUAL_GENRE_PREFIX = 'genre_override:';

const CLASSIFIER_GENRE_LABELS = [
  'Hip-Hop', 'Trap', 'Drill', 'Boom Bap', 'Lo-fi Hip-Hop', 'R&B',
  'Alternative R&B', 'Neo Soul', 'Soul', 'Gospel', 'Pop', 'Indie Pop',
  'Rock', 'Alternative Rock', 'Metal', 'Punk', 'Jazz', 'Blues', 'Funk',
  'Reggae', 'Dancehall', 'Afrobeats', 'Amapiano', 'Reggaeton', 'Latin Pop',
  'House', 'Techno', 'Trance', 'Drum and Bass', 'Dubstep', 'Ambient',
  'Cinematic', 'Synthwave', 'Phonk', 'Country', 'Folk', 'Classical',
];

const clean = (value: unknown) => String(value ?? '').trim();

const classifierGenreKeys = new Set(
  CLASSIFIER_GENRE_LABELS.map((label) => label.toLocaleLowerCase()),
);

const isClassifierGenre = (value: unknown) => classifierGenreKeys.has(
  clean(value).toLocaleLowerCase(),
);

const readTagValue = (tags: string[], prefix: string) => {
  const normalizedPrefix = prefix.toLocaleLowerCase();
  const tag = tags.find((candidate) => clean(candidate).toLocaleLowerCase().startsWith(normalizedPrefix));
  return tag ? clean(tag).slice(prefix.length).trim() : '';
};

const dedupeCaseInsensitive = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = clean(value);
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
};

export const applyManualGenreOverride = (
  existingTags: string[] = [],
  genre: string,
): string[] => {
  const verifiedGenre = clean(genre);
  const preservedTags = existingTags.filter((tag) => {
    const normalized = clean(tag).toLocaleLowerCase();
    return normalized
      && !normalized.startsWith('genre_category:')
      && !normalized.startsWith(MANUAL_GENRE_PREFIX)
      && !isClassifierGenre(tag);
  });

  if (!verifiedGenre) return dedupeCaseInsensitive(preservedTags);

  return dedupeCaseInsensitive([
    ...preservedTags,
    `${MANUAL_GENRE_PREFIX}${verifiedGenre}`,
    `genre_category:${verifiedGenre}`,
  ]);
};

export const profileToLegacyTrackUpdates = (
  profile: MusicIntelligenceProfile,
  existingTags: string[] = [],
): LegacyTrackAnalysisUpdates => {
  const mood = clean(profile.moods?.[0]?.label);
  const style = clean(profile.styles?.[0]?.label);
  const instrumentLabels = (profile.instruments || [])
    .slice(0, 4)
    .map((item) => clean(item.label))
    .filter(Boolean);

  const manualGenre = readTagValue(existingTags || [], MANUAL_GENRE_PREFIX);
  const verifiedGenre = manualGenre || (
    profile.genre_confident
    && profile.primary_genre
    && clean(profile.primary_genre).toLocaleLowerCase() !== 'unknown'
      ? clean(profile.primary_genre)
      : ''
  );

  const preservedTags = (existingTags || []).filter((tag) => {
    const normalized = clean(tag).toLocaleLowerCase();
    return normalized
      && !ANALYZER_TAG_PREFIXES.some((prefix) => normalized.startsWith(prefix))
      && !isClassifierGenre(tag);
  });

  const visibleKeywords = (profile.keywords || [])
    .filter((keyword) => !isClassifierGenre(keyword))
    .slice(0, 8);

  const analyzerTags = [
    profile.camelot_key ? `camelot_key:${clean(profile.camelot_key)}` : '',
    verifiedGenre ? `genre_category:${verifiedGenre}` : '',
    mood ? `mood:${mood}` : '',
    style ? `vibe:${style}` : '',
    instrumentLabels.length ? `instruments:${instrumentLabels.join(', ')}` : '',
    ...visibleKeywords,
    ...preservedTags,
  ];

  const key = clean(profile.key) || 'Unknown';
  const camelot = clean(profile.camelot_key);

  return {
    bpm: Number.isFinite(profile.bpm) ? Math.round(profile.bpm) : 0,
    key_signature: camelot && key !== 'Unknown' ? `${key} (${camelot})` : key,
    tags: dedupeCaseInsensitive(analyzerTags),
  };
};

export interface AnalysisSourceIdentity {
  file_url?: string | null;
  size?: number | null;
  duration?: number | null;
  type?: string | null;
}

export interface SavedAnalysisIdentity {
  status?: string | null;
  analyzer_version?: string | null;
  source_fingerprint?: string | null;
}

export const buildAnalysisSourceFingerprint = (source: AnalysisSourceIdentity): string => {
  const raw = [
    clean(source.file_url),
    String(Number(source.size || 0)),
    String(Math.round(Number(source.duration || 0) * 1000) / 1000),
    clean(source.type).toLocaleLowerCase(),
  ].join('|');

  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const shouldReuseAnalysis = (
  saved: SavedAnalysisIdentity | null | undefined,
  sourceFingerprint: string,
  analyzerVersion: string,
): boolean => Boolean(
  saved
  && saved.status === 'ready'
  && clean(saved.source_fingerprint) === clean(sourceFingerprint)
  && clean(saved.analyzer_version) === clean(analyzerVersion),
);

export const hasUsableMusicIntelligenceProfile = (
  profile: MusicIntelligenceProfile | null | undefined,
): boolean => Boolean(
  profile
  && (
    (Number.isFinite(profile.bpm) && Number(profile.bpm) > 0)
    || clean(profile.key)
    || clean(profile.camelot_key)
    || (profile.genres?.length || 0) > 0
    || (profile.moods?.length || 0) > 0
    || (profile.styles?.length || 0) > 0
    || (profile.instruments?.length || 0) > 0
    || (profile.sections?.length || 0) > 0
    || (profile.chapters?.length || 0) > 0
  )
);

export interface RankedLabel {
  label: string;
  score: number;
}

export interface MusicSection {
  label: string;
  start: number;
  end: number;
  confidence: number;
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

const clean = (value: unknown) => String(value ?? '').trim();

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

  const preservedTags = (existingTags || []).filter((tag) => {
    const normalized = clean(tag).toLocaleLowerCase();
    return normalized && !ANALYZER_TAG_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });

  const analyzerTags = [
    profile.camelot_key ? `camelot_key:${clean(profile.camelot_key)}` : '',
    profile.primary_genre && profile.primary_genre !== 'Unknown'
      ? `genre_category:${clean(profile.primary_genre)}`
      : '',
    mood ? `mood:${mood}` : '',
    style ? `vibe:${style}` : '',
    instrumentLabels.length ? `instruments:${instrumentLabels.join(', ')}` : '',
    ...(profile.keywords || []).slice(0, 8),
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

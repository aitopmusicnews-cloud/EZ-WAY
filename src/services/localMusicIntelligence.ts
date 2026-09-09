import type { Track } from '../types.ts';
import { analyzeAudioDsp, type DspAnalysisResult } from './audioDsp.ts';
import type { MusicIntelligenceProfile, RankedLabel } from './musicIntelligenceCore.ts';

export const LOCAL_MUSIC_INTELLIGENCE_VERSION = 'music-intelligence-browser-dsp-v2';

const clean = (value: unknown): string => String(value ?? '').trim();
const clamp = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
};

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = clean(raw);
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

const ranked = (label: unknown, score: number): RankedLabel[] => {
  const value = clean(label);
  return value ? [{ label: value, score: clamp(score) }] : [];
};

export const profileFromDspAnalysis = (dsp: DspAnalysisResult): MusicIntelligenceProfile => {
  const primaryGenre = clean(dsp.genreCategory) || 'Unknown';
  const tempoConfidence = clamp(dsp.spectralMetrics?.tempoConfidence, 0.55);
  const keyConfidence = clamp(dsp.spectralMetrics?.keyConfidence, 0.5);
  const genreScore = primaryGenre === 'Unknown'
    ? 0
    : clamp(0.58 + ((tempoConfidence + keyConfidence) / 2) * 0.12, 0.62);

  const genres = primaryGenre === 'Unknown' ? [] : ranked(primaryGenre, genreScore);
  const moods = ranked(dsp.mood, 0.66);
  const styles = ranked(dsp.vibe, 0.64);
  const instruments = dedupe(dsp.instruments || []).map((label, index) => ({
    label,
    score: clamp(0.7 - index * 0.05, 0.55),
  }));
  const keywords = dedupe([
    ...(dsp.tags || []),
    primaryGenre === 'Unknown' ? '' : primaryGenre,
    dsp.mood,
    dsp.vibe,
    ...(dsp.instruments || []),
  ]).slice(0, 16);

  const bpm = Number.isFinite(Number(dsp.bpm)) && Number(dsp.bpm) > 0
    ? Math.round(Number(dsp.bpm))
    : 0;

  return {
    version: LOCAL_MUSIC_INTELLIGENCE_VERSION,
    analyzed_at: new Date().toISOString(),
    bpm,
    bpm_confidence: tempoConfidence,
    key: clean(dsp.key) || undefined,
    key_confidence: keyConfidence,
    camelot_key: clean(dsp.camelotKey) || undefined,
    primary_genre: primaryGenre,
    genre_confident: primaryGenre !== 'Unknown' && genreScore >= 0.55,
    genres,
    moods,
    styles,
    instruments,
    sections: [],
    chapters: [],
    keywords,
    evidence: {
      provider: 'browser-dsp',
      implementation: 'ezway-audio-dsp',
      analysis_device: 'browser',
      method: 'local-acoustic-feature-classification',
      loudness_lufs: Number.isFinite(Number(dsp.loudnessLUFS)) ? Number(dsp.loudnessLUFS) : null,
      stereo_width: Number.isFinite(Number(dsp.stereoWidth)) ? Number(dsp.stereoWidth) : null,
      phase_correlation: Number.isFinite(Number(dsp.phaseCorrelation)) ? Number(dsp.phaseCorrelation) : null,
      peak_resonance_hz: Number.isFinite(Number(dsp.peakResonanceHz)) ? Number(dsp.peakResonanceHz) : null,
      tuning_note: clean(dsp.tuningNote) || null,
    },
    warnings: primaryGenre === 'Unknown'
      ? ['Genre could not be determined from the local audio analysis.']
      : [],
  };
};

const trackAudioFile = async (track: Track): Promise<File> => {
  if (track.file_data) {
    return new File(
      [track.file_data],
      clean(track.name) || 'track',
      { type: track.file_data.type || clean(track.type) || 'audio/mpeg' },
    );
  }

  const fileUrl = clean(track.file_url);
  if (!fileUrl || fileUrl.startsWith('blob:')) {
    throw new Error('Music Intelligence requires an available audio source.');
  }

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Could not load the track for local analysis (${response.status}).`);
  }
  const blob = await response.blob();
  return new File(
    [blob],
    clean(track.name) || 'track',
    { type: blob.type || clean(track.type) || 'audio/mpeg' },
  );
};

export async function analyzeTrackLocally(track: Track): Promise<MusicIntelligenceProfile> {
  const file = await trackAudioFile(track);
  const dsp = await analyzeAudioDsp(file);
  return profileFromDspAnalysis(dsp);
}

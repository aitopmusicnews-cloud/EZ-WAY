export const DEMUCS_SAMPLE_RATE = 44100;
export const DEMUCS_SEGMENT_SAMPLES = 343980;
export const DEMUCS_OVERLAP_SAMPLES = Math.floor(DEMUCS_SEGMENT_SAMPLES / 4);
export const DEMUCS_STRIDE_SAMPLES = DEMUCS_SEGMENT_SAMPLES - DEMUCS_OVERLAP_SAMPLES;
export const DEMUCS_STEMS = ['drums', 'bass', 'other', 'vocals'] as const;

export type DemucsStemName = typeof DEMUCS_STEMS[number];

export const createDemucsWindow = (
  segmentSamples = DEMUCS_SEGMENT_SAMPLES,
  overlapSamples = DEMUCS_OVERLAP_SAMPLES,
): Float32Array => {
  const segment = Math.max(1, Math.floor(segmentSamples));
  const overlap = Math.max(0, Math.min(Math.floor(overlapSamples), Math.floor(segment / 2)));
  const window = new Float32Array(segment).fill(1);
  if (!overlap) return window;

  for (let index = 0; index < overlap; index += 1) {
    const value = index / overlap;
    window[index] = value;
    window[segment - 1 - index] = value;
  }
  return window;
};

export const extractDemucsStemRows = (
  data: Float32Array,
  stemIndex: number,
  channels = 2,
  segmentSamples = DEMUCS_SEGMENT_SAMPLES,
): Float32Array[] => {
  const stem = Math.floor(stemIndex);
  const channelCount = Math.max(1, Math.floor(channels));
  const samples = Math.max(1, Math.floor(segmentSamples));
  if (stem < 0 || stem >= DEMUCS_STEMS.length) {
    throw new Error(`Invalid HTDemucs stem index: ${stemIndex}`);
  }

  const required = DEMUCS_STEMS.length * channelCount * samples;
  if (data.length < required) {
    throw new Error(`HTDemucs output was too short: expected at least ${required} values, received ${data.length}.`);
  }

  return Array.from({ length: channelCount }, (_, channelIndex) => {
    const start = (stem * channelCount + channelIndex) * samples;
    return data.slice(start, start + samples);
  });
};

export const sumStereoStems = (
  stems: Array<{ left: Float32Array; right: Float32Array; sampleRate: number }>,
) => {
  if (!stems.length) throw new Error('At least one stem is required.');
  const length = stems[0].left.length;
  const sampleRate = stems[0].sampleRate;
  if (stems.some((stem) => stem.left.length !== length || stem.right.length !== length)) {
    throw new Error('Stem channels must have matching lengths.');
  }
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (const stem of stems) {
    for (let index = 0; index < length; index += 1) {
      left[index] += stem.left[index];
      right[index] += stem.right[index];
    }
  }
  return { left, right, sampleRate };
};

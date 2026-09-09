export const SPLEETER_SAMPLE_RATE = 44100;
export const SPLEETER_FFT_SIZE = 4096;
export const SPLEETER_HOP_SIZE = 1024;
export const SPLEETER_MODEL_BINS = 1024;
export const SPLEETER_CHUNK_FRAMES = 512;

export const periodicHann = (size: number): Float32Array => {
  const safeSize = Math.max(1, Math.floor(size));
  const output = new Float32Array(safeSize);
  for (let index = 0; index < safeSize; index += 1) {
    output[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / safeSize);
  }
  return output;
};

export const normalizeStemMasks = (magnitudes: Float32Array[]): Float32Array[] => {
  if (!magnitudes.length) return [];
  const length = magnitudes[0].length;
  if (magnitudes.some((item) => item.length !== length)) {
    throw new Error('Stem mask arrays must have matching lengths.');
  }
  const result = magnitudes.map(() => new Float32Array(length));
  const epsilon = 1e-10;
  for (let index = 0; index < length; index += 1) {
    let total = 0;
    for (const values of magnitudes) {
      const value = Math.max(0, Number(values[index]) || 0);
      total += value;
    }
    if (total <= epsilon) {
      const equal = 1 / magnitudes.length;
      for (const mask of result) mask[index] = equal;
      continue;
    }
    for (let stem = 0; stem < magnitudes.length; stem += 1) {
      result[stem][index] = Math.max(0, Number(magnitudes[stem][index]) || 0) / total;
    }
  }
  return result;
};

export const extendMaskByAverage = (modeled: Float32Array, fullLength: number): Float32Array => {
  const targetLength = Math.max(modeled.length, Math.floor(fullLength));
  const output = new Float32Array(targetLength);
  output.set(modeled);
  if (targetLength === modeled.length) return output;
  let average = 0;
  if (modeled.length > 0) {
    for (const value of modeled) average += Number(value) || 0;
    average /= modeled.length;
  }
  output.fill(average, modeled.length);
  return output;
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

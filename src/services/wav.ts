const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const pcm16 = (value: number): number => {
  const sample = Math.max(-1, Math.min(1, Number(value) || 0));
  return sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
};

export function encodeStereoWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): Blob {
  if (left.length !== right.length) {
    throw new Error('Stereo WAV channels must have the same length.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('WAV sample rate must be positive.');
  }

  const channels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataBytes = left.length * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate) * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let index = 0; index < left.length; index += 1) {
    view.setInt16(offset, pcm16(left[index]), true);
    view.setInt16(offset + 2, pcm16(right[index]), true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

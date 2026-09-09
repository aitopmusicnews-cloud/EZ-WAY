export interface TranscriptChunk {
  text: string;
  timestamp?: [number | null, number | null] | null;
}

export const formatLrcTime = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  let minutes = Math.floor(safe / 60);
  const remaining = safe - minutes * 60;
  let wholeSeconds = Math.floor(remaining);
  let centiseconds = Math.round((remaining - wholeSeconds) * 100);
  if (centiseconds >= 100) {
    wholeSeconds += 1;
    centiseconds = 0;
  }
  if (wholeSeconds >= 60) {
    minutes += 1;
    wholeSeconds = 0;
  }
  return `[${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
};

export const buildLyricsFiles = (chunks: TranscriptChunk[]) => {
  const lines = (chunks || [])
    .map((chunk) => ({
      text: String(chunk?.text || '').trim(),
      start: Number(chunk?.timestamp?.[0] ?? 0),
    }))
    .filter((chunk) => chunk.text);

  return {
    lyrics: lines.map((line) => `${formatLrcTime(line.start)} ${line.text}`).join('\n'),
    plain: lines.map((line) => line.text).join('\n'),
  };
};

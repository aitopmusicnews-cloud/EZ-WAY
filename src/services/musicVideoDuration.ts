interface AudioProbe {
  ffprobe(args: string[]): Promise<number>;
  readFile(path: string, encoding: 'utf8'): Promise<string | Uint8Array>;
}

export async function readMusicVideoDuration(engine: AudioProbe, audioName: string): Promise<number> {
  // Core 0.12.10 can leave ret at -1 even when ffprobe succeeds. The output
  // file is authoritative. Each conversion has a fresh worker/filesystem.
  await engine.ffprobe(['-v', 'error', '-show_entries', 'format=duration', '-of',
    'default=noprint_wrappers=1:nokey=1', audioName, '-o', 'duration.txt']);
  const output = await engine.readFile('duration.txt', 'utf8');
  const duration = Number(typeof output === 'string' ? output.trim() : new TextDecoder().decode(output).trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Could not read the audio duration. Check your MP3 or WAV file.');
  }
  return duration;
}

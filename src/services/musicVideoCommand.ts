import { parseLrc } from '../utils/lrcParser.ts';

export const VIDEO_PRESETS = {
  youtube: { label: 'YouTube / Desktop · 16:9', width: 1920, height: 1080 },
  vertical: { label: 'TikTok / Reels / Shorts · 9:16', width: 1080, height: 1920 },
  square: { label: 'Instagram Square · 1:1', width: 1080, height: 1080 },
  portrait: { label: 'Instagram Portrait · 4:5', width: 1080, height: 1350 },
  classic: { label: 'X / Classic · 4:3', width: 960, height: 720 },
} as const;
export interface VideoOptions {
  preset: keyof typeof VIDEO_PRESETS;
  duration: number; // 0 means the full song
  soundwave: boolean;
  watermark: boolean;
  lyrics: string;
  lyricVideo: boolean;
  lyricStyle: 'white' | 'gradient' | 'outline';
}
export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  preset: 'youtube', duration: 0, soundwave: false, watermark: false,
  lyrics: '', lyricVideo: false, lyricStyle: 'white',
};

export function musicVideoCommand(image: string, audio: string, options = DEFAULT_VIDEO_OPTIONS, audioDuration?: number): string[] {
  const { width: w, height: h } = VIDEO_PRESETS[options.preset];
  const duration = audioDuration ? Math.min(options.duration || audioDuration, audioDuration) : options.duration;
  const args = ['-loop', '1', '-framerate', '24', '-i', image, '-i', audio];
  if (options.watermark) args.push('-loop', '1', '-i', 'watermark.webp');
  const filters = [`[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[base]`];
  let current = 'base';
  if (options.soundwave) {
    filters.push(`[1:a]showwaves=s=${w}x${Math.round(h * .12 / 2) * 2}:mode=cline:rate=24:colors=0xff8c32:scale=sqrt,format=rgba[wave]`);
    filters.push(`[${current}][wave]overlay=0:H-h:shortest=1[withwave]`);
    current = 'withwave';
  }
  if (options.watermark) {
    filters.push(`[2:v]scale=${Math.round(w * .16 / 2) * 2}:-2,format=rgba,colorchannelmixer=aa=0.75[logo]`);
    filters.push(`[${current}][logo]overlay=24:H-h-${Math.round(h * .15)}[branded]`);
    current = 'branded';
  }
  if (options.lyrics.trim()) {
    filters.push(`[${current}]ass=lyrics.ass:fontsdir=fonts[subtitled]`);
    current = 'subtitled';
  }
  args.push('-filter_complex', filters.join(';'), '-map', `[${current}]`, '-map', '1:a:0');
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');
  if (duration > 0) args.push('-t', String(duration));
  args.push('-shortest', '-movflags', '+faststart', 'output.mp4');
  return args;
}

const assTime = (seconds: number) => {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
export function buildVideoLyrics(options: VideoOptions, duration: number): string {
  const lines = parseLrc(options.lyrics);
  if (!lines.length) throw new Error('Lyrics need timestamps, for example [00:05.00] Your lyric line. Import an LRC file or generate synced lyrics.');
  const { width, height } = VIDEO_PRESETS[options.preset];
  const size = Math.round(width * (options.lyricVideo ? .06 : .04));
  const margin = Math.round(height * .2);
  const events = lines.flatMap((line, i) => {
    const end = Math.min(lines[i + 1]?.time ?? duration, duration);
    if (line.time >= end || !line.text) return [];
    // User lyrics cannot inject ASS formatting/control sequences.
    const plain = line.text.replace(/[{}\\]/g, '').replace(/[\r\n]/g, ' ');
    let text = plain;
    if (options.lyricStyle === 'gradient') {
      const chars = [...plain];
      text = chars.map((char, index) => {
        const t = index / Math.max(1, chars.length - 1);
        const rgb = [255, Math.round(170 - 80 * t), Math.round(60 + 180 * t)];
        const bgr = rgb.reverse().map(n => n.toString(16).padStart(2, '0')).join('');
        return `{\\1c&H${bgr}&}${char}`;
      }).join('');
    }
    return [`Dialogue: 0,${assTime(line.time)},${assTime(end)},Default,,0,0,0,,${text}`];
  });
  if (!events.length) throw new Error('No timed lyrics fall within the selected video duration.');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Roboto,${size},${options.lyricStyle === 'outline' ? '&HFFffffff' : '&H00ffffff'},&H00ffffff,&H00000000,&H80000000,1,0,0,0,100,100,0,0,${options.lyricVideo && options.lyricStyle !== 'outline' ? 3 : 1},${options.lyricStyle === 'outline' ? 3 : 2},1,${options.lyricVideo ? 5 : 2},60,60,${margin},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
}

export function validateMusicVideoFiles(image: File, audio: File): void {
  if (!/\.(jpe?g|png)$/i.test(image.name)) throw new Error('Choose a JPG or PNG image.');
  if (!/\.(mp3|wav)$/i.test(audio.name)) throw new Error('Choose an MP3 or WAV audio file.');
  if (!image.size || !audio.size) throw new Error('The selected files must not be empty.');
  if (image.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  if (audio.size > 250 * 1024 * 1024) throw new Error('Choose an audio file smaller than 250 MB.');
}
export function musicVideoFilename(name: string): string {
  return (name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Music_Video') + '.mp4';
}

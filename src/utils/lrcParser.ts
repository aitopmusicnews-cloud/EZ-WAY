export interface LrcLine {
  time: number; // Time in seconds
  text: string;
  rawTime?: string; // Original [mm:ss.xx]
}

/**
 * Parses LRC format lyrics.
 * Format example:
 * [00:12.50] This is a lyrics line
 * [01:05] Another lyrics line
 */
export function parseLrc(lrcText: string): LrcLine[] {
  if (!lrcText) return [];
  
  const lines = lrcText.split('\n');
  const result: LrcLine[] = [];
  
  // Regular expression to match timestamps like [01:23.45] or [01:23] or [01:23:45]
  const timeRegex = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;

  lines.forEach(line => {
    // Extract the text of the line by removing all timestamps
    const cleanText = line.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim();
    
    // Find all timestamps in this line (LRC supports multiple timestamps on one line)
    let match;
    timeRegex.lastIndex = 0; // reset
    
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fractionalStr = match[3] || '0';
      
      // Parse fractions of seconds (centiseconds or milliseconds)
      let fractional = 0;
      if (fractionalStr) {
        const parsedFraction = parseInt(fractionalStr, 10);
        const divisor = Math.pow(10, fractionalStr.length);
        fractional = parsedFraction / divisor;
      }

      const time = minutes * 60 + seconds + fractional;
      
      result.push({
        time,
        text: cleanText,
        rawTime: match[0]
      });
    }

    // Fallback: if there's no timestamp but text exists, keep it with time -1 so we know it's a spacer or descriptive tag
    if (cleanText && line.indexOf('[') === -1) {
      // Don't add completely empty lines
      result.push({
        time: -1,
        text: cleanText
      });
    }
  });

  // Filter out meta-tags like [ar:Artist], [ti:Title] if they don't contain music timing
  const timedLines = result.filter(r => r.time >= 0);
  
  // Sort lines chronologically
  return timedLines.sort((a, b) => a.time - b.time);
}

/**
 * Converts a time in seconds to an LRC timestamp string: [mm:ss.xx]
 */
export function formatLrcTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '[00:00.00]';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor((seconds % 1) * 100);
  
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  const xx = centis.toString().padStart(2, '0');
  
  return `[${mm}:${ss}.${xx}]`;
}

/**
 * Checks if a string contains any LRC timestamp patterns
 */
export function isLrcFormat(text: string): boolean {
  if (!text) return false;
  return /\[\d+:\d+(?:[.:]\d+)?\]/.test(text);
}

/**
 * Converts a JSON string containing time-stamped lyrics into standard LRC format text.
 */
export function convertJsonToLrc(jsonText: string): string {
  try {
    const data = JSON.parse(jsonText);
    let lines: Array<{ time: number; text: string }> = [];

    const parseTime = (val: any): number => {
      if (typeof val === 'number') {
        if (val > 10000 && val % 1 === 0) {
          return val / 1000;
        }
        return val;
      }
      if (typeof val === 'string') {
        const parts = val.split(':');
        if (parts.length === 2) {
          const mins = parseFloat(parts[0]);
          const secs = parseFloat(parts[1]);
          if (!isNaN(mins) && !isNaN(secs)) {
            return mins * 60 + secs;
          }
        } else if (parts.length === 3) {
          const hrs = parseFloat(parts[0]);
          const mins = parseFloat(parts[1]);
          const secs = parseFloat(parts[2]);
          if (!isNaN(hrs) && !isNaN(mins) && !isNaN(secs)) {
            return hrs * 3600 + mins * 60 + secs;
          }
        }
        const numeric = parseFloat(val);
        if (!isNaN(numeric)) {
          if (numeric > 10000) {
            return numeric / 1000;
          }
          return numeric;
        }
      }
      return 0;
    };

    const extractFromObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return null;
      const textField = ['text', 'lyric', 'lyrics', 'line', 'content', 'words', 'phrase'].find(f => typeof obj[f] === 'string');
      const timeField = ['time', 'timestamp', 'start', 'seconds', 'ms', 'milliseconds', 'time_stamp'].find(f => obj[f] !== undefined);
      
      if (textField && timeField !== undefined) {
        return {
          time: parseTime(obj[timeField]),
          text: obj[textField]
        };
      }
      return null;
    };

    if (Array.isArray(data)) {
      data.forEach(item => {
        const parsed = extractFromObject(item);
        if (parsed) lines.push(parsed);
      });
    } else if (typeof data === 'object' && data !== null) {
      const arrayKey = ['lyrics', 'lines', 'segments', 'transcription', 'data'].find(k => Array.isArray(data[k]));
      if (arrayKey) {
        const arr = data[arrayKey];
        arr.forEach((item: any) => {
          const parsed = extractFromObject(item);
          if (parsed) lines.push(parsed);
        });
      } else {
        Object.keys(data).forEach(key => {
          const text = data[key];
          if (typeof text === 'string') {
            const time = parseTime(key);
            lines.push({ time, text });
          }
        });
      }
    }

    if (lines.length === 0) {
      throw new Error("No timestamped lyric lines found in JSON structure.");
    }

    lines.sort((a, b) => a.time - b.time);

    return lines.map(line => `${formatLrcTime(line.time)} ${line.text}`).join('\n');
  } catch (err: any) {
    console.error("convertJsonToLrc error:", err);
    throw new Error(`Failed to parse timestamped lyrics JSON: ${err.message}`);
  }
}


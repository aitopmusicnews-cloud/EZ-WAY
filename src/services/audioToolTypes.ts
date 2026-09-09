import type { MusicIntelligenceProfile } from './musicIntelligenceCore.ts';

export type AudioToolAction = 'analysis' | 'lyrics' | 'stems';
export type StemMode = 'vocals_instrumental' | 'full';

export interface AudioToolJobResult {
  status: 'completed' | 'failed' | 'running' | 'accepted';
  job_id?: string;
  call_id?: string;
  action?: AudioToolAction;
  mode?: StemMode;
  profile?: MusicIntelligenceProfile;
  lyrics?: string;
  files?: Record<string, string>;
  bundle_url?: string;
  language?: string | null;
  language_probability?: number | null;
  warning?: string;
  error?: unknown;
}

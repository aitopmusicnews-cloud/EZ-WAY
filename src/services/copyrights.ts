import type { Track } from '../types';
import type { CopyrightEvidenceRecord } from './copyrightsCore';

const STORAGE_KEY = 'ezway_copyright_evidence_v1';

const readRecords = (): CopyrightEvidenceRecord[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRecords = (records: CopyrightEvidenceRecord[]): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

export interface CopyrightRepository {
  list(): Promise<CopyrightEvidenceRecord[]>;
  save(record: CopyrightEvidenceRecord): Promise<void>;
  findByTrackId(trackId: string): Promise<CopyrightEvidenceRecord[]>;
}

export const browserCopyrightRepository: CopyrightRepository = {
  async list() {
    return readRecords().sort((a, b) => b.dateRegistered.localeCompare(a.dateRegistered));
  },
  async save(record) {
    const records = readRecords().filter((item) => item.id !== record.id);
    records.unshift(record);
    writeRecords(records);
  },
  async findByTrackId(trackId) {
    return readRecords()
      .filter((item) => item.trackId === trackId)
      .sort((a, b) => b.dateRegistered.localeCompare(a.dateRegistered));
  },
};

const fetchTrackBlob = async (url: string): Promise<Blob> => {
  try {
    const response = await fetch(url);
    if (response.ok) return await response.blob();
    throw new Error(`Audio fetch failed (${response.status}).`);
  } catch (directError) {
    if (typeof window === 'undefined') throw directError;
    const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Audio proxy fetch failed (${response.status}).`);
    return await response.blob();
  }
};

export const resolveTrackAudioBlob = async (track: Track): Promise<Blob> => {
  if (track.file_data instanceof Blob && track.file_data.size > 0) {
    return track.file_data;
  }
  const url = String(track.file_url || '').trim();
  if (!url) {
    throw new Error('This track does not have an accessible audio master to hash.');
  }
  const blob = await fetchTrackBlob(url);
  if (!blob.size) throw new Error('The audio master is empty and cannot be registered.');
  return blob;
};

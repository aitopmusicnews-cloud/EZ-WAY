import { dataStore } from './dataStore.ts';

export interface MediaAccessInput {
  objectKey?: string | null;
  url?: string | null;
}

export interface MediaAccessResult {
  url: string;
  objectKey: string | null;
}

export type MediaUrlRefresher = (input: MediaAccessInput) => Promise<MediaAccessResult>;

export function createMediaAccessResolver(refresh: MediaUrlRefresher) {
  return async (input: MediaAccessInput): Promise<MediaAccessResult> => {
    const objectKey = String(input.objectKey || '').trim() || null;
    const url = String(input.url || '').trim() || null;

    if (!objectKey) {
      if (!url) throw new Error('Media has no available source.');
      return { url, objectKey: null };
    }

    return refresh({ objectKey, url });
  };
}

export const resolveMediaAccess = createMediaAccessResolver((input) => dataStore.refreshMediaUrl(input));

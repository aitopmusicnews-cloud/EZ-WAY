import type { MediaAccessInput, MediaAccessResult } from './mediaAccess.ts';

export interface WorkspaceMediaSnapshot {
  tracks: Array<Record<string, any>>;
  playlists: Array<Record<string, any>>;
  clients: Array<Record<string, any>>;
  messages: Array<Record<string, any>>;
  promoVideos: Array<Record<string, any>>;
  profile: Record<string, any> | null;
}

export type WorkspaceMediaResolver = (input: MediaAccessInput) => Promise<MediaAccessResult>;

const MEDIA_PAIRS = [
  ['file_key', 'file_url'],
  ['image_key', 'image_url'],
  ['avatar_key', 'avatar_url'],
  ['video_key', 'video_url'],
  ['thumbnail_key', 'thumbnail_url'],
  ['attachment_key', 'attachment_url'],
] as const;

async function refreshRecord<T extends Record<string, any>>(
  record: T,
  resolve: WorkspaceMediaResolver,
): Promise<T> {
  const next: Record<string, any> = { ...record };

  await Promise.all(MEDIA_PAIRS.map(async ([keyField, urlField]) => {
    const objectKey = String(record[keyField] || '').trim();
    if (!objectKey) return;

    try {
      const refreshed = await resolve({
        objectKey,
        url: typeof record[urlField] === 'string' ? record[urlField] : null,
      });
      if (refreshed.url) next[urlField] = refreshed.url;
      if (refreshed.objectKey) next[keyField] = refreshed.objectKey;
    } catch (error) {
      console.warn(`[WorkspaceMedia] Could not refresh ${urlField}`, error);
    }
  }));

  return next as T;
}

export async function refreshWorkspaceMediaSources<T extends WorkspaceMediaSnapshot>(
  workspace: T,
  resolve: WorkspaceMediaResolver,
): Promise<T> {
  const [tracks, playlists, clients, messages, promoVideos, profile] = await Promise.all([
    Promise.all(workspace.tracks.map((item) => refreshRecord(item, resolve))),
    Promise.all(workspace.playlists.map((item) => refreshRecord(item, resolve))),
    Promise.all(workspace.clients.map((item) => refreshRecord(item, resolve))),
    Promise.all(workspace.messages.map((item) => refreshRecord(item, resolve))),
    Promise.all(workspace.promoVideos.map((item) => refreshRecord(item, resolve))),
    workspace.profile ? refreshRecord(workspace.profile, resolve) : Promise.resolve(null),
  ]);

  return {
    ...workspace,
    tracks,
    playlists,
    clients,
    messages,
    promoVideos,
    profile,
  } as T;
}

export function sanitizeMediaForCache<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMediaForCache(item)) as T;
  }
  if (!value || typeof value !== 'object') return value;

  const next: Record<string, any> = { ...(value as Record<string, any>) };
  for (const [keyField, urlField] of MEDIA_PAIRS) {
    if (String(next[keyField] || '').trim()) next[urlField] = null;
  }

  for (const [key, child] of Object.entries(next)) {
    if (child && typeof child === 'object') next[key] = sanitizeMediaForCache(child);
  }
  return next as T;
}

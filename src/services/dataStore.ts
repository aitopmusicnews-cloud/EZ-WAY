import type {
  Activity,
  Client,
  Message,
  Playlist,
  PromoVideo,
  ShareLink,
  Track,
  UserProfile,
} from '../types';
import { getIdToken } from './auth.ts';

export interface BootstrapPayload {
  tracks: Track[];
  playlists: Playlist[];
  clients: Client[];
  activities: Activity[];
  share_links: ShareLink[];
  messages: Message[];
  promo_videos: PromoVideo[];
  profile: UserProfile | null;
}

export interface PublicSharePayload {
  link: ShareLink;
  track: Track | null;
  playlist: Playlist | null;
  tracks: Track[];
  messages: Message[];
}

export interface PublicShareEvent {
  type: 'play' | 'thumbs_up' | 'thumbs_down' | 'comment';
  track_id?: string;
  content?: string;
}

export interface DiagnosticsPayload {
  tables: Record<string, number>;
}

export class DataStoreError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = 'DataStoreError';
    this.status = status;
    this.body = body;
  }
}

interface ClientOptions {
  apiBase: string;
  getToken?: () => string | null;
  fetchImpl?: typeof fetch;
}

const metaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});
const cleanBase = (value: unknown) => String(value ?? '').trim().replace(/\/+$/, '');

const stripBrowserFields = <T extends Record<string, any>>(value: T): Record<string, unknown> => {
  const output: Record<string, unknown> = {};
  const ignored = new Set(['file_data', 'image_data', 'video_data', 'thumbnail_data', '_brokenBlob']);
  for (const [key, item] of Object.entries(value || {})) {
    if (!ignored.has(key) && item !== undefined) output[key] = item;
  }

  const stablePairs = [
    ['file_key', 'file_url'],
    ['image_key', 'image_url'],
    ['avatar_key', 'avatar_url'],
    ['video_key', 'video_url'],
    ['thumbnail_key', 'thumbnail_url'],
  ] as const;
  for (const [keyField, urlField] of stablePairs) {
    if (output[keyField]) delete output[urlField];
    const url = output[urlField];
    if (typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:'))) delete output[urlField];
  }
  return output;
};

export function createDataStoreClient(options: ClientOptions) {
  const apiBase = cleanBase(options.apiBase);
  const tokenProvider = options.getToken || getIdToken;
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);

  if (!apiBase) {
    const configurationError = () => { throw new Error('EZ-WAY data API is not configured.'); };
    return {
      health: configurationError, diagnostics: configurationError, bootstrap: configurationError,
      createTrack: configurationError, updateTrack: configurationError, deleteTrack: configurationError,
      createPlaylist: configurationError, updatePlaylist: configurationError, deletePlaylist: configurationError,
      createClient: configurationError, updateClient: configurationError, deleteClient: configurationError,
      createShareLink: configurationError, deleteShareLink: configurationError, createActivity: configurationError,
      createMessage: configurationError, putProfile: configurationError, createPromoVideo: configurationError,
      deletePromoVideo: configurationError, uploadFile: configurationError, getPublicShare: configurationError,
      postPublicShareEvent: configurationError,
    } as any;
  }

  async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) };
      if (init.body != null && !headers['content-type']) headers['content-type'] = 'application/json';
      if (authenticated) {
        const token = tokenProvider();
        if (!token) throw new DataStoreError('Owner sign-in is required.', 401);
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetchImpl(`${apiBase}${path}`, { ...init, headers, signal: controller.signal });
      const text = res.status === 204 ? '' : await res.text();
      let body: any = null;
      if (text) {
        try { body = JSON.parse(text); } catch { body = text; }
      }
      if (!res.ok) {
        const message = typeof body === 'object' && body?.error ? String(body.error) : `EZ-WAY API request failed (${res.status}).`;
        throw new DataStoreError(message, res.status, body);
      }
      return body as T;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new DataStoreError('EZ-WAY API request timed out.', 408);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const jsonInit = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
  const encoded = (value: string) => encodeURIComponent(value);

  return {
    health: () => request<{ status: 'ok'; provider: 'aws' }>('/health', {}, false),
    diagnostics: () => request<DiagnosticsPayload>('/diagnostics'),
    bootstrap: () => request<BootstrapPayload>('/bootstrap'),

    createTrack: (track: Track) => request<Track>('/tracks', jsonInit('POST', stripBrowserFields(track))),
    updateTrack: (id: string, updates: Partial<Track>) => request<Track>(`/tracks/${encoded(id)}`, jsonInit('PATCH', stripBrowserFields(updates as any))),
    deleteTrack: (id: string) => request<void>(`/tracks/${encoded(id)}`, { method: 'DELETE' }),

    createPlaylist: (playlist: Playlist) => request<Playlist>('/playlists', jsonInit('POST', stripBrowserFields(playlist))),
    updatePlaylist: (id: string, updates: Partial<Playlist>) => request<Playlist>(`/playlists/${encoded(id)}`, jsonInit('PATCH', stripBrowserFields(updates as any))),
    deletePlaylist: (id: string) => request<void>(`/playlists/${encoded(id)}`, { method: 'DELETE' }),

    createClient: (client: Client) => request<Client>('/clients', jsonInit('POST', stripBrowserFields(client))),
    updateClient: (id: string, updates: Partial<Client>) => request<Client>(`/clients/${encoded(id)}`, jsonInit('PATCH', stripBrowserFields(updates as any))),
    deleteClient: (id: string) => request<void>(`/clients/${encoded(id)}`, { method: 'DELETE' }),

    createShareLink: (link: ShareLink) => request<ShareLink>('/share-links', jsonInit('POST', stripBrowserFields(link))),
    deleteShareLink: (id: string) => request<void>(`/share-links/${encoded(id)}`, { method: 'DELETE' }),
    createActivity: (activity: Activity) => request<Activity>('/activities', jsonInit('POST', stripBrowserFields(activity))),
    createMessage: (message: Message) => request<Message>('/messages', jsonInit('POST', stripBrowserFields(message))),
    putProfile: (profile: UserProfile) => request<UserProfile>('/profile', jsonInit('PUT', stripBrowserFields(profile))),
    createPromoVideo: (video: PromoVideo) => request<PromoVideo>('/promo-videos', jsonInit('POST', stripBrowserFields(video))),
    deletePromoVideo: (id: string) => request<void>(`/promo-videos/${encoded(id)}`, { method: 'DELETE' }),

    async uploadFile(category: string, relatedId: string, file: File): Promise<{ url: string; objectKey: string }> {
      const presign = await request<{
        upload_url: string;
        object_key: string;
        read_url: string;
        headers?: Record<string, string>;
      }>('/uploads/presign', jsonInit('POST', {
        category,
        relatedId,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }));
      const put = await fetchImpl(presign.upload_url, {
        method: 'PUT',
        headers: presign.headers || { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) throw new DataStoreError(`Media upload failed (${put.status}).`, put.status);
      return { url: presign.read_url, objectKey: presign.object_key };
    },

    getPublicShare: (token: string) => request<PublicSharePayload | null>(`/public/share/${encoded(token)}`, {}, false),
    postPublicShareEvent: (token: string, event: PublicShareEvent) => request<void>(
      `/public/share/${encoded(token)}/events`, jsonInit('POST', event), false,
    ),
  };
}

export const dataStore = createDataStoreClient({ apiBase: metaEnv.VITE_EZWAY_API_URL || '' });

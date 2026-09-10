import type {
  Activity,
  Client,
  Message,
  MessageAttachment,
  Playlist,
  PromoVideo,
  ShareLink,
  Track,
  UserProfile,
} from '../types';
import { getIdToken, restoreSession } from './auth.ts';
import { getTrackAnalysisRecord, type TrackAnalysisRecord } from './musicIntelligence.ts';
import { resolveTrackAnalysisRecovery } from './trackAnalysisRecovery.ts';

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

export interface PublicShareEvent extends MessageAttachment {
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
  restoreAuth?: () => Promise<boolean>;
  fetchImpl?: typeof fetch;
  getAnalysisRecord?: (trackId: string) => Promise<TrackAnalysisRecord | null>;
}

interface WorkspaceMediaUploadOptions {
  bootstrapConnected: boolean;
  cloudApiConfigured: boolean;
  category: string;
  relatedId: string;
  file: File;
  createLocalUrl: (file: File) => string;
  cloudUpload: (
    category: string,
    relatedId: string,
    file: File,
  ) => Promise<{ url: string; objectKey: string }>;
}

const metaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});
const cleanBase = (value: unknown) => String(value ?? '').trim().replace(/\/+$/, '');

export async function uploadMediaForWorkspace({
  bootstrapConnected,
  cloudApiConfigured,
  category,
  relatedId,
  file,
  createLocalUrl,
  cloudUpload,
}: WorkspaceMediaUploadOptions): Promise<{ url: string; objectKey: string | null }> {
  void bootstrapConnected;
  if (!cloudApiConfigured) {
    return { url: createLocalUrl(file), objectKey: null };
  }
  return cloudUpload(category, relatedId, file);
}

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
    ['attachment_key', 'attachment_url'],
  ] as const;
  for (const [keyField, urlField] of stablePairs) {
    if (output[keyField]) delete output[urlField];
    const url = output[urlField];
    if (typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:'))) delete output[urlField];
  }
  return output;
};

const TRACK_PATCH_FIELDS = new Set([
  'name', 'artist', 'duration', 'bpm', 'key_signature', 'size', 'type', 'plays', 'likes',
  'tags', 'lyrics', 'status', 'file_url', 'file_key', 'image_url', 'image_key',
]);

const stripTrackPatchFields = (value: Record<string, any>): Record<string, unknown> => {
  const allowed: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (TRACK_PATCH_FIELDS.has(key) && item !== undefined) allowed[key] = item;
  }
  return stripBrowserFields(allowed);
};

const PLAYLIST_PATCH_FIELDS = new Set([
  'name', 'description', 'track_ids', 'start_color', 'end_color', 'image_url', 'image_key',
]);

const stripPlaylistPatchFields = (value: Record<string, any>): Record<string, unknown> => {
  const allowed: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (PLAYLIST_PATCH_FIELDS.has(key) && item !== undefined) allowed[key] = item;
  }
  return stripBrowserFields(allowed);
};

export function createDataStoreClient(options: ClientOptions) {
  const apiBase = cleanBase(options.apiBase);
  const tokenProvider = options.getToken || getIdToken;
  const authRestorer = options.restoreAuth || restoreSession;
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  const analysisRecordProvider = options.getAnalysisRecord || getTrackAnalysisRecord;

  if (!apiBase) {
    const configurationError = () => { throw new Error('EZ-WAY data API is not configured.'); };
    return {
      configured: false,
      health: configurationError, diagnostics: configurationError, bootstrap: configurationError,
      createTrack: configurationError, updateTrack: configurationError, deleteTrack: configurationError,
      createPlaylist: configurationError, updatePlaylist: configurationError, deletePlaylist: configurationError,
      createClient: configurationError, updateClient: configurationError, deleteClient: configurationError,
      createShareLink: configurationError, deleteShareLink: configurationError, createActivity: configurationError,
      createMessage: configurationError, putProfile: configurationError, createPromoVideo: configurationError,
      deletePromoVideo: configurationError, uploadFile: configurationError, refreshMediaUrl: configurationError, getPublicShare: configurationError,
      getPublicShareMessages: configurationError, uploadPublicShareAttachment: configurationError,
      postPublicShareEvent: configurationError,
    } as any;
  }

  async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let refreshUsed = false;

    const refreshAuthOnce = async () => {
      if (refreshUsed) return false;
      refreshUsed = true;
      return authRestorer();
    };

    const send = async (): Promise<T> => {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) };
      if (init.body != null && !headers['content-type']) headers['content-type'] = 'application/json';
      if (authenticated) {
        let token = tokenProvider();
        if (!token) {
          const restored = await refreshAuthOnce();
          token = restored ? tokenProvider() : null;
        }
        if (!token) throw new DataStoreError('Owner sign-in is required.', 401);
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetchImpl(`${apiBase}${path}`, { ...init, headers, signal: controller.signal });
      if (authenticated && res.status === 401 && !refreshUsed) {
        const restored = await refreshAuthOnce();
        if (restored && tokenProvider()) return send();
      }

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
    };

    try {
      return await send();
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new DataStoreError('EZ-WAY API request timed out.', 408);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const jsonInit = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
  const encoded = (value: string) => encodeURIComponent(value);

  async function bootstrapWithRecoveredTrackAnalysis(): Promise<BootstrapPayload> {
    const payload = await request<BootstrapPayload>('/bootstrap');
    const recoveredTracks = await Promise.all((payload.tracks || []).map(async (track) => {
      if (track.status === 'ready') return track;
      try {
        const record = await analysisRecordProvider(track.id);
        const recovery = resolveTrackAnalysisRecovery(track, record);
        if (!recovery) return track;
        return await request<Track>(
          `/tracks/${encoded(track.id)}`,
          jsonInit('PATCH', stripBrowserFields(recovery as Record<string, any>)),
        );
      } catch (error) {
        console.warn(`[DataStore] Could not reconcile Music Intelligence for track ${track.id}.`, error);
        return track;
      }
    }));
    return { ...payload, tracks: recoveredTracks };
  }

  const putPresignedFile = async (presign: {
    upload_url: string;
    object_key: string;
    read_url: string;
    headers?: Record<string, string>;
  }, file: File) => {
    const put = await fetchImpl(presign.upload_url, {
      method: 'PUT',
      headers: presign.headers || { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) throw new DataStoreError(`Media upload failed (${put.status}).`, put.status);
    return { url: presign.read_url, objectKey: presign.object_key };
  };

  return {
    configured: true,
    health: () => request<{ status: 'ok'; provider: 'aws' }>('/health', {}, false),
    diagnostics: () => request<DiagnosticsPayload>('/diagnostics'),
    bootstrap: bootstrapWithRecoveredTrackAnalysis,

    createTrack: (track: Track) => request<Track>('/tracks', jsonInit('POST', stripBrowserFields(track))),
    updateTrack: (id: string, updates: Partial<Track>) => request<Track>(`/tracks/${encoded(id)}`, jsonInit('PATCH', stripTrackPatchFields(updates as any))),
    deleteTrack: (id: string) => request<void>(`/tracks/${encoded(id)}`, { method: 'DELETE' }),

    createPlaylist: (playlist: Playlist) => request<Playlist>('/playlists', jsonInit('POST', stripBrowserFields(playlist))),
    updatePlaylist: (id: string, updates: Partial<Playlist>) => request<Playlist>(`/playlists/${encoded(id)}`, jsonInit('PATCH', stripPlaylistPatchFields(updates as any))),
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
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }));
      return putPresignedFile(presign, file);
    },

    async refreshMediaUrl(input: { objectKey?: string | null; url?: string | null }): Promise<{ url: string; objectKey: string | null }> {
      const refreshed = await request<{ url: string; object_key?: string | null }>(`/media/read-url`, jsonInit('POST', {
        objectKey: input.objectKey || null,
        url: input.url || null,
      }));
      return { url: refreshed.url, objectKey: refreshed.object_key || input.objectKey || null };
    },

    async uploadPublicShareAttachment(token: string, file: File): Promise<{ url: string; objectKey: string }> {
      const presign = await request<{
        upload_url: string;
        object_key: string;
        read_url: string;
        headers?: Record<string, string>;
      }>(`/public/share/${encoded(token)}/uploads/presign`, jsonInit('POST', {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }), false);
      return putPresignedFile(presign, file);
    },

    getPublicShare: (token: string) => request<PublicSharePayload | null>(`/public/share/${encoded(token)}`, {}, false),
    getPublicShareMessages: async (token: string) => {
      const payload = await request<{ messages: Message[] }>(`/public/share/${encoded(token)}/messages`, {}, false);
      return payload.messages || [];
    },
    postPublicShareEvent: (token: string, event: PublicShareEvent) => request<void>(
      `/public/share/${encoded(token)}/events`, jsonInit('POST', event), false,
    ),
  };
}

export const dataStore = createDataStoreClient({ apiBase: metaEnv.VITE_EZWAY_API_URL || '' });
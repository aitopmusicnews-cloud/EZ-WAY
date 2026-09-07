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
import { getIdToken } from './auth.ts';
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

export interface PublicShareEvent {
  type: 'play' | 'thumbs_up' | 'thumbs_down' | 'comment';
  track_id?: string;
  content?: string;
}

export interface PublicShareMessageInput extends MessageAttachment {
  content: string;
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

export function createDataStoreClient(options: ClientOptions) {
  const apiBase = cleanBase(options.apiBase);
  const tokenProvider = options.getToken || getIdToken;
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
      deletePromoVideo: configurationError, uploadFile: configurationError, getPublicShare: configurationError,
      getPublicShareMessages: configurationError, createPublicShareMessage: configurationError,
      uploadPublicShareAttachment: configurationError, postPublicShareEvent: configurationError,
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

  async function uploadToPresignedUrl(file: File, presign: {
    upload_url: string;
    object_key: string;
    read_url: string;
    headers?: Record<string, string>;
  }): Promise<{ url: string; objectKey: string }> {
    const contentType = file.type || 'application/octet-stream';
    const put = await fetchImpl(presign.upload_url, {
      method: 'PUT',
      headers: presign.headers || { 'content-type': contentType },
      body: file,
    });
    if (!put.ok) throw new DataStoreError(`Media upload failed (${put.status}).`, put.status);
    return { url: presign.read_url, objectKey: presign.object_key };
  }

  return {
    configured: true,
    health: () => request<{ status: 'ok'; provider: 'aws' }>('/health', {}, false),
    diagnostics: () => request<DiagnosticsPayload>('/diagnostics'),
    bootstrap: bootstrapWithRecoveredTrackAnalysis,

    createTrack: (track: Track) => request<Track>('/tracks', jsonInit('POST', stripBrowserFields(track))),
    updateTrack: (id: string, updates: Partial<Track>) => request<Track>(`/tracks/${encoded(id)}`, jsonInit('PATCH', stripTrackPatchFields(updates as any))),
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
      const contentType = file.type || 'application/octet-stream';
      const presign = await request<{
        upload_url: string;
        object_key: string;
        read_url: string;
        headers?: Record<string, string>;
      }>('/uploads/presign', jsonInit('POST', {
        category,
        relatedId,
        filename: file.name,
        contentType,
        size: file.size,
      }));
      return uploadToPresignedUrl(file, presign);
    },

    getPublicShare: (token: string) => request<PublicSharePayload | null>(`/public/share/${encoded(token)}`, {}, false),
    getPublicShareMessages: (token: string) => request<Message[]>(
      `/public/share/${encoded(token)}/messages`, {}, false,
    ),
    createPublicShareMessage: (token: string, message: PublicShareMessageInput) => request<Message>(
      `/public/share/${encoded(token)}/messages`, jsonInit('POST', stripBrowserFields(message as Record<string, any>)), false,
    ),
    async uploadPublicShareAttachment(token: string, file: File): Promise<MessageAttachment> {
      if (file.size > 100 * 1024 * 1024) throw new DataStoreError('Attachment exceeds the 100 MB limit.', 400);
      const contentType = file.type || 'application/octet-stream';
      const presign = await request<{
        upload_url: string;
        object_key: string;
        read_url: string;
        headers?: Record<string, string>;
      }>(`/public/share/${encoded(token)}/attachments/presign`, jsonInit('POST', {
        filename: file.name,
        contentType,
        size: file.size,
      }), false);
      const uploaded = await uploadToPresignedUrl(file, presign);
      return {
        attachment_url: uploaded.url,
        attachment_key: uploaded.objectKey,
        attachment_name: file.name,
        attachment_type: contentType,
        attachment_size: file.size,
      };
    },
    postPublicShareEvent: (token: string, event: PublicShareEvent) => request<void>(
      `/public/share/${encoded(token)}/events`, jsonInit('POST', event), false,
    ),
  };
}

export const dataStore = createDataStoreClient({ apiBase: metaEnv.VITE_EZWAY_API_URL || '' });

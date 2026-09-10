export const YOUTUBE_OAUTH_SENTINEL_URL = 'about:blank#ezway-youtube-oauth';
export const YOUTUBE_TOKEN_STORAGE_KEY = 'EZWAY_YOUTUBE_OAUTH_TOKEN';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
].join(' ');

const metaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});
const DEFAULT_GOOGLE_CLIENT_ID = String(metaEnv.VITE_GOOGLE_CLIENT_ID || '').trim();

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type FetchLike = typeof fetch;

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleOAuthApi = {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: unknown) => void;
  }): {
    requestAccessToken(options?: { prompt?: string }): void;
  };
  revoke?: (token: string, callback?: () => void) => void;
};

type TokenRecord = {
  accessToken: string;
  expiresAt: number;
};

export interface YouTubeConnectionState {
  connected: boolean;
  channelId?: string;
  channelName?: string;
  subscriberCount?: string;
  profileImageUrl?: string;
  views?: number;
  uploadsPlaylistId?: string;
}

export interface YouTubeBrowserUploadPayload {
  videoData: string;
  title?: string;
  description?: string;
  tags?: string;
  privacy?: 'private' | 'unlisted' | 'public' | string;
}

export interface YouTubeBrowserClient {
  configured: boolean;
  connect(): Promise<YouTubeConnectionState>;
  disconnect(): Promise<void>;
  getState(): Promise<YouTubeConnectionState>;
  getAnalytics(): Promise<Record<string, unknown>>;
  getVideos(): Promise<{ success: boolean; playbackMode: string; videos: unknown[] }>;
  getComments(): Promise<{ success: boolean; playbackMode: string; comments: unknown[] }>;
  upload(payload: YouTubeBrowserUploadPayload): Promise<{ success: boolean; videoId: string; videoUrl: string; message: string }>;
}

interface ClientOptions {
  clientId?: string;
  storage?: StorageLike;
  fetchImpl?: FetchLike;
  getGoogleOAuth?: () => GoogleOAuthApi | null;
  now?: () => number;
}

const browserStorage = (): StorageLike => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    throw new Error('YouTube browser storage is unavailable.');
  }
  return window.sessionStorage;
};

const browserGoogleOAuth = (): GoogleOAuthApi | null => {
  if (typeof window === 'undefined') return null;
  return ((window as any).google?.accounts?.oauth2 || null) as GoogleOAuthApi | null;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const parseError = async (response: Response, fallback: string) => {
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return String(parsed?.error?.message || parsed?.error || fallback);
  } catch {
    return text;
  }
};

export function createYouTubeBrowserClient(options: ClientOptions = {}): YouTubeBrowserClient {
  const clientId = String(options.clientId ?? DEFAULT_GOOGLE_CLIENT_ID).trim();
  const storage = options.storage || browserStorage();
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  const getGoogleOAuth = options.getGoogleOAuth || browserGoogleOAuth;
  const now = options.now || Date.now;

  const clearToken = () => storage.removeItem(YOUTUBE_TOKEN_STORAGE_KEY);
  const getToken = (): string | null => {
    const raw = storage.getItem(YOUTUBE_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as TokenRecord;
      if (!record.accessToken || !record.expiresAt || record.expiresAt <= now() + 15_000) {
        clearToken();
        return null;
      }
      return record.accessToken;
    } catch {
      clearToken();
      return null;
    }
  };

  const youtubeFetch = async (url: string, init: RequestInit = {}) => {
    const token = getToken();
    if (!token) throw new Error('YouTube authorization has expired. Please connect your YouTube account again.');
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetchImpl(url, { ...init, headers });
    if (response.status === 401) clearToken();
    return response;
  };

  const getState = async (): Promise<YouTubeConnectionState> => {
    if (!getToken()) return { connected: false };
    const response = await youtubeFetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true');
    if (!response.ok) {
      if (response.status === 401) return { connected: false };
      throw new Error(await parseError(response, 'Could not load the connected YouTube channel.'));
    }
    const data: any = await response.json();
    const channel = data?.items?.[0];
    if (!channel) return { connected: false };
    return {
      connected: true,
      channelId: channel.id,
      channelName: channel.snippet?.title || 'YouTube channel',
      subscriberCount: Number(channel.statistics?.subscriberCount || 0).toLocaleString(),
      profileImageUrl: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url || '',
      views: Number(channel.statistics?.viewCount || 0),
      uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || '',
    };
  };

  return {
    configured: Boolean(clientId),

    async connect() {
      if (!clientId) {
        throw new Error('YouTube connection is not configured. VITE_GOOGLE_CLIENT_ID is missing from the production build.');
      }
      const oauth = getGoogleOAuth();
      if (!oauth) {
        throw new Error('Google authorization is still loading. Please try Connect YouTube again.');
      }
      await new Promise<void>((resolve, reject) => {
        const tokenClient = oauth.initTokenClient({
          client_id: clientId,
          scope: YOUTUBE_SCOPES,
          callback: (result) => {
            if (result.error || !result.access_token) {
              reject(new Error(result.error_description || result.error || 'Google authorization did not return an access token.'));
              return;
            }
            const expiresIn = Math.max(60, Number(result.expires_in || 3600));
            storage.setItem(YOUTUBE_TOKEN_STORAGE_KEY, JSON.stringify({
              accessToken: result.access_token,
              expiresAt: now() + (expiresIn * 1000),
            } satisfies TokenRecord));
            resolve();
          },
          error_callback: (error) => reject(error instanceof Error ? error : new Error('Google authorization popup failed.')),
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
      });
      return getState();
    },

    async disconnect() {
      const token = getToken();
      clearToken();
      const oauth = getGoogleOAuth();
      if (token && oauth?.revoke) {
        await new Promise<void>((resolve) => oauth.revoke?.(token, resolve));
      }
    },

    getState,

    async getAnalytics() {
      const state = await getState();
      return {
        playbackMode: state.connected ? 'live' : 'disconnected',
        subscribers: Number(String(state.subscriberCount || '0').replace(/,/g, '')) || 0,
        views: state.views || 0,
        watchHours: 0,
        ctr: '—',
        subscribersClass: state.subscriberCount || '0',
        channelName: state.channelName,
        profileImageUrl: state.profileImageUrl,
        weeklyViews: [],
        monthlyViews: [],
        quarterlyViews: [],
        trafficSources: [],
      };
    },

    async getVideos() {
      const state = await getState();
      if (!state.connected || !state.uploadsPlaylistId) return { success: true, playbackMode: 'disconnected', videos: [] };
      const itemsResponse = await youtubeFetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(state.uploadsPlaylistId)}&maxResults=10`,
      );
      if (!itemsResponse.ok) throw new Error(await parseError(itemsResponse, 'Could not load YouTube uploads.'));
      const playlistData: any = await itemsResponse.json();
      const videoIds = (playlistData.items || []).map((item: any) => item.contentDetails?.videoId).filter(Boolean);
      if (!videoIds.length) return { success: true, playbackMode: 'live', videos: [] };
      const detailsResponse = await youtubeFetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${encodeURIComponent(videoIds.join(','))}`,
      );
      if (!detailsResponse.ok) throw new Error(await parseError(detailsResponse, 'Could not load YouTube video details.'));
      const details: any = await detailsResponse.json();
      const videos = (details.items || []).map((item: any) => ({
        id: item.id,
        youtubeId: item.id,
        title: item.snippet?.title || 'Untitled video',
        style: 'YouTube HD Stream',
        views: Number(item.statistics?.viewCount || 0),
        likes: Number(item.statistics?.likeCount || 0),
        commentsCount: Number(item.statistics?.commentCount || 0),
        visibility: item.status?.privacyStatus || 'private',
        publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt).toLocaleDateString() : 'Live',
        thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
      }));
      return { success: true, playbackMode: 'live', videos };
    },

    async getComments() {
      const state = await getState();
      if (!state.connected || !state.channelId) return { success: true, playbackMode: 'disconnected', comments: [] };
      const response = await youtubeFetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&allThreadsRelatedToChannelId=${encodeURIComponent(state.channelId)}&maxResults=10&textFormat=plainText`,
      );
      if (!response.ok) throw new Error(await parseError(response, 'Could not load YouTube comments.'));
      const data: any = await response.json();
      const comments = (data.items || []).map((item: any) => {
        const top = item.snippet?.topLevelComment?.snippet || {};
        return {
          id: item.id,
          author: top.authorDisplayName || 'Viewer',
          avatar: top.authorProfileImageUrl || '',
          content: top.textDisplay || top.textOriginal || '',
          time: top.publishedAt ? new Date(top.publishedAt).toLocaleDateString() : 'recently',
          likes: Number(top.likeCount || 0),
          replied: Number(item.snippet?.totalReplyCount || 0) > 0,
          replyText: '',
        };
      });
      return { success: true, playbackMode: 'live', comments };
    },

    async upload(payload) {
      const token = getToken();
      if (!token) throw new Error('Connect your YouTube channel before publishing.');
      const source = String(payload.videoData || '');
      const match = source.match(/^data:([^;]+);base64,(.+)$/s);
      const mimeType = match?.[1] || 'video/mp4';
      const base64 = match?.[2] || source;
      if (!base64) throw new Error('Video data buffer is required for upload.');
      if (typeof globalThis.atob !== 'function') throw new Error('Browser base64 decoder is unavailable.');
      const binary = globalThis.atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const videoBlob = new Blob([bytes], { type: mimeType });
      const metadata = {
        snippet: {
          title: payload.title || 'New Audio Release',
          description: payload.description || '',
          tags: String(payload.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
          categoryId: '10',
        },
        status: { privacyStatus: payload.privacy || 'private' },
      };
      const initResponse = await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(videoBlob.size),
          'X-Upload-Content-Type': mimeType,
        },
        body: JSON.stringify(metadata),
      });
      if (!initResponse.ok) throw new Error(await parseError(initResponse, 'Google API initialization failed.'));
      const uploadUrl = initResponse.headers.get('location');
      if (!uploadUrl) throw new Error('Google did not return a resumable upload URL.');
      const uploadResponse = await fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
        body: videoBlob,
      });
      if (!uploadResponse.ok) throw new Error(await parseError(uploadResponse, 'Video packet transfer failed.'));
      const uploaded: any = await uploadResponse.json();
      if (!uploaded?.id) throw new Error('YouTube accepted the upload but did not return a video ID.');
      return {
        success: true,
        videoId: uploaded.id,
        videoUrl: `https://www.youtube.com/watch?v=${uploaded.id}`,
        message: 'Video has been successfully delivered and published directly to your YouTube channel!',
      };
    },
  };
}

export function createYouTubeFetchBridge({
  nativeFetch,
  client,
}: {
  nativeFetch: FetchLike;
  client: YouTubeBrowserClient;
}): FetchLike {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw, 'https://ezway.local');
    const path = url.pathname;
    const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    const readJsonBody = async () => {
      if (typeof init?.body === 'string') return JSON.parse(init.body || '{}');
      if (typeof Request !== 'undefined' && input instanceof Request) return input.clone().json();
      return {};
    };

    try {
      if (path === '/api/youtube/auth-url' && method === 'GET') {
        if (!client.configured) {
          return jsonResponse({ error: 'YouTube connection is not configured. VITE_GOOGLE_CLIENT_ID is missing from the production build.' }, 503);
        }
        return jsonResponse({ url: YOUTUBE_OAUTH_SENTINEL_URL });
      }
      if (path === '/api/youtube/state' && method === 'GET') return jsonResponse(await client.getState());
      if (path === '/api/youtube/analytics' && method === 'GET') return jsonResponse(await client.getAnalytics());
      if (path === '/api/youtube/videos' && method === 'GET') return jsonResponse(await client.getVideos());
      if (path === '/api/youtube/comments' && method === 'GET') return jsonResponse(await client.getComments());
      if (path === '/api/youtube/disconnect' && method === 'POST') {
        await client.disconnect();
        return jsonResponse({ status: 'disconnected' });
      }
      if (path === '/api/youtube/upload' && method === 'POST') return jsonResponse(await client.upload(await readJsonBody()));
      return nativeFetch(input, init);
    } catch (error: any) {
      return jsonResponse({ error: error?.message || 'YouTube browser request failed.' }, 502);
    }
  }) as FetchLike;
}

let googleIdentityPromise: Promise<void> | null = null;
export function preloadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve();
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (googleIdentityPromise) return googleIdentityPromise;
  googleIdentityPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ezway-google-identity="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google authorization library.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.ezwayGoogleIdentity = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Could not load Google authorization library.')), { once: true });
    document.head.appendChild(script);
  });
  return googleIdentityPromise;
}

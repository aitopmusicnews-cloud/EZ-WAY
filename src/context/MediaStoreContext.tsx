import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Track, Playlist, Client, Activity, ShareLink, UserProfile, Message, PromoVideo } from '@/src/types';
import { analyzeAudioDsp } from '@/src/services/audioDsp';
import { dataStore } from '@/src/services/dataStore';

interface MediaStoreContextType {
  tracks: Track[];
  playlists: Playlist[];
  clients: Client[];
  activities: Activity[];
  profile: UserProfile | null;
  loading: boolean;
  loadingProgress: number;
  loadingStatusText: string;
  addTrack: (track: Partial<Track>) => Promise<Track>;
  updateTrack: (id: string, updates: Partial<Track>) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  addPlaylist: (playlist: Partial<Playlist>) => Promise<Playlist>;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (trackId: string, playlistId: string) => Promise<void>;
  removeTrackFromPlaylist: (trackId: string, playlistId: string) => Promise<void>;
  addClient: (client: Partial<Client>) => Promise<void>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  shareLinks: ShareLink[];
  addShareLink: (link: Partial<ShareLink>) => Promise<ShareLink>;
  deleteShareLink: (id: string) => Promise<void>;
  getShareContent: (token: string) => Promise<{ track?: Track; playlist?: Playlist; link: ShareLink } | null>;
  addActivity: (activity: Partial<Activity>) => Promise<void>;
  analyzeTrack: (name: string, duration?: number, file?: File | null, fileUrl?: string | null) => Promise<{ bpm: number; key: string; duration?: number; tags?: string[] }>;
  analysisEngine: 'ai' | 'dsp';
  setAnalysisEngine: (engine: 'ai' | 'dsp') => void;
  messages: Message[];
  sendMessage: (clientId: string, content: string, image_url?: string | null, direction?: 'inbound' | 'outbound') => Promise<void>;
  promoVideos: PromoVideo[];
  addPromoVideo: (video: Partial<PromoVideo>) => Promise<void>;
  deletePromoVideo: (id: string) => Promise<void>;
  incrementShareLinkAccess: (id: string) => Promise<void>;
  uploadFile: (bucket: string, file: File) => Promise<string | null>;
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  connected: boolean;
  enableMockData: boolean;
  setEnableMockData: (val: boolean) => void;
}

const PROFILE_FALLBACK: UserProfile = {
  id: 'cb9fba24-8141-cfa3-bdf2-cd9e11fcbcba',
  name: 'THE BEATZ WAY Admin',
  artist_name: 'THE BEATZ WAY',
  email: 'cdtfullsail@gmail.com',
  avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=450',
  bio: 'Multi-platinum platinum-grade sound producer, mixing engineer, and audio director. Author of modern catalog beat tape reviews.',
  social_links: {
    instagram: 'https://instagram.com/beatzway',
    spotify: 'https://open.spotify.com/artist/beatzway',
    twitter: 'https://twitter.com/beatzway',
  },
};

const MediaStoreContext = createContext<MediaStoreContextType | undefined>(undefined);

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const publicShareLocation = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get('token')?.trim() || params.get('share')?.trim());
};

const restorePromoVideoUrls = async (videosList: PromoVideo[]): Promise<PromoVideo[]> => {
  try {
    const lf = (await import('localforage')).default;
    return Promise.all(videosList.map(async (video) => {
      const blob = await lf.getItem(`promo_video_blob_${video.id}`) as Blob | null;
      if (!(blob instanceof Blob)) return video;
      if (video.video_url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(video.video_url); } catch { /* ignore */ }
      }
      return { ...video, video_url: URL.createObjectURL(blob), video_data: blob };
    }));
  } catch (error) {
    console.warn('[MediaStore] Could not restore cached promo media', error);
    return videosList;
  }
};

const uploadCategory = (bucket: string) => {
  const normalized = String(bucket || '').trim().toLowerCase();
  if (normalized === 'tracks' || normalized === 'audio') return 'tracks';
  if (normalized === 'promo_videos' || normalized === 'promo-video' || normalized === 'videos') return 'promo-video';
  if (normalized === 'messages' || normalized === 'message-image' || normalized === 'message_images') return 'message-image';
  if (normalized === 'profile-image' || normalized === 'profile_images' || normalized === 'avatars') return 'profile-image';
  return 'artwork';
};

const isTemporaryUrl = (value: unknown) => typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'));

export function MediaStoreProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>(() => readJson('ogbeatz_tracks', []));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => readJson('ogbeatz_playlists', []));
  const [clients, setClients] = useState<Client[]>(() => readJson('ogbeatz_clients', []));
  const [activities, setActivities] = useState<Activity[]>(() => readJson('ogbeatz_activities', []));
  const [shareLinks, setShareLinks] = useState<ShareLink[]>(() => readJson('ogbeatz_share_links', []));
  const [messages, setMessages] = useState<Message[]>(() => readJson('ogbeatz_messages', []));
  const [promoVideos, setPromoVideos] = useState<PromoVideo[]>(() => readJson('ogbeatz_promo_videos', []));
  const [profile, setProfile] = useState<UserProfile | null>(() => readJson('ogbeatz_profile', readJson('beatzway_profile', PROFILE_FALLBACK)));
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatusText, setLoadingStatusText] = useState('Connecting to AWS data vault...');
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [enableMockData, setEnableMockData] = useState(() => readJson('ogbeatz_enable_mock_data', false));
  const [analysisEngine, setAnalysisEngine] = useState<'ai' | 'dsp'>(() => readJson('ogbeatz_analysis_engine', 'dsp'));
  const pendingMediaKeys = useRef(new Map<string, string>());

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    console.log(`[Toast Silenced] [${type}] ${message}`);
  };
  const removeToast = (id: string) => setToasts((prev) => prev.filter((toast) => toast.id !== id));

  const withPendingKeys = <T extends Record<string, any>>(input: T): T & Record<string, any> => {
    const output: Record<string, any> = { ...input };
    const pairs = [
      ['file_url', 'file_key'],
      ['image_url', 'image_key'],
      ['avatar_url', 'avatar_key'],
      ['video_url', 'video_key'],
      ['thumbnail_url', 'thumbnail_key'],
    ] as const;
    for (const [urlField, keyField] of pairs) {
      const url = output[urlField];
      const key = typeof url === 'string' ? pendingMediaKeys.current.get(url) : undefined;
      if (key) output[keyField] = key;
    }
    return output as T & Record<string, any>;
  };

  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem('ogbeatz_tracks', JSON.stringify(tracks));
      localStorage.setItem('ogbeatz_playlists', JSON.stringify(playlists));
      localStorage.setItem('ogbeatz_clients', JSON.stringify(clients));
      localStorage.setItem('ogbeatz_activities', JSON.stringify(activities));
      localStorage.setItem('ogbeatz_share_links', JSON.stringify(shareLinks));
      localStorage.setItem('ogbeatz_messages', JSON.stringify(messages));
      localStorage.setItem('ogbeatz_promo_videos', JSON.stringify(promoVideos));
      if (profile) localStorage.setItem('ogbeatz_profile', JSON.stringify(profile));
    } catch (error) {
      console.warn('[MediaStore] Local cache write failed', error);
    }
  }, [tracks, playlists, clients, activities, shareLinks, messages, promoVideos, profile, loading]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        setLoadingProgress(15);
        if (publicShareLocation()) {
          setLoadingStatusText('Opening secure client share...');
          setPromoVideos(await restorePromoVideoUrls(promoVideos));
          return;
        }

        setLoadingStatusText('Verifying AWS data API...');
        await dataStore.health();
        setLoadingProgress(35);
        setLoadingStatusText('Loading your AWS workspace...');
        const bootstrap = await dataStore.bootstrap();
        if (cancelled) return;
        setTracks(bootstrap.tracks || []);
        setPlaylists(bootstrap.playlists || []);
        setClients(bootstrap.clients || []);
        setActivities(bootstrap.activities || []);
        setShareLinks(bootstrap.share_links || []);
        setMessages(bootstrap.messages || []);
        setPromoVideos(await restorePromoVideoUrls(bootstrap.promo_videos || []));
        setProfile(bootstrap.profile || PROFILE_FALLBACK);
        setConnected(true);
        setLoadingProgress(90);
        setLoadingStatusText('AWS workspace synchronized.');
      } catch (error) {
        console.warn('[MediaStore] AWS bootstrap unavailable; retaining local cache', error);
        setConnected(false);
        setPromoVideos(await restorePromoVideoUrls(promoVideos));
        setLoadingStatusText('Local fallback cache active.');
      } finally {
        if (!cancelled) {
          setLoadingProgress(100);
          setLoading(false);
        }
      }
    };
    void init();
    return () => { cancelled = true; };
  }, []);

  const addActivity = async (activity: Partial<Activity>) => {
    const candidate: Activity = {
      id: activity.id || uuidv4(),
      type: activity.type || 'system',
      user: activity.user || 'Unknown',
      action: activity.action || 'Performed action',
      timestamp: activity.timestamp || new Date().toISOString(),
      ...activity,
    } as Activity;
    try {
      const saved = connected ? await dataStore.createActivity(candidate) : candidate;
      setActivities((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)].slice(0, 100));
    } catch (error) {
      console.error('[MediaStore] Activity write failed', error);
    }
  };

  const addTrack = async (track: Partial<Track>) => {
    const duration = Math.max(0, Math.round(Number(track.duration || 0)));
    const bpm = Math.max(0, Math.round(Number(track.bpm || 0)));
    const candidate = withPendingKeys({
      id: track.id || uuidv4(),
      name: track.name || 'Untitled',
      artist: track.artist || 'OGBeatz',
      duration,
      bpm,
      key_signature: track.key_signature || '',
      tags: track.tags || [],
      status: track.status || 'ready',
      size: Math.max(0, Math.round(Number(track.size || 0))),
      type: track.type || 'audio/mpeg',
      file_url: track.file_url || null,
      image_url: track.image_url || null,
      plays: Math.max(0, Math.round(Number(track.plays || 0))),
      likes: Math.max(0, Math.round(Number(track.likes || 0))),
      created_at: track.created_at || new Date().toISOString(),
      lyrics: track.lyrics,
    } as Track);
    try {
      const saved = connected ? await dataStore.createTrack(candidate as Track) : candidate as Track;
      setTracks((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
      void addActivity({ type: 'upload', user: 'OGBeatz', action: 'uploaded', target: saved.name, track_id: saved.id });
      return saved;
    } catch (error: any) {
      addToast(`Failed to save track: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const updateTrack = async (id: string, updates: Partial<Track>) => {
    const normalized: Record<string, any> = withPendingKeys({ ...updates });
    if (normalized.duration != null) normalized.duration = Math.round(Number(normalized.duration));
    if (normalized.bpm != null) normalized.bpm = Math.round(Number(normalized.bpm));
    try {
      if (connected) {
        const saved = await dataStore.updateTrack(id, normalized);
        setTracks((prev) => prev.map((track) => track.id === id ? saved : track));
      } else {
        setTracks((prev) => prev.map((track) => track.id === id ? { ...track, ...normalized } : track));
      }
    } catch (error: any) {
      addToast(`Failed to update track: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const deleteTrack = async (id: string) => {
    try {
      if (connected) await dataStore.deleteTrack(id);
      setTracks((prev) => prev.filter((track) => track.id !== id));
      setPlaylists((prev) => prev.map((playlist) => ({ ...playlist, track_ids: playlist.track_ids.filter((trackId) => trackId !== id) })));
      setPromoVideos((prev) => prev.filter((video) => video.track_id !== id));
      setShareLinks((prev) => prev.filter((link) => link.track_id !== id));
      void addActivity({ type: 'system', user: 'OGBeatz', action: `Purged asset ${id} from reference library` });
    } catch (error: any) {
      addToast(`Deletion failed: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const addPlaylist = async (playlist: Partial<Playlist>) => {
    const candidate = withPendingKeys({
      id: playlist.id || uuidv4(),
      name: playlist.name || 'New Playlist',
      description: playlist.description || '',
      image_url: playlist.image_url || '',
      track_ids: playlist.track_ids || [],
      start_color: playlist.start_color || '#f97316',
      end_color: playlist.end_color || '#ea580c',
      created_at: playlist.created_at || new Date().toISOString(),
    } as Playlist);
    try {
      const saved = connected ? await dataStore.createPlaylist(candidate as Playlist) : candidate as Playlist;
      setPlaylists((prev) => [...prev.filter((item) => item.id !== saved.id), saved]);
      return saved;
    } catch (error: any) {
      addToast(`Failed to create playlist: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const updatePlaylist = async (id: string, updates: Partial<Playlist>) => {
    const normalized = withPendingKeys({ ...updates });
    try {
      if (connected) {
        const saved = await dataStore.updatePlaylist(id, normalized);
        setPlaylists((prev) => prev.map((playlist) => playlist.id === id ? saved : playlist));
      } else {
        setPlaylists((prev) => prev.map((playlist) => playlist.id === id ? { ...playlist, ...normalized } : playlist));
      }
    } catch (error: any) {
      addToast(`Failed to update playlist: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const deletePlaylist = async (id: string) => {
    try {
      if (connected) await dataStore.deletePlaylist(id);
      setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id));
      setPromoVideos((prev) => prev.filter((video) => video.playlist_id !== id));
      setShareLinks((prev) => prev.filter((link) => link.playlist_id !== id));
    } catch (error: any) {
      addToast(`Failed to delete playlist: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const addTrackToPlaylist = async (trackId: string, playlistId: string) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist || playlist.track_ids.includes(trackId)) return;
    await updatePlaylist(playlistId, { track_ids: [...playlist.track_ids, trackId] });
  };

  const removeTrackFromPlaylist = async (trackId: string, playlistId: string) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    await updatePlaylist(playlistId, { track_ids: playlist.track_ids.filter((id) => id !== trackId) });
  };

  const addClient = async (client: Partial<Client>) => {
    const email = String(client.email || 'unknown@client.com').trim().toLowerCase();
    const existing = clients.find((item) => item.email.toLowerCase() === email);
    if (existing) {
      await updateClient(existing.id, {
        name: client.name || existing.name,
        status: 'online',
        last_active: new Date().toISOString(),
      });
      return;
    }
    const displayName = email.split('@')[0].split(/[._-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
    const candidate = withPendingKeys({
      id: client.id || uuidv4(),
      name: client.name || displayName || 'Client',
      email,
      status: client.status || 'online',
      last_active: client.last_active || new Date().toISOString(),
      tags: client.tags || [],
      company: client.company,
      phone: client.phone,
      avatar_url: client.avatar_url,
      created_at: client.created_at || new Date().toISOString(),
    } as Client);
    try {
      const saved = connected ? await dataStore.createClient(candidate as Client) : candidate as Client;
      setClients((prev) => [...prev.filter((item) => item.id !== saved.id), saved]);
    } catch (error: any) {
      addToast(`Failed to register client: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    const normalized = withPendingKeys({ ...updates });
    try {
      if (connected) {
        const saved = await dataStore.updateClient(id, normalized);
        setClients((prev) => prev.map((client) => client.id === id ? saved : client));
      } else {
        setClients((prev) => prev.map((client) => client.id === id ? { ...client, ...normalized } : client));
      }
    } catch (error: any) {
      addToast(`Failed to update client: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      if (connected) await dataStore.deleteClient(id);
      setClients((prev) => prev.filter((client) => client.id !== id));
      setShareLinks((prev) => prev.filter((link) => link.client_id !== id));
      setMessages((prev) => prev.filter((message) => message.client_id !== id));
      setActivities((prev) => prev.filter((activity) => activity.client_id !== id));
    } catch (error: any) {
      addToast(`Failed to delete client: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const current = profile || PROFILE_FALLBACK;
    const candidate = withPendingKeys({ ...current, ...updates }) as UserProfile;
    try {
      const saved = connected ? await dataStore.putProfile(candidate) : candidate;
      setProfile(saved);
    } catch (error: any) {
      addToast(`Failed to save profile: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const addShareLink = async (link: Partial<ShareLink>) => {
    const secureToken = Array.from(window.crypto.getRandomValues(new Uint8Array(20)))
      .map((value) => value.toString(16).padStart(2, '0')).join('');
    const candidate: ShareLink = {
      id: link.id || uuidv4(),
      token: link.token || secureToken,
      track_id: link.track_id,
      playlist_id: link.playlist_id,
      client_id: link.client_id,
      recipient_email: link.recipient_email,
      download_enabled: link.download_enabled ?? true,
      access_count: link.access_count || 0,
      expires_at: link.expires_at || null,
      created_at: link.created_at || new Date().toISOString(),
    };
    try {
      const saved = connected ? await dataStore.createShareLink(candidate) : candidate;
      setShareLinks((prev) => [...prev.filter((item) => item.id !== saved.id), saved]);
      return saved;
    } catch (error: any) {
      addToast(`Failed to create share link: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const deleteShareLink = async (id: string) => {
    try {
      if (connected) await dataStore.deleteShareLink(id);
      setShareLinks((prev) => prev.filter((link) => link.id !== id));
    } catch (error: any) {
      addToast(`Failed to delete share link: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const getShareContent = async (token: string) => {
    try {
      const payload = await dataStore.getPublicShare(token);
      if (!payload) return null;
      if (payload.track) setTracks((prev) => [...prev.filter((track) => track.id !== payload.track!.id), payload.track!]);
      if (payload.tracks?.length) {
        setTracks((prev) => {
          const byId = new Map(prev.map((track) => [track.id, track]));
          payload.tracks.forEach((track) => byId.set(track.id, track));
          return Array.from(byId.values());
        });
      }
      if (payload.playlist) setPlaylists((prev) => [...prev.filter((playlist) => playlist.id !== payload.playlist!.id), payload.playlist!]);
      if (payload.messages?.length) setMessages((prev) => {
        const byId = new Map(prev.map((message) => [message.id, message]));
        payload.messages.forEach((message) => byId.set(message.id, message));
        return Array.from(byId.values());
      });
      setShareLinks((prev) => [...prev.filter((link) => link.id !== payload.link.id), payload.link]);
      return {
        track: payload.track || undefined,
        playlist: payload.playlist || undefined,
        link: payload.link,
      };
    } catch (error) {
      console.error('[MediaStore] Public share lookup failed', error);
      return null;
    }
  };

  const sendMessage = async (clientId: string, content: string, image_url?: string | null, direction: 'inbound' | 'outbound' = 'outbound') => {
    const client = clients.find((item) => item.id === clientId);
    const candidate = withPendingKeys({
      id: uuidv4(),
      client_id: clientId,
      recipient_id: direction === 'outbound' ? (client?.email || 'unknown@client.com') : 'producer@ogbeatz.com',
      content,
      image_url: image_url || null,
      direction,
      timestamp: new Date().toISOString(),
      is_read: false,
    } as Message);
    try {
      const saved = connected ? await dataStore.createMessage(candidate as Message) : candidate as Message;
      setMessages((prev) => [...prev, saved]);
      void addActivity({
        type: 'social',
        user: direction === 'inbound' ? (client?.name || 'Client') : 'OGBeatz',
        action: direction === 'inbound' ? 'submitted feedback' : `Sent message to ${client?.name || 'Client'}`,
        details: content,
        client_id: clientId,
      });
    } catch (error: any) {
      addToast(`Message failed: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const addPromoVideo = async (incoming: Partial<PromoVideo>) => {
    const id = !incoming.id || incoming.id.startsWith('local-') ? uuidv4() : incoming.id;
    let videoUrl = incoming.video_url || '';
    let thumbnailUrl = incoming.thumbnail_url || '';
    const mediaFields: Record<string, any> = { ...incoming };

    if (incoming.video_data instanceof Blob) {
      try {
        const lf = (await import('localforage')).default;
        await lf.setItem(`promo_video_blob_${id}`, incoming.video_data);
      } catch (error) {
        console.warn('[MediaStore] Could not cache promo video blob', error);
      }
      if (connected) {
        const file = incoming.video_data instanceof File
          ? incoming.video_data
          : new File([incoming.video_data], `${id}.mp4`, { type: incoming.video_data.type || 'video/mp4' });
        const uploaded = await dataStore.uploadFile('promo-video', id, file);
        videoUrl = uploaded.url;
        mediaFields.video_key = uploaded.objectKey;
      } else if (!videoUrl) {
        videoUrl = URL.createObjectURL(incoming.video_data);
      }
    }

    if (incoming.thumbnail_data instanceof Blob && connected) {
      const file = incoming.thumbnail_data instanceof File
        ? incoming.thumbnail_data
        : new File([incoming.thumbnail_data], `${id}.jpg`, { type: incoming.thumbnail_data.type || 'image/jpeg' });
      const uploaded = await dataStore.uploadFile('artwork', id, file);
      thumbnailUrl = uploaded.url;
      mediaFields.thumbnail_key = uploaded.objectKey;
    }

    const candidate = withPendingKeys({
      id,
      track_id: incoming.track_id,
      playlist_id: incoming.playlist_id,
      style: incoming.style || 'minimalist',
      status: incoming.status || 'ready',
      created_at: incoming.created_at || new Date().toISOString(),
      name: incoming.name || incoming.title || 'Watermark Clean Render',
      title: incoming.title,
      ...mediaFields,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl || incoming.thumbnail_url || '/ogbeatz_logo.svg',
    } as PromoVideo);

    try {
      const canPersist = connected && !isTemporaryUrl(candidate.video_url) && Boolean(candidate.video_url || (candidate as any).video_key);
      const saved = canPersist ? await dataStore.createPromoVideo(candidate as PromoVideo) : candidate as PromoVideo;
      setPromoVideos((prev) => [...prev.filter((video) => video.id !== id), saved]);
    } catch (error: any) {
      addToast(`Failed to save promo video: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const deletePromoVideo = async (id: string) => {
    try {
      if (connected) await dataStore.deletePromoVideo(id);
      setPromoVideos((prev) => prev.filter((video) => video.id !== id));
      const lf = (await import('localforage')).default;
      await lf.removeItem(`promo_video_blob_${id}`);
    } catch (error: any) {
      addToast(`Failed to delete promo video: ${error?.message || error}`, 'error');
      throw error;
    }
  };

  const incrementShareLinkAccess = async (id: string) => {
    if (publicShareLocation()) return;
    setShareLinks((prev) => prev.map((link) => link.id === id ? { ...link, access_count: (link.access_count || 0) + 1 } : link));
  };

  const analyzeTrack = async (name: string, clientDuration?: number, file?: File | null, fileUrl?: string | null) => {
    let sourceFile = file || null;
    if (!sourceFile && fileUrl) {
      try {
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        sourceFile = new File([blob], name, { type: blob.type || 'audio/mpeg' });
      } catch (error) {
        console.warn('[MediaStore] Could not fetch audio for DSP analysis', error);
      }
    }
    if (analysisEngine === 'dsp' && sourceFile) {
      const result = await analyzeAudioDsp(sourceFile);
      const key = result.camelotKey ? `${result.key} (${result.camelotKey})` : result.key;
      return { bpm: Math.round(result.bpm), key, duration: clientDuration, tags: result.tags || [] };
    }

    const duration = clientDuration || 0;
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: name, duration }),
    });
    if (!response.ok) throw new Error(`AI Analysis server returned status ${response.status}`);
    const data = await response.json();
    const key = data.camelot_key ? `${data.key} (${data.camelot_key})` : data.key;
    return { bpm: Math.round(Number(data.bpm || 0)), key, duration, tags: Array.isArray(data.tags) ? data.tags : [] };
  };

  const uploadFile = async (bucket: string, file: File): Promise<string | null> => {
    try {
      if (!connected) return URL.createObjectURL(file);
      const relatedId = uuidv4();
      const uploaded = await dataStore.uploadFile(uploadCategory(bucket), relatedId, file);
      pendingMediaKeys.current.set(uploaded.url, uploaded.objectKey);
      return uploaded.url;
    } catch (error: any) {
      console.error('[MediaStore] AWS media upload failed', error);
      addToast(`Cloud media upload failed: ${error?.message || error}`, 'error');
      return null;
    }
  };

  const handleSetAnalysisEngine = (engine: 'ai' | 'dsp') => {
    setAnalysisEngine(engine);
    try { localStorage.setItem('ogbeatz_analysis_engine', JSON.stringify(engine)); } catch { /* ignore */ }
  };

  const handleSetEnableMockData = (value: boolean) => {
    setEnableMockData(value);
    try { localStorage.setItem('ogbeatz_enable_mock_data', JSON.stringify(value)); } catch { /* ignore */ }
  };

  return (
    <MediaStoreContext.Provider value={{
      tracks, playlists, clients, activities, profile, loading, loadingProgress, loadingStatusText,
      addTrack, updateTrack, deleteTrack, addPlaylist, updatePlaylist, deletePlaylist,
      addTrackToPlaylist, removeTrackFromPlaylist, addClient, updateClient, deleteClient, updateProfile,
      shareLinks, addShareLink, deleteShareLink, getShareContent, addActivity, analyzeTrack,
      analysisEngine, setAnalysisEngine: handleSetAnalysisEngine, messages, sendMessage,
      promoVideos, addPromoVideo, deletePromoVideo, incrementShareLinkAccess, uploadFile,
      toasts, addToast, removeToast, connected, enableMockData, setEnableMockData: handleSetEnableMockData,
    }}>
      {children}
    </MediaStoreContext.Provider>
  );
}

export function useMediaStore() {
  const context = useContext(MediaStoreContext);
  if (!context) throw new Error('useMediaStore must be used within MediaStoreProvider');
  return context;
}

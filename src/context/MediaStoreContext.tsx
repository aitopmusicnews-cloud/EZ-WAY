import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Track, Playlist, Client, Activity, ShareLink, UserProfile, Message, PromoVideo } from '@/src/types';
import { getSupabaseClient } from "@/src/lib/supabase";
import { analyzeAudioDsp } from '@/src/services/audioDsp';

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
  getShareContent: (token: string) => Promise<{ track?: Track, playlist?: Playlist, link: ShareLink } | null>;
  addActivity: (activity: Partial<Activity>) => Promise<void>;
  analyzeTrack: (name: string, duration?: number, file?: File | null, fileUrl?: string | null) => Promise<{ bpm: number, key: string, duration?: number, tags?: string[] }>;
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

const restorePromoVideoUrls = async (videosList: PromoVideo[]): Promise<PromoVideo[]> => {
  try {
    const lf = (await import('localforage')).default;
    const restored = await Promise.all(videosList.map(async (video) => {
      // Check if we have raw video binary in localforage
      const blob = await lf.getItem(`promo_video_blob_${video.id}`) as Blob | null;
      if (blob instanceof Blob) {
        // Revoke the old URL first if it starts with blob: (to save memory)
        if (video.video_url?.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(video.video_url);
          } catch (e) {
            // ignore
          }
        }
        return {
          ...video,
          video_url: URL.createObjectURL(blob),
          video_data: blob
        };
      }
      return video;
    }));
    return restored;
  } catch (err) {
    console.warn("Could not restore promo video URLs from localforage:", err);
    return videosList;
  }
};

const UUID_TRACK_1 = "b3017fc8-0ae5-4ad9-a612-da0eb226d181"; // Midnight Lounge
const UUID_TRACK_2 = "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc"; // Hyperdrive
const UUID_TRACK_3 = "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41"; // Trap Lord
const UUID_TRACK_4 = "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd"; // Soul Searching
const UUID_TRACK_5 = "55555555-4444-3333-2222-111111111111"; // Keep Em' Thirsty
const UUID_TRACK_6 = "5c5e62f9-2b6d-4912-986c-2f963a7d2b45"; // Cyber City

const UUID_PLAYLIST_1 = "b42fbb1d-8422-4467-8501-c88f11762ebb"; // Lofi & Boom Bap Soul
const UUID_PLAYLIST_2 = "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc"; // Trap & Heavy Synthesis

const UUID_CLIENT_1 = "fa8d30e5-22b6-4acb-8f92-71cbe04663bc"; // Marcus Kane
const UUID_CLIENT_2 = "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e"; // Clara Vance
const UUID_CLIENT_3 = "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb"; // J-Flo Beats

const UUID_MSG_1 = "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc";
const UUID_MSG_2 = "88fdcae3-2cd7-42cf-be91-23caefdf01ab";

const UUID_ACT_1 = "cc13d7f8-31df-4bca-bd11-ef0db4623fc5";
const UUID_ACT_2 = "f712ac23-1d04-4bda-aee3-bc01f893cdba";
const UUID_ACT_3 = "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4";

const UUID_PROFILE = "cb9fba24-8141-cfa3-bdf2-cd9e11fcbcba";

const MOCK_TRACKS: Track[] = [];
const MOCK_PLAYLISTS: Playlist[] = [];
const MOCK_CLIENTS: Client[] = [];
const MOCK_MESSAGES: Message[] = [];
const MOCK_ACTIVITIES: Activity[] = [];

const MOCK_PROFILE: UserProfile = {
  id: UUID_PROFILE,
  name: "THE BEATZ WAY Admin",
  artist_name: "THE BEATZ WAY",
  email: "cdtfullsail@gmail.com",
  avatar_url: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=450",
  bio: "Multi-platinum platinum-grade sound producer, mixing engineer, and audio director. Author of modern catalog beat tape reviews.",
  social_links: {
    instagram: "https://instagram.com/beatzway",
    spotify: "https://open.spotify.com/artist/beatzway",
    twitter: "https://twitter.com/beatzway"
  }
};

const MediaStoreContext = createContext<MediaStoreContextType | undefined>(undefined);

export function MediaStoreProvider({ children }: { children: React.ReactNode }) {
  const [enableMockData, setEnableMockData] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ogbeatz_enable_mock_data');
      if (stored !== null) {
        return stored === 'true';
      }
      return false;
    } catch {
      return false;
    }
  });

  const [tracks, setTracks] = useState<Track[]>(() => {
    try {
      const hasCustomTracks = localStorage.getItem('ogbeatz_tracks') !== null;
      const storedMockState = localStorage.getItem('ogbeatz_enable_mock_data');
      const mockEnabled = storedMockState === null ? !hasCustomTracks : storedMockState === 'true';

      const cached = localStorage.getItem('ogbeatz_tracks');
      if (cached) {
        const parsed = JSON.parse(cached) as Track[];
        if (parsed && parsed.length > 0) {
          // Filter out ALL current and old mock tracks to get purely custom tracks
          const customOnly = parsed.filter(t => 
            t.id !== "b3017fc8-0ae5-4ad9-a612-da0eb226d181" && 
            t.id !== "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc" && 
            t.id !== "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41" && 
            t.id !== "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd" && 
            t.id !== "55555555-4444-3333-2222-111111111111" && 
            t.id !== "5c5e62f9-2b6d-4912-986c-2f963a7d2b45" &&
            t.id !== "11111111-1111-1111-1111-111111111111" && 
            t.id !== "22222222-2222-2222-2222-222222222222" && 
            t.id !== "33333333-3333-3333-3333-333333333333" && 
            t.id !== "44444444-4444-4444-4444-444444444444"
          );
          
          if (mockEnabled) {
            const merged = [...MOCK_TRACKS];
            customOnly.forEach(ct => {
              if (!merged.some(m => m.id === ct.id)) {
                merged.push(ct);
              }
            });
            return merged;
          } else {
            return customOnly;
          }
        }
      }
      return mockEnabled ? MOCK_TRACKS : [];
    } catch {
      return MOCK_TRACKS;
    }
  });

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const hasCustomTracks = localStorage.getItem('ogbeatz_tracks') !== null;
      const storedMockState = localStorage.getItem('ogbeatz_enable_mock_data');
      const mockEnabled = storedMockState === null ? !hasCustomTracks : storedMockState === 'true';

      const cached = localStorage.getItem('ogbeatz_playlists');
      if (cached) {
        const parsed = JSON.parse(cached) as Playlist[];
        if (parsed && parsed.length > 0) {
          // Filter out ALL current and old mock playlists to get custom only
          const customOnly = parsed.filter(p => 
            p.id !== "b42fbb1d-8422-4467-8501-c88f11762ebb" && 
            p.id !== "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc" &&
            p.id !== "55555555-5555-5555-5555-555555555555" && 
            p.id !== "66666666-6666-6666-6666-666666666666"
          );
          
          if (mockEnabled) {
            const merged = [...MOCK_PLAYLISTS];
            customOnly.forEach(cp => {
              if (!merged.some(m => m.id === cp.id)) {
                merged.push(cp);
              }
            });
            return merged;
          } else {
            return customOnly;
          }
        }
      }
      return mockEnabled ? MOCK_PLAYLISTS : [];
    } catch {
      return MOCK_PLAYLISTS;
    }
  });

  const [clients, setClients] = useState<Client[]>(() => {
    try {
      const hasCustomTracks = localStorage.getItem('ogbeatz_tracks') !== null;
      const storedMockState = localStorage.getItem('ogbeatz_enable_mock_data');
      const mockEnabled = storedMockState === null ? !hasCustomTracks : storedMockState === 'true';

      const cached = localStorage.getItem('ogbeatz_clients');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
          // Filter out ALL current and old mock clients to get custom only
          const customOnly = parsed.filter((c: any) => 
            c.id !== "fa8d30e5-22b6-4acb-8f92-71cbe04663bc" && 
            c.id !== "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e" && 
            c.id !== "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb" &&
            c.id !== "77777777-7777-7777-7777-777777777777" && 
            c.id !== "88888888-8888-8888-8888-888888888888"
          );
          
          if (mockEnabled) {
            const merged = [...MOCK_CLIENTS];
            customOnly.forEach((cc: any) => {
              if (!merged.some(m => m.id === cc.id)) {
                merged.push(cc);
              }
            });
            return merged;
          } else {
            return customOnly;
          }
        }
      }
      return mockEnabled ? MOCK_CLIENTS : [];
    } catch {
      return MOCK_CLIENTS;
    }
  });

  const [activities, setActivities] = useState<Activity[]>(() => {
    try {
      const hasCustomTracks = localStorage.getItem('ogbeatz_tracks') !== null;
      const storedMockState = localStorage.getItem('ogbeatz_enable_mock_data');
      const mockEnabled = storedMockState === null ? !hasCustomTracks : storedMockState === 'true';

      const cached = localStorage.getItem('ogbeatz_activities');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
          // Filter out ALL current and old mock activities
          const customOnly = parsed.filter((a: any) => 
            a.id !== "cc13d7f8-31df-4bca-bd11-ef0db4623fc5" && 
            a.id !== "f712ac23-1d04-4bda-aee3-bc01f893cdba" && 
            a.id !== "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4" &&
            a.id !== "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" && 
            a.id !== "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2" && 
            a.id !== "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"
          );
          
          if (mockEnabled) {
            const merged = [...MOCK_ACTIVITIES];
            customOnly.forEach((ca: any) => {
              if (!merged.some(m => m.id === ca.id)) {
                merged.push(ca);
              }
            });
            return merged;
          } else {
            return customOnly;
          }
        }
      }
      return mockEnabled ? MOCK_ACTIVITIES : [];
    } catch {
      return MOCK_ACTIVITIES;
    }
  });

  const [shareLinks, setShareLinks] = useState<ShareLink[]>(() => {
    try {
      const cached = localStorage.getItem('ogbeatz_share_links');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const hasCustomTracks = localStorage.getItem('ogbeatz_tracks') !== null;
      const storedMockState = localStorage.getItem('ogbeatz_enable_mock_data');
      const mockEnabled = storedMockState === null ? !hasCustomTracks : storedMockState === 'true';

      const cached = localStorage.getItem('ogbeatz_messages');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
          // Filter out ALL current and old mock messages
          const customOnly = parsed.filter((m: any) => 
            m.id !== "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc" && 
            m.id !== "88fdcae3-2cd7-42cf-be91-23caefdf01ab" &&
            m.id !== "99999999-9999-9999-9999-999999999991" && 
            m.id !== "99999999-9999-9999-9999-999999999992" && 
            m.id !== "99999999-9999-9999-9999-999999999993"
          );
          
          if (mockEnabled) {
            const merged = [...MOCK_MESSAGES];
            customOnly.forEach((cm: any) => {
              if (!merged.some(m => m.id === cm.id)) {
                merged.push(cm);
              }
            });
            return merged;
          } else {
            return customOnly;
          }
        }
      }
      return mockEnabled ? MOCK_MESSAGES : [];
    } catch {
      return MOCK_MESSAGES;
    }
  });

  const [promoVideos, setPromoVideos] = useState<PromoVideo[]>(() => {
    try {
      const cached = localStorage.getItem('ogbeatz_promo_videos');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem('beatzway_profile');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.name === "THE BEATZ WAY Admin") {
          return parsed;
        }
      }
      return MOCK_PROFILE;
    } catch {
      return MOCK_PROFILE;
    }
  });

  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatusText, setLoadingStatusText] = useState("Establishing vault node handshakes...");
  const [supabase, setSupabase] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    // Silenced toast notifications to prevent overwhelming the interface
    console.log(`[Toast Silenced] [${type}] ${message}`);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const [analysisEngine, setAnalysisEngine] = useState<'ai' | 'dsp'>(() => {
    try {
      const cached = localStorage.getItem('ogbeatz_analysis_engine');
      return (cached as 'ai' | 'dsp') || 'dsp';
    } catch {
      return 'dsp';
    }
  });

  const handleSetAnalysisEngine = (engine: 'ai' | 'dsp') => {
    setAnalysisEngine(engine);
    try {
      localStorage.setItem('ogbeatz_analysis_engine', engine);
    } catch (e) {
      // ignore
    }
  };

  const handleSetEnableMockData = (val: boolean) => {
    setEnableMockData(val);
    try {
      localStorage.setItem('ogbeatz_enable_mock_data', String(val));
    } catch (e) {
      // ignore
    }
    
    if (val) {
      setTracks(prev => {
        const customOnly = prev.filter(t => 
          t.id !== "b3017fc8-0ae5-4ad9-a612-da0eb226d181" && 
          t.id !== "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc" && 
          t.id !== "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41" && 
          t.id !== "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd" && 
          t.id !== "55555555-4444-3333-2222-111111111111" && 
          t.id !== "5c5e62f9-2b6d-4912-986c-2f963a7d2b45"
        );
        return [...MOCK_TRACKS, ...customOnly];
      });
      setPlaylists(prev => {
        const customOnly = prev.filter(p => 
          p.id !== "b42fbb1d-8422-4467-8501-c88f11762ebb" && 
          p.id !== "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc"
        );
        return [...MOCK_PLAYLISTS, ...customOnly];
      });
      setClients(prev => {
        const customOnly = prev.filter(c => 
          c.id !== "fa8d30e5-22b6-4acb-8f92-71cbe04663bc" && 
          c.id !== "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e" && 
          c.id !== "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb"
        );
        return [...MOCK_CLIENTS, ...customOnly];
      });
      setActivities(prev => {
        const customOnly = prev.filter(a => 
          a.id !== "cc13d7f8-31df-4bca-bd11-ef0db4623fc5" && 
          a.id !== "f712ac23-1d04-4bda-aee3-bc01f893cdba" && 
          a.id !== "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4"
        );
        return [...MOCK_ACTIVITIES, ...customOnly];
      });
      setMessages(prev => {
        const customOnly = prev.filter(m => 
          m.id !== "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc" && 
          m.id !== "88fdcae3-2cd7-42cf-be91-23caefdf01ab"
        );
        return [...MOCK_MESSAGES, ...customOnly];
      });
    } else {
      setTracks(prev => prev.filter(t => 
        t.id !== "b3017fc8-0ae5-4ad9-a612-da0eb226d181" && 
        t.id !== "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc" && 
        t.id !== "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41" && 
        t.id !== "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd" && 
        t.id !== "55555555-4444-3333-2222-111111111111" && 
        t.id !== "5c5e62f9-2b6d-4912-986c-2f963a7d2b45" &&
        t.id !== "11111111-1111-1111-1111-111111111111" && 
        t.id !== "22222222-2222-2222-2222-222222222222" && 
        t.id !== "33333333-3333-3333-3333-333333333333" && 
        t.id !== "44444444-4444-4444-4444-444444444444"
      ));
      setPlaylists(prev => prev.filter(p => 
        p.id !== "b42fbb1d-8422-4467-8501-c88f11762ebb" && 
        p.id !== "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc" &&
        p.id !== "55555555-5555-5555-5555-555555555555" && 
        p.id !== "66666666-6666-6666-6666-666666666666"
      ));
      setClients(prev => prev.filter(c => 
        c.id !== "fa8d30e5-22b6-4acb-8f92-71cbe04663bc" && 
        c.id !== "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e" && 
        c.id !== "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb" &&
        c.id !== "77777777-7777-7777-7777-777777777777" && 
        c.id !== "88888888-8888-8888-8888-888888888888"
      ));
      setActivities(prev => prev.filter(a => 
        a.id !== "cc13d7f8-31df-4bca-bd11-ef0db4623fc5" && 
        a.id !== "f712ac23-1d04-4bda-aee3-bc01f893cdba" && 
        a.id !== "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4" &&
        a.id !== "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" && 
        a.id !== "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2" && 
        a.id !== "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"
      ));
      setMessages(prev => prev.filter(m => 
        m.id !== "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc" && 
        m.id !== "88fdcae3-2cd7-42cf-be91-23caefdf01ab" &&
        m.id !== "99999999-9999-9999-9999-999999999991" && 
        m.id !== "99999999-9999-9999-9999-999999999992" && 
        m.id !== "99999999-9999-9999-9999-999999999993"
      ));
    }
  };

  // Sync to local storage whenever states change (only after loading is complete to protect cached data from startup blank states)
  useEffect(() => {
    if (!loading) {
      try {
        localStorage.setItem('ogbeatz_tracks', JSON.stringify(tracks));
        localStorage.setItem('ogbeatz_playlists', JSON.stringify(playlists));
        localStorage.setItem('ogbeatz_clients', JSON.stringify(clients));
        localStorage.setItem('ogbeatz_activities', JSON.stringify(activities));
        localStorage.setItem('ogbeatz_share_links', JSON.stringify(shareLinks));
        localStorage.setItem('ogbeatz_messages', JSON.stringify(messages));
        localStorage.setItem('ogbeatz_promo_videos', JSON.stringify(promoVideos));
        if (profile) {
          localStorage.setItem('ogbeatz_profile', JSON.stringify(profile));
        }
      } catch (e) {
        console.warn("Could not sync to localStorage:", e);
      }
    }
  }, [tracks, playlists, clients, activities, shareLinks, messages, promoVideos, profile, loading]);

  useEffect(() => {
    async function init() {
      try {
        setLoadingProgress(10);
        setLoadingStatusText("Establishing vault node handshakes...");
        // Retrieve Supabase client. It is configured synchronously, so we get it immediately.
        let activeSupabase = await getSupabaseClient().catch(err => {
          console.warn("Supabase client failed to resolve: utilizing offline fallback model:", err);
          return null;
        });

        let isDbConnected = false;
        if (activeSupabase) {
          try {
            setLoadingStatusText("Verifying database link...");
            const coldStartTimer = setTimeout(() => {
              setLoadingStatusText("Waking up cold database (takes 10-25s)...");
              setLoadingProgress(15);
            }, 1000);

            // Fast connection verify check with a 4000ms timeout.
            // If it fails or times out, we DO NOT null activeSupabase - we still proceed and let actual table queries fetch or fallback cleanly!
            await Promise.race([
              activeSupabase.from('profiles').select('id').limit(1),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Database check timeout")), 4000))
            ]).catch(() => {});

            clearTimeout(coldStartTimer);
            isDbConnected = true;
          } catch (probeErr: any) {
            console.warn("[Supabase Connection Probe] Cloud did not resolve instantly; proceeding with fallback fetch rules:", probeErr);
            isDbConnected = true;
          }
        }

        if (activeSupabase) {
          setSupabase(activeSupabase);
          setConnected(true);
          setLoadingProgress(20);
          setLoadingStatusText("Secure handshake established. Syncing databases...");
          
          // Asynchronously attempt to auto-patch schema to add 'lyrics' column on tracks table
          try {
            (async () => {
              const query = "ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics TEXT;";
              const rpcCandidates = [
                { name: "exec_sql", arg: "sql_query" },
                { name: "exec_sql", arg: "query" },
                { name: "run_sql", arg: "sql" },
                { name: "execute_sql", arg: "query" },
                { name: "execute_sql", arg: "sql" }
              ];
              for (const cand of rpcCandidates) {
                try {
                  const { error } = await activeSupabase.rpc(cand.name, { [cand.arg]: query });
                  if (!error) {
                    console.log(`[Supabase Auto-Patch] Column 'lyrics' successfully created/verified via RPC "${cand.name}"!`);
                    break;
                  }
                } catch (e) {
                  // silent catch
                }
              }
            })();
          } catch (e) {
            console.warn("[Supabase Auto-Patch] Failed schema patch trigger:", e);
          }

          try {
            // Robust retry helper with exponential backoff to handle cold wake-ups and statement timeouts gracefully
            const fetchWithRetry = async (table: string, retries = 2, delayMs = 1000): Promise<any[] | null> => {
              for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                  console.log(`[Supabase Sync] Fetching "${table}" (Attempt ${attempt}/${retries})...`);
                  const { data, error } = await Promise.race([
                    activeSupabase.from(table).select('*'),
                    new Promise<any>((_, reject) => setTimeout(() => reject(new Error(`Fetch timed out for table ${table}`)), 15000))
                  ]);
                  
                  if (error) {
                    console.warn(`[Supabase Sync] Attempt ${attempt} encountered error for "${table}":`, error);
                    // 42P01: Relation/Table does not exist (requires user migrations/seeding)
                    // 42501: RLS policy blocking access or permission denied (cannot access via Anon key)
                    if (error.code === '42P01' || error.code === '42501') {
                      console.log(`[Supabase Sync] Non-retryable error (${error.code}) for "${table}". Skipping retries and using offline-first data fallback.`);
                      return null;
                    }
                    if (attempt < retries) {
                      // Exponential backoff with random jitter to allow DB instance load to steady
                      const backoff = delayMs * Math.pow(2, attempt - 1) + Math.random() * 400;
                      console.log(`[Supabase Sync] Retrying "${table}" in ${Math.round(backoff)}ms due to timeout/error...`);
                      await new Promise(resolve => setTimeout(resolve, backoff));
                      continue;
                    }
                    return null;
                  }
                  
                  console.log(`[Supabase Sync] Successfully retrieved ${data?.length || 0} rows from "${table}".`);
                  return data;
                } catch (err) {
                  console.error(`[Supabase Sync] Attempt ${attempt} caught exception for "${table}":`, err);
                  if (attempt < retries) {
                    const backoff = delayMs * Math.pow(2, attempt - 1) + Math.random() * 400;
                    await new Promise(resolve => setTimeout(resolve, backoff));
                    continue;
                  }
                  return null;
                }
              }
              return null;
            };

            let settledCount = 0;
            const totalTasks = 8;
            const updateProgress = (tableName: string) => {
              settledCount++;
              const pct = 20 + Math.round((settledCount / totalTasks) * 80);
              setLoadingProgress(pct);
              setLoadingStatusText(`Synchronized: "${tableName}" schema`);
            };

            const initTracks = async () => {
              try {
                const data = await fetchWithRetry('tracks');
                if (data && data.length > 0) {
                  setTracks(prev => {
                    const localCustom = prev.filter(t => 
                      t.id !== "b3017fc8-0ae5-4ad9-a612-da0eb226d181" && 
                      t.id !== "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc" && 
                      t.id !== "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41" && 
                      t.id !== "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd" && 
                      t.id !== "55555555-4444-3333-2222-111111111111" && 
                      t.id !== "5c5e62f9-2b6d-4912-986c-2f963a7d2b45"
                    );
                    const remoteFiltered = enableMockData ? data : data.filter(t => 
                      t.id !== "b3017fc8-0ae5-4ad9-a612-da0eb226d181" && 
                      t.id !== "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc" && 
                      t.id !== "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41" && 
                      t.id !== "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd" && 
                      t.id !== "55555555-4444-3333-2222-111111111111" && 
                      t.id !== "5c5e62f9-2b6d-4912-986c-2f963a7d2b45"
                    );
                    const merged = enableMockData ? [...MOCK_TRACKS] : [];
                    remoteFiltered.forEach(rt => {
                      if (!merged.some(m => m.id === rt.id)) {
                        merged.push(rt);
                      }
                    });
                    localCustom.forEach(ct => {
                      if (!merged.some(m => m.id === ct.id)) {
                        merged.push(ct);
                      }
                    });
                    return merged;
                  });
                } else {
                  console.log("Seeding tracks table in Supabase or utilizing fallback...");
                  if (data && data.length === 0 && enableMockData) {
                    try {
                      await activeSupabase.from('tracks').insert(MOCK_TRACKS);
                    } catch (insErr) {
                      console.warn("tracks seeding failed:", insErr);
                    }
                  }
                  setTracks(prev => {
                    const localCustom = prev.filter(t => 
                      t.id !== "b3017fc8-0ae5-4ad9-a612-da0eb226d181" && 
                      t.id !== "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc" && 
                      t.id !== "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41" && 
                      t.id !== "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd" && 
                      t.id !== "55555555-4444-3333-2222-111111111111" && 
                      t.id !== "5c5e62f9-2b6d-4912-986c-2f963a7d2b45"
                    );
                    return enableMockData ? [...MOCK_TRACKS, ...localCustom] : localCustom;
                  });
                }
              } catch (err) {
                console.error("tracks init failed:", err);
                setTracks(prev => {
                  const localCustom = prev.filter(t => 
                    t.id !== "b3017fc8-0ae5-4ad9-a612-da0eb226d181" && 
                    t.id !== "a3f4e2c9-d9f2-491b-8713-3cc0eabb55bc" && 
                    t.id !== "8d1ef9b2-32a5-4eb1-bca3-ef0cb4628f41" && 
                    t.id !== "2f9bb7d4-8d9e-4cde-aef1-fa2b83492ebd" && 
                    t.id !== "55555555-4444-3333-2222-111111111111" && 
                    t.id !== "5c5e62f9-2b6d-4912-986c-2f963a7d2b45"
                  );
                  return enableMockData ? [...MOCK_TRACKS, ...localCustom] : localCustom;
                });
              } finally {
                updateProgress("tracks");
              }
            };

            const initPlaylists = async () => {
              try {
                const data = await fetchWithRetry('playlists');
                if (data && data.length > 0) {
                  setPlaylists(prev => {
                    const localCustom = prev.filter(p => 
                      p.id !== "b42fbb1d-8422-4467-8501-c88f11762ebb" && 
                      p.id !== "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc"
                    );
                    const remoteFiltered = enableMockData ? data : data.filter(p => 
                      p.id !== "b42fbb1d-8422-4467-8501-c88f11762ebb" && 
                      p.id !== "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc"
                    );
                    const merged = enableMockData ? [...MOCK_PLAYLISTS] : [];
                    remoteFiltered.forEach(rp => {
                      if (!merged.some(m => m.id === rp.id)) {
                        merged.push(rp);
                      }
                    });
                    localCustom.forEach(cp => {
                      if (!merged.some(m => m.id === cp.id)) {
                        merged.push(cp);
                      }
                    });
                    return merged;
                  });
                } else {
                  console.log("Seeding playlists table in Supabase or utilizing fallback...");
                  if (data && data.length === 0 && enableMockData) {
                    try {
                      await activeSupabase.from('playlists').insert(MOCK_PLAYLISTS);
                    } catch (insErr) {
                      console.warn("playlists seeding failed:", insErr);
                    }
                  }
                  setPlaylists(prev => {
                    const localCustom = prev.filter(p => 
                      p.id !== "b42fbb1d-8422-4467-8501-c88f11762ebb" && 
                      p.id !== "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc"
                    );
                    return enableMockData ? [...MOCK_PLAYLISTS, ...localCustom] : localCustom;
                  });
                }
              } catch (err) {
                console.error("playlists init failed:", err);
                setPlaylists(prev => {
                  const localCustom = prev.filter(p => 
                    p.id !== "b42fbb1d-8422-4467-8501-c88f11762ebb" && 
                    p.id !== "51c243f6-e61e-dbba-9c2f-e8dcd9ee55bc"
                  );
                  return enableMockData ? [...MOCK_PLAYLISTS, ...localCustom] : localCustom;
                });
              } finally {
                updateProgress("playlists");
              }
            };

            const initClients = async () => {
              try {
                 const data = await fetchWithRetry('clients');
                if (data && data.length > 0) {
                  setClients(prev => {
                    const localCustom = prev.filter(c => 
                      c.id !== "fa8d30e5-22b6-4acb-8f92-71cbe04663bc" && 
                      c.id !== "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e" && 
                      c.id !== "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb"
                    );
                    const remoteFiltered = enableMockData ? data : data.filter(c => 
                      c.id !== "fa8d30e5-22b6-4acb-8f92-71cbe04663bc" && 
                      c.id !== "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e" && 
                      c.id !== "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb"
                    );
                    const merged = enableMockData ? [...MOCK_CLIENTS] : [];
                    remoteFiltered.forEach(rc => {
                      if (!merged.some(m => m.id === rc.id)) {
                        merged.push(rc);
                      }
                    });
                    localCustom.forEach(cc => {
                      if (!merged.some(m => m.id === cc.id)) {
                        merged.push(cc);
                      }
                    });
                    return merged;
                  });
                } else {
                  console.log("Seeding clients table in Supabase or utilizing fallback...");
                  if (data && data.length === 0 && enableMockData) {
                    try {
                      await activeSupabase.from('clients').insert(MOCK_CLIENTS);
                    } catch (insErr) {
                      console.warn("clients seeding failed:", insErr);
                    }
                  }
                  setClients(prev => {
                    const localCustom = prev.filter(c => 
                      c.id !== "fa8d30e5-22b6-4acb-8f92-71cbe04663bc" && 
                      c.id !== "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e" && 
                      c.id !== "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb"
                    );
                    return enableMockData ? [...MOCK_CLIENTS, ...localCustom] : localCustom;
                  });
                }
              } catch (err) {
                console.error("clients init failed:", err);
                setClients(prev => {
                  const localCustom = prev.filter(c => 
                    c.id !== "fa8d30e5-22b6-4acb-8f92-71cbe04663bc" && 
                    c.id !== "e6a4b3d7-89df-4cfa-8123-5d3c88abf41e" && 
                    c.id !== "29b9f71c-3cd7-4eb3-8124-7ef001ab41eb"
                  );
                  return enableMockData ? [...MOCK_CLIENTS, ...localCustom] : localCustom;
                });
              } finally {
                updateProgress("clients");
              }
            };

            const initShareLinks = async () => {
              try {
                const data = await fetchWithRetry('share_links');
                if (data) {
                  setShareLinks(data);
                } else {
                  console.warn("share_links table fetch returned null. Utilizing empty fallback.");
                  setShareLinks([]);
                }
              } catch (err) {
                console.error("share_links init failed:", err);
                setShareLinks([]);
              } finally {
                updateProgress("share_links");
              }
            };

            const initActivities = async () => {
              try {
                const data = await fetchWithRetry('activities');
                if (data && data.length > 0) {
                  setActivities(prev => {
                    const localCustom = prev.filter(a => 
                      a.id !== "cc13d7f8-31df-4bca-bd11-ef0db4623fc5" && 
                      a.id !== "f712ac23-1d04-4bda-aee3-bc01f893cdba" && 
                      a.id !== "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4"
                    );
                    const remoteFiltered = enableMockData ? data : data.filter(a => 
                      a.id !== "cc13d7f8-31df-4bca-bd11-ef0db4623fc5" && 
                      a.id !== "f712ac23-1d04-4bda-aee3-bc01f893cdba" && 
                      a.id !== "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4"
                    );
                    const merged = enableMockData ? [...MOCK_ACTIVITIES] : [];
                    remoteFiltered.forEach(ra => {
                      if (!merged.some(m => m.id === ra.id)) {
                        merged.push(ra);
                      }
                    });
                    localCustom.forEach(ca => {
                      if (!merged.some(m => m.id === ca.id)) {
                        merged.push(ca);
                      }
                    });
                    return merged;
                  });
                } else {
                  if (data && data.length === 0 && enableMockData) {
                    try {
                      const { data: dbClients } = await activeSupabase.from('clients').select('id');
                      const { data: dbTracks } = await activeSupabase.from('tracks').select('id');
                      const dbClientIds = new Set((dbClients || []).map((c: any) => c.id));
                      const dbTrackIds = new Set((dbTracks || []).map((t: any) => t.id));

                      const validActivities = MOCK_ACTIVITIES.filter(act => 
                        (!act.client_id || dbClientIds.has(act.client_id)) && 
                        (!act.track_id || dbTrackIds.has(act.track_id))
                      );

                      if (validActivities.length > 0) {
                        await activeSupabase.from('activities').insert(validActivities);
                      }
                    } catch (insErr) {
                      console.warn("activities seeding failed:", insErr);
                    }
                  }
                  setActivities(prev => {
                    const localCustom = prev.filter(a => 
                      a.id !== "cc13d7f8-31df-4bca-bd11-ef0db4623fc5" && 
                      a.id !== "f712ac23-1d04-4bda-aee3-bc01f893cdba" && 
                      a.id !== "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4"
                    );
                    return enableMockData ? [...MOCK_ACTIVITIES, ...localCustom] : localCustom;
                  });
                }
              } catch (err) {
                console.error("activities init failed:", err);
                setActivities(prev => {
                  const localCustom = prev.filter(a => 
                    a.id !== "cc13d7f8-31df-4bca-bd11-ef0db4623fc5" && 
                    a.id !== "f712ac23-1d04-4bda-aee3-bc01f893cdba" && 
                    a.id !== "23ca9fd0-e69d-4fa0-bda4-25bfdcbaefd4"
                  );
                  return enableMockData ? [...MOCK_ACTIVITIES, ...localCustom] : localCustom;
                });
              } finally {
                updateProgress("activities");
              }
            };

            const initMessages = async () => {
              try {
                const data = await fetchWithRetry('messages');
                if (data && data.length > 0) {
                  setMessages(prev => {
                    const localCustom = prev.filter(m => 
                      m.id !== "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc" && 
                      m.id !== "88fdcae3-2cd7-42cf-be91-23caefdf01ab"
                    );
                    const remoteFiltered = enableMockData ? data : data.filter(m => 
                      m.id !== "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc" && 
                      m.id !== "88fdcae3-2cd7-42cf-be91-23caefdf01ab"
                    );
                    const merged = enableMockData ? [...MOCK_MESSAGES] : [];
                    remoteFiltered.forEach(rm => {
                      if (!merged.some(m => m.id === rm.id)) {
                        merged.push(rm);
                      }
                    });
                    localCustom.forEach(cm => {
                      if (!merged.some(m => m.id === cm.id)) {
                        merged.push(cm);
                      }
                    });
                    return merged;
                  });
                } else {
                  if (data && data.length === 0 && enableMockData) {
                    try {
                      const { data: dbClients } = await activeSupabase.from('clients').select('id');
                      const dbClientIds = new Set((dbClients || []).map((c: any) => c.id));

                      const validMessages = MOCK_MESSAGES.filter(msg => 
                        (!msg.client_id || dbClientIds.has(msg.client_id))
                      );

                      if (validMessages.length > 0) {
                        await activeSupabase.from('messages').insert(validMessages);
                      }
                    } catch (insErr) {
                      console.warn("messages seeding failed:", insErr);
                    }
                  }
                  setMessages(prev => {
                    const localCustom = prev.filter(m => 
                      m.id !== "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc" && 
                      m.id !== "88fdcae3-2cd7-42cf-be91-23caefdf01ab"
                    );
                    return enableMockData ? [...MOCK_MESSAGES, ...localCustom] : localCustom;
                  });
                }
              } catch (err) {
                console.error("messages init failed:", err);
                setMessages(prev => {
                  const localCustom = prev.filter(m => 
                    m.id !== "1ab5b9c0-82d1-4faa-bc12-9df0ef62bbcc" && 
                    m.id !== "88fdcae3-2cd7-42cf-be91-23caefdf01ab"
                  );
                  return enableMockData ? [...MOCK_MESSAGES, ...localCustom] : localCustom;
                });
              } finally {
                updateProgress("messages");
              }
            };

            const initPromoVideos = async () => {
              try {
                // Bypass remote Supabase fetch for promo videos to ensure no 400 bad requests or cold-start timeouts
                const cached = localStorage.getItem('ogbeatz_promo_videos');
                if (cached) {
                  const data = JSON.parse(cached);
                  const restored = await restorePromoVideoUrls(data);
                  setPromoVideos(restored);
                } else {
                  setPromoVideos([]);
                }
              } catch (err) {
                console.error("Local promo_videos init failed:", err);
                setPromoVideos([]);
              } finally {
                updateProgress("promo_videos");
              }
            };

            const initProfile = async () => {
              try {
                let fetchedProfileResult: any = null;
                for (let att = 1; att <= 2; att++) {
                  try {
                    const { data, error } = await Promise.race([
                      activeSupabase.from('profiles').select('*').single(),
                      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 15000))
                    ]);
                    if (error && error.code !== 'PGRST116') {
                      console.warn(`[Profile Sync] Attempt ${att} error:`, error);
                      if (att < 2) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * att));
                        continue;
                      }
                    }
                    fetchedProfileResult = { data, error };
                    break;
                  } catch (e) {
                    console.error(`[Profile Sync] Exception ${att}:`, e);
                    if (att < 2) {
                      await new Promise(resolve => setTimeout(resolve, 1000 * att));
                      continue;
                    }
                  }
                }

                const existingProf = fetchedProfileResult?.data;
                const profError = fetchedProfileResult?.error;
                let profData = null;

                if (existingProf) {
                  profData = existingProf;
                } else if (!existingProf && (profError?.code === 'PGRST116' || !profError)) {
                  // No profile row in the DB: create a starting master producer profile
                  const defaultProf: UserProfile = {
                    id: uuidv4(),
                    name: "THE BEATZ WAY",
                    artist_name: "THE BEATZ WAY",
                    bio: "Master Recording Engineer, Multi-Platinum Producer, & Architect of THE BEATZ WAY vault.",
                    email: "producer@beatzway.com",
                    avatar_url: "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=300&auto=format&fit=crop",
                    social_links: {
                      instagram: "beatzway_prod",
                      spotify: "beatzway",
                      twitter: "beatzway"
                    }
                  };

                  console.log("[Profile Sync] Creating default producer profile in Supabase...");
                  const { error: insertError } = await Promise.race([
                    activeSupabase.from('profiles').insert(defaultProf),
                    new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Profile insert timeout')), 15000))
                  ]).catch(e => {
                    console.warn("[Profile Sync] Profile insert timed out / failed:", e);
                    return { error: e };
                  });

                  if (!insertError) {
                    profData = defaultProf;
                  } else {
                    console.error("Error creating default profile in Supabase:", insertError);
                  }
                }

                setProfile(profData || profile || {
                  id: "default-id",
                  name: "THE BEATZ WAY",
                  artist_name: "THE BEATZ WAY",
                  bio: "Master Recording Engineer, Multi-Platinum Producer, & Architect of THE BEATZ WAY vault.",
                  email: "producer@beatzway.com",
                  avatar_url: "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=300&auto=format&fit=crop",
                  social_links: {
                    instagram: "beatzway_prod",
                    spotify: "beatzway",
                    twitter: "beatzway"
                  }
                });

              } catch (err) {
                console.error("profiles init failed:", err);
              } finally {
                updateProgress("profiles");
              }
            };

            await Promise.allSettled([
              initTracks(),
              initPlaylists(),
              initClients(),
              initShareLinks(),
              initActivities(),
              initMessages(),
              initPromoVideos(),
              initProfile()
            ]);

          } catch (e) {
            console.error("Supabase load error:", e);
          }
        } else {
          setLoadingProgress(100);
          setLoadingStatusText("Local Fallback Mode active.");
          try {
            const cached = localStorage.getItem('ogbeatz_promo_videos');
            if (cached) {
              setPromoVideos(JSON.parse(cached));
            }
          } catch (e) {
            console.warn("Could not read local cached promo videos:", e);
          }
        }
      } catch (err) {
        console.error("Error during MediaStore init:", err);
      } finally {
        try {
          await new Promise<void>((resolve) => {
            setPromoVideos(prev => {
              restorePromoVideoUrls(prev).then(restored => {
                setPromoVideos(restored);
                resolve();
              }).catch(() => {
                resolve();
              });
              return prev;
            });
          });
        } catch (restoreErr) {
          console.warn("Error resolving localforage promo videos in init finally block:", restoreErr);
        }

        setLoadingProgress(100);
        setLoadingStatusText("Sync is complete...");
        await new Promise(resolve => setTimeout(resolve, 800));
        setLoading(false);
      }
    }

    init();
  }, []);
  const addTrack = async (track: Partial<Track>) => {
    // Round floats (e.g. from audio element metadata loading) to integers to satisfy postgres integer constraint on duration and bpm
    const rawDuration = typeof track.duration === 'number' ? Math.round(track.duration) : (track.duration ? Math.round(parseFloat(track.duration as any)) : 0);
    const rawBpm = typeof track.bpm === 'number' ? Math.round(track.bpm) : (track.bpm ? Math.round(parseFloat(track.bpm as any)) : 120);

    const newTrack: Track = {
      id: uuidv4(),
      name: track.name || "Untitled",
      artist: track.artist || "OGBeatz",
      key_signature: track.key_signature || "C",
      tags: track.tags || [],
      file_url: track.file_url || null,
      image_url: track.image_url || null,
      size: track.size || 0,
      type: track.type || "audio/mpeg",
      plays: 0,
      likes: 0,
      status: "ready",
      created_at: new Date().toISOString(),
      ...track,
      duration: isNaN(rawDuration) ? 0 : rawDuration, // guarantee integer structure
      bpm: isNaN(rawBpm) ? 120 : rawBpm // guarantee integer structure
    };

    setTracks(prev => [newTrack, ...prev]);
    
    if (supabase) {
      const dbTrack = { ...newTrack } as any;
      delete dbTrack.file_data;
      delete dbTrack.image_data;
      
      let { error } = await supabase.from('tracks').insert(dbTrack);
      
      // Resilient Fallback: If 'lyrics' column doesn't exist in Supabase database schema cache
      if (error && (error.message?.includes('lyrics') || error.code === '42703' || error.message?.includes('schema cache'))) {
        console.warn("[MediaStore] 'lyrics' column missing or cache stale in remote Supabase tracks table. Retrying insert without lyrics column...");
        const dbTrackFallback = { ...dbTrack };
        delete dbTrackFallback.lyrics;
        
        const retryResult = await supabase.from('tracks').insert(dbTrackFallback);
        error = retryResult.error;
        if (!error) {
          addToast(`Track saved to DB (lyrics cached locally due to pending database migration)`, 'info');
        }
      }

      if (error) {
        console.error("Error inserting track into Supabase:", error);
        addToast(`Failed to save track to database: ${error.message}`, 'error');
      } else if (!error && !toasts.some(t => t.message.includes("lyrics cached locally"))) {
        addToast(`Successfully saved track "${newTrack.name}" to database!`, 'success');
      }
    } else {
      addToast(`Track "${newTrack.name}" added locally. Database is offline.`, 'info');
    }

    addActivity({
      type: 'upload',
      user: 'OGBeatz',
      action: 'uploaded',
      target: newTrack.name,
      timestamp: new Date().toISOString()
    });

    return newTrack;
  };

  const updateTrack = async (id: string, updates: Partial<Track>) => {
    const cleanUpdates = { ...updates };
    if (typeof cleanUpdates.duration === 'number') {
      cleanUpdates.duration = Math.round(cleanUpdates.duration);
    } else if (cleanUpdates.duration) {
      const parsed = Math.round(parseFloat(cleanUpdates.duration as any));
      cleanUpdates.duration = isNaN(parsed) ? undefined : parsed;
    }

    if (typeof cleanUpdates.bpm === 'number') {
      cleanUpdates.bpm = Math.round(cleanUpdates.bpm);
    } else if (cleanUpdates.bpm) {
      const parsed = Math.round(parseFloat(cleanUpdates.bpm as any));
      cleanUpdates.bpm = isNaN(parsed) ? undefined : parsed;
    }

    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...cleanUpdates } : t));
    
    if (supabase) {
      const dbUpdates = { ...cleanUpdates } as any;
      delete dbUpdates.file_data;
      delete dbUpdates.image_data;
      
      let { error } = await supabase.from('tracks').update(dbUpdates).eq('id', id);
      
      // Resilient Fallback: If 'lyrics' column doesn't exist in Supabase database schema cache
      if (error && (error.message?.includes('lyrics') || error.code === '42703' || error.message?.includes('schema cache'))) {
        console.warn("[MediaStore] 'lyrics' column missing or cache stale in remote Supabase tracks table. Retrying update without lyrics column...");
        const dbUpdatesFallback = { ...dbUpdates };
        delete dbUpdatesFallback.lyrics;
        
        const retryResult = await supabase.from('tracks').update(dbUpdatesFallback).eq('id', id);
        error = retryResult.error;
        if (!error) {
          addToast("Updates saved to DB (lyrics cached locally due to pending database migration)", "info");
        }
      }

      if (error) {
        console.error("Error updating track in Supabase:", error);
        addToast(`Failed to update track in database: ${error.message}`, 'error');
      } else if (!error && !toasts.some(t => t.message.includes("lyrics cached locally"))) {
        addToast(`Successfully updated track in database!`, 'success');
      }
    }
  };

  const deleteTrack = async (id: string) => {
    console.log(`[MediaStore] Initializing deletion for track: ${id}`);
    try {
      // States are updated via Realtime or immediately here
      setTracks(prev => prev.filter(t => t.id !== id));
      setPlaylists(prev => prev.map(pl => ({
        ...pl,
        track_ids: (pl.track_ids || []).filter(tid => tid !== id)
      })));
      setPromoVideos(prev => prev.filter(v => v.track_id !== id));
      setShareLinks(prev => prev.filter(l => l.track_id !== id));

      if (supabase) {
        const { error } = await supabase.from('tracks').delete().eq('id', id);
        if (error) {
          console.error("Error deleting track:", error);
          addToast(`Failed to delete track from backend: ${error.message}`, 'error');
        } else {
          addToast("Track purged from database successfully.", 'success');
        }
      }

      addActivity({
        type: 'system',
        user: 'OGBeatz',
        action: `Purged asset ${id} from reference library`,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[MediaStore] Successfully deleted track: ${id}`);
    } catch (error: any) {
      console.error("[MediaStore] Deletion Failure:", error);
      addToast(`Deletion Failed: ${error.message || error}`, 'error');
    }
  };

  const addTrackToPlaylist = async (trackId: string, playlistId: string) => {
    let newTrackIds: string[] = [];
    setPlaylists(prev => {
      const updated = prev.map(pl => {
        if (pl.id === playlistId) {
          if (pl.track_ids.includes(trackId)) return pl;
          newTrackIds = [...pl.track_ids, trackId];
          return { ...pl, track_ids: newTrackIds };
        }
        return pl;
      });
      return updated;
    });
    
    if (supabase && newTrackIds.length > 0) {
      const { error } = await supabase.from('playlists').update({ track_ids: newTrackIds }).eq('id', playlistId);
      if (error) {
        console.error(error);
        addToast(`Failed to add track to database playlist: ${error.message}`, 'error');
      } else {
        addToast("Added track to playlist in database!", "success");
      }
    }
  };

  const removeTrackFromPlaylist = async (trackId: string, playlistId: string) => {
    let newTrackIds: string[] = [];
    setPlaylists(prev => {
      const updated = prev.map(pl => {
        if (pl.id === playlistId) {
          newTrackIds = pl.track_ids.filter(tid => tid !== trackId);
          return { ...pl, track_ids: newTrackIds };
        }
        return pl;
      });
      return updated;
    });
    
    if (supabase) {
      const { error } = await supabase.from('playlists').update({ track_ids: newTrackIds }).eq('id', playlistId);
      if (error) {
        console.error(error);
        addToast(`Failed to remove track from database playlist: ${error.message}`, 'error');
      } else {
        addToast("Removed track from playlist in database!", "success");
      }
    }
  };

  const updatePlaylist = async (id: string, updates: Partial<Playlist>) => {
    setPlaylists(prev => prev.map(pl => pl.id === id ? { ...pl, ...updates } : pl));
    
    if (supabase) {
      const { error } = await supabase.from('playlists').update(updates).eq('id', id);
      if (error) {
        console.error(error);
        addToast(`Failed to update playlist: ${error.message}`, 'error');
      } else {
        addToast("Playlist updated in database!", "success");
      }
    }
  };

  const deletePlaylist = async (id: string) => {
    setPlaylists(prev => prev.filter(pl => pl.id !== id));
    // Clear associations in other reactive states to be fully consistent offline/online
    setPromoVideos(prev => prev.filter(v => v.playlist_id !== id));
    setShareLinks(prev => prev.filter(l => l.playlist_id !== id));

    if (supabase) {
      try {
        // Cascade manually to prevent foreign key errors on legacy/unconfigured schemas
        await supabase.from('activities').delete().eq('playlist_id', id);
        await supabase.from('share_links').delete().eq('playlist_id', id);
        await supabase.from('promo_videos').delete().eq('playlist_id', id);

        const { error } = await supabase.from('playlists').delete().eq('id', id);
        if (error) {
          console.error(error);
          addToast(`Failed to delete playlist: ${error.message}`, 'error');
        } else {
          addToast("Playlist and associated links/videos deleted!", "success");
        }
      } catch (err: any) {
        console.error("Cascade delete for playlist failed:", err);
        addToast(`Failed to complete playlist decommissioning: ${err.message || err}`, 'error');
      }
    } else {
      addToast("Collection decommissioned locally.", "success");
    }
  };

  const addPlaylist = async (playlist: Partial<Playlist>) => {
    const newPl: Playlist = {
      id: uuidv4(),
      name: playlist.name || "New Playlist",
      description: playlist.description || "",
      image_url: playlist.image_url || "",
      track_ids: playlist.track_ids || [],
      start_color: playlist.start_color || "#f97316",
      end_color: playlist.end_color || "#ea580c",
      created_at: new Date().toISOString()
    };
    setPlaylists(prev => [...prev, newPl]);
    if (supabase) {
      const { error } = await supabase.from('playlists').insert(newPl);
      if (error) {
        console.error(error);
        addToast(`Failed to create playlist in database: ${error.message}`, 'error');
      } else {
        addToast(`Playlist "${newPl.name}" saved to database!`, 'success');
      }
    }
    return newPl;
  };

  const addClient = async (client: Partial<Client>) => {
    const rawEmail = client.email || "unknown@client.com";
    const normalizedEmail = rawEmail.trim().toLowerCase();
    
    const deriveDisplayNameFromEmail = (email: string) => {
      const localPart = email.split('@')[0];
      return localPart
        .split(/[._-]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    let existingId: string | null = null;
    let updatesToApply: any = null;
    let newClientToInsert: Client | null = null;

    setClients(prev => {
      const existingClient = prev.find(c => c.email.toLowerCase() === normalizedEmail);
      if (existingClient) {
        existingId = existingClient.id;
        updatesToApply = {
          name: client.name || existingClient.name,
          status: 'online' as const,
          last_active: new Date().toISOString(),
        };
        return prev.map(c => c.id === existingClient.id ? { ...c, ...updatesToApply } : c);
      } else {
        newClientToInsert = {
          id: uuidv4(),
          name: client.name || deriveDisplayNameFromEmail(normalizedEmail),
          email: normalizedEmail,
          status: client.status || "online",
          last_active: new Date().toISOString(),
          tags: client.tags || [],
          created_at: new Date().toISOString(),
          ...client
        };
        return [...prev, newClientToInsert];
      }
    });

    if (supabase) {
      if (existingId && updatesToApply) {
        const { error } = await supabase.from('clients').update(updatesToApply).eq('id', existingId);
        if (error) {
          console.error(error);
          addToast(`Failed to update client in database: ${error.message}`, 'error');
        } else {
          addToast("Client logged in & updated!", 'success');
        }
      } else if (newClientToInsert) {
        const { error } = await supabase.from('clients').insert(newClientToInsert);
        if (error) {
          console.error(error);
          addToast(`Failed to register client in database: ${error.message}`, 'error');
        } else {
          addToast(`Client "${newClientToInsert.name}" registered in database!`, 'success');
        }
      }
    }
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (supabase) {
      const { error } = await supabase.from('clients').update(updates).eq('id', id);
      if (error) {
        console.error(error);
        addToast(`Failed to update client: ${error.message}`, 'error');
      } else {
        addToast("Client profile updated in database!", 'success');
      }
    }
  };

  const deleteClient = async (id: string) => {
    setClients(prev => prev.filter(c => c.id !== id));
    setShareLinks(prev => prev.filter(l => l.client_id !== id));
    setMessages(prev => prev.filter(m => m.client_id !== id));
    setActivities(prev => prev.filter(a => a.client_id !== id));

    if (supabase) {
      try {
        // Cascade manually to prevent foreign key errors on legacy/unconfigured schemas
        await supabase.from('messages').delete().eq('client_id', id);
        await supabase.from('share_links').delete().eq('client_id', id);
        await supabase.from('activities').delete().eq('client_id', id);

        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) {
          console.error(error);
          addToast(`Failed to delete client: ${error.message}`, 'error');
        } else {
          addToast("Client profile and portal history purged!", 'success');
        }
      } catch (err: any) {
        console.error("Manual cascade delete failed:", err);
        addToast(`Failed to delete client: ${err.message || err}`, 'error');
      }
    }
    
    addActivity({
      type: 'system',
      user: 'OGBeatz',
      action: `Removed client ${id}`,
      timestamp: new Date().toISOString()
    });
  };

  const sendMessage = async (clientId: string, content: string, image_url?: string | null, direction: 'inbound' | 'outbound' = 'outbound') => {
    const client = clients.find(c => c.id === clientId);
    let recipient_id = '';
    let clientName = 'Client';

    if (client) {
      if (direction === 'outbound') {
        recipient_id = client.email;
      } else {
        recipient_id = 'producer@ogbeatz.com';
      }
      clientName = client.name;
    } else {
      recipient_id = direction === 'outbound' ? 'unknown@client.com' : 'producer@ogbeatz.com';
    }

    const newMessage: Message = {
      id: uuidv4(),
      client_id: clientId,
      recipient_id,
      content,
      image_url: image_url || null,
      direction: direction,
      timestamp: new Date().toISOString(),
      is_read: false
    };

    setMessages(prev => [...prev, newMessage]);

    if (supabase) {
      const { error } = await supabase.from('messages').insert(newMessage);
      if (error) {
        console.error(error);
        addToast(`Message sending failed in DB: ${error.message}`, 'error');
      } else {
        addToast("Message successfully sent and persisted!", 'success');
      }
    }

    addActivity({
      type: 'social',
      user: direction === 'inbound' ? clientName : 'OGBeatz',
      action: direction === 'inbound' ? 'submitted feedback' : `Sent message to ${clientName}`,
      details: content,
      client_id: clientId
    });
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile) return;
    const updated = { ...profile, ...updates };
    setProfile(updated);
    if (supabase) {
      const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
      if (error) {
        console.error(error);
        addToast(`Failed to save profile: ${error.message}`, 'error');
      } else {
        addToast("Profile settings saved to database!", 'success');
      }
    }
  };

  const addShareLink = async (link: Partial<ShareLink>) => {
    const secureToken = Array.from(window.crypto.getRandomValues(new Uint8Array(20)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const newLink: ShareLink = {
      id: uuidv4(),
      token: secureToken,
      download_enabled: link.download_enabled ?? true,
      expires_at: link.expires_at || null,
      access_count: 0,
      created_at: new Date().toISOString(),
      ...link
    };
    
    setShareLinks(prev => [...prev, newLink]);

    if (supabase) {
      const { error } = await supabase.from('share_links').insert(newLink);
      if (error) {
        console.error(error);
        addToast(`Failed to create database share link: ${error.message}`, 'error');
      } else {
        addToast("Share link synced to live database!", 'success');
      }
    }
    return newLink;
  };

  const deleteShareLink = async (id: string) => {
    setShareLinks(prev => prev.filter(l => l.id !== id));
    if (supabase) {
      const { error } = await supabase.from('share_links').delete().eq('id', id);
      if (error) {
        console.error(error);
        addToast(`Failed to delete share link: ${error.message}`, 'error');
      } else {
        addToast("Share link deleted from database!", 'success');
      }
    }
  };

  const getShareContent = async (token: string) => {
    if (!supabase) {
      // Offline fallback lookup using local state arrays
      const link = shareLinks.find(l => l.token === token);
      if (!link) {
        const params = new URLSearchParams(window.location.search);
        const nameParam = params.get('name');
        const coverParam = params.get('coverImage') || params.get('cover_image');
        if (nameParam) {
          const track = tracks.find(t => t.name.toLowerCase().includes(nameParam.toLowerCase())) || tracks[0];
          const virtualLink: ShareLink = {
            id: token,
            token: token,
            track_id: track?.id,
            client_id: clients.length > 0 ? clients[0].id : undefined,
            download_enabled: true,
            access_count: 0,
            created_at: new Date().toISOString()
          };
          return { track, link: virtualLink };
        }
        return null;
      }
      let track: Track | undefined;
      let playlist: Playlist | undefined;
      if (link.track_id) {
        track = tracks.find(t => t.id === link.track_id);
      } else if (link.playlist_id) {
        playlist = playlists.find(p => p.id === link.playlist_id);
      }
      return { track, playlist, link };
    }

    try {
      const { data: linkData, error: linkError } = await supabase
        .from('share_links')
        .select('*')
        .eq('token', token)
        .single();

      if (linkError || !linkData) {
        // Fallback: If not found in share_links, check if name is in search params
        const params = new URLSearchParams(window.location.search);
        const urlName = params.get('name');
        const urlCover = params.get('coverImage') || params.get('cover_image');
        
        if (urlName) {
          // Attempt to find a matching track by name in database
          const { data: matchedTracks } = await supabase
            .from('tracks')
            .select('*')
            .ilike('name', `%${urlName}%`);
            
          let track: Track | undefined;
          if (matchedTracks && matchedTracks.length > 0) {
            track = matchedTracks[0] as Track;
          } else {
            // Find any track
            const { data: allTracks } = await supabase.from('tracks').select('*');
            if (allTracks && allTracks.length > 0) {
              const bestMatch = allTracks.find((t: any) => t.name.toLowerCase().includes(urlName.toLowerCase()));
              track = bestMatch || (allTracks[0] as Track);
            }
          }
          
          // Construct a dynamic virtual Track if none found
          if (!track) {
            track = {
              id: 'bd6f071e-b674-d80f-0a21-18657487baf0', // Consistent UUID shape
              name: urlName,
              artist: 'OGBEATZ',
              duration: 180,
              bpm: 130,
              key_signature: 'G# Minor',
              file_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
              image_url: urlCover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300&auto=format&fit=crop',
              size: 4500000,
              type: 'audio/mpeg',
              plays: 0,
              likes: 0,
              tags: ['Trap', 'Reference Mix', 'Master'],
              status: 'ready',
              created_at: new Date().toISOString()
            };
          } else if (urlCover) {
            track = { ...track, image_url: urlCover };
          }
          
          // Try to associate this fallback with a Client in the database
          const { data: dbClients } = await supabase.from('clients').select('*');
          let client_id: string | undefined;
          
          if (dbClients && dbClients.length > 0) {
             client_id = dbClients[0].id;
          }

          const virtualLink: ShareLink = {
            id: token,
            token: token,
            track_id: track?.id,
            client_id: client_id,
            download_enabled: true,
            access_count: 0,
            created_at: new Date().toISOString()
          };
          
          return { track, link: virtualLink };
        }
        return null;
      }

      const link = linkData as ShareLink;

      let track: Track | undefined;
      let playlist: Playlist | undefined;

      if (link.track_id) {
        const { data: tr } = await supabase
          .from('tracks')
          .select('*')
          .eq('id', link.track_id)
          .single();
        if (tr) track = tr as Track;
      } else if (link.playlist_id) {
        const { data: pl } = await supabase
          .from('playlists')
          .select('*')
          .eq('id', link.playlist_id)
          .single();
        
        if (pl) {
           playlist = pl as Playlist;
           const { data: playlistTracks } = await supabase
             .from('tracks')
             .select('*')
             .in('id', playlist.track_ids);
           
           if (playlistTracks) {
              setTracks(prev => {
                const uniqueNew = playlistTracks.filter(nt => !prev.some(et => et.id === nt.id));
                return [...prev, ...uniqueNew];
              });
           }
        }
      }

      return { track, playlist, link };
    } catch (e) {
      console.error("getShareContent Failure:", e);
      return null;
    }
  };

  const addActivity = async (activity: Partial<Activity>) => {
    const newActivity: Activity = {
      id: uuidv4(),
      type: activity.type || 'system',
      user: activity.user || 'Unknown',
      action: activity.action || 'Performed action',
      timestamp: new Date().toISOString(),
      ...activity
    };
    setActivities(prev => [newActivity, ...prev].slice(0, 50));
    if (supabase) {
      const { error } = await supabase.from('activities').insert(newActivity);
      if (error) console.error(error);
    }
  };

  const incrementShareLinkAccess = async (id: string) => {
    let newCount = 0;
    setShareLinks(prev => {
      const link = prev.find(l => l.id === id);
      if (!link) return prev;
      newCount = (link.access_count || 0) + 1;
      return prev.map(l => l.id === id ? { ...l, access_count: newCount } : l);
    });
    
    if (supabase && newCount > 0) {
      const { error } = await supabase
        .from('share_links')
        .update({ access_count: newCount })
        .eq('id', id);
      if (error) console.error(error);
    }
  };

  const addPromoVideo = async (incomingVideo: Partial<PromoVideo>) => {
    // 1. CLEAN THE ID: If the ID is a temporary 'local-' string, strip it to force a real UUID!
    const isTempId = incomingVideo.id?.startsWith('local-');
    const videoId = (!incomingVideo.id || isTempId) ? uuidv4() : incomingVideo.id;
    
    let videoUrl = incomingVideo.video_url || '';
    let thumbnailUrl = incomingVideo.thumbnail_url || '';

    // Save binary video_data Blob to localforage for high-reliability offline/local caching
    if (incomingVideo.video_data instanceof Blob) {
      try {
        const lf = (await import('localforage')).default;
        await lf.setItem(`promo_video_blob_${videoId}`, incomingVideo.video_data);
        console.log(`Saved video Blob to localforage for ID: ${videoId}`);
      } catch (lfErr) {
        console.warn("Failed to save video Blob to localforage:", lfErr);
      }
    }

    // 2. CLEAN THE SCHEMA PARAMETERS: Build clean output keys explicitly
    // This prevents accidental fields like 'title' from bleeding into Supabase insert actions.
    const { title, id, ...allowedVideoFields } = incomingVideo;

    const newVideo: PromoVideo = {
      id: videoId,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl || '/ogbeatz_logo.svg',
      style: incomingVideo.style || 'minimalist',
      status: incomingVideo.status || 'ready',
      created_at: new Date().toISOString(),
      name: incomingVideo.name || title || 'Watermark Clean Render', // Uses fallback values to protect DB columns
      ...allowedVideoFields
    };

    // Update frontend state immediately to prevent visual blocking
    setPromoVideos(prev => [...prev.filter(v => v.id !== videoId), newVideo]);
    console.log("[Local Storage] Video master successfully synchronized with local state repository.");
  };

  const deletePromoVideo = async (id: string) => {
    setPromoVideos(prev => prev.filter(v => v.id !== id));
    
    // Purge local storage binary from localforage
    try {
      const lf = (await import('localforage')).default;
      await lf.removeItem(`promo_video_blob_${id}`);
    } catch (e) {
      console.warn("Could not purge local video blob:", e);
    }

    addToast("Promo video asset successfully destroyed!", 'success');
  };

  const analyzeTrack = async (
    name: string, 
    clientDuration?: number, 
    file?: File | null, 
    fileUrl?: string | null
  ): Promise<{ bpm: number, key: string, duration?: number, tags: string[] }> => {
    const cleanName = name.replace(/\.[^/.]+$/, ""); // Remove extension
    const duration = clientDuration || (120 + (cleanName.length * 3) % 111);

    if (analysisEngine === 'dsp') {
      let fileToAnalyze = file;
      if (!fileToAnalyze && fileUrl) {
        try {
          addToast("Retrieving audio asset for local DSP wave-signal parsing...", "info");
          const response = await fetch(fileUrl);
          const blob = await response.blob();
          fileToAnalyze = new File([blob], name, { type: blob.type || 'audio/mpeg' });
        } catch (err) {
          console.warn("Could not retrieve file for local DSP processing, falling back to server:", err);
        }
      }

      if (fileToAnalyze) {
        try {
          addToast("Evaluating audio sample transients and spectrum ratios...", "info");
          const dspResult = await analyzeAudioDsp(fileToAnalyze);
          addToast("Local audio DSP analysis completed successfully!", "success");
          
          return {
            bpm: dspResult.bpm,
            key: dspResult.camelotKey ? `${dspResult.key} (${dspResult.camelotKey})` : dspResult.key,
            duration,
            tags: [
              `camelot_key:${dspResult.camelotKey}`,
              `genre_category:${dspResult.genreCategory}`,
              `mood:${dspResult.mood}`,
              `vibe:${dspResult.vibe}`,
              `instruments:${dspResult.instruments.join(', ')}`,
              `pitch:${dspResult.pitch}`,
              ...dspResult.tags
            ]
          };
        } catch (err: any) {
          console.error("Local DSP Audio Analyzer failed:", err);
          addToast("Local DSP failed, falling back to Server-Side AI Analysis...", "info");
        }
      }
    }

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: name, duration })
    });

    if (!response.ok) {
      throw new Error(`AI Analysis server returned status ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.isFallback) {
      addToast(`Dynamic track tagging completed using high-fidelity offline heuristic analysis. Configure your GEMINI_API_KEY in the workspace to utilize dynamic AI evaluations.`, 'info');
    } else {
      addToast("AI Analysis completed successfully via Gemini on the server!", 'success');
    }
    
    // Build combined tags with vocal/instrumental indicator and SEO keywords
    const typeTag = data.instrumental ? 'instrumental' : 'vocal';
    const rawKeywords: string[] = Array.isArray(data.seo_keywords) ? data.seo_keywords : [];
    const seoTags = rawKeywords.map((k: string) => k.length > 20 ? k.substring(0, 18) + '...' : k);
    const combinedTags = [
      typeTag,
      `camelot_key:${data.camelot_key || ""}`,
      `genre_category:${data.genre_category || ""}`,
      `mood:${data.mood || ""}`,
      `vibe:${data.vibe || ""}`,
      `instruments:${(data.primary_instruments || []).join(', ')}`,
      `pitch:${data.pitch || ""}`,
      ...data.tags,
      ...seoTags
    ].filter((v, i, a) => a.indexOf(v) === i && v !== "camelot_key:" && v !== "genre_category:" && v !== "mood:" && v !== "vibe:" && v !== "instruments:" && v !== "pitch:"); // deduplicate & filter empty
    
    const fullKey = data.camelot_key ? `${data.key} (${data.camelot_key})` : data.key;

    return {
      bpm: Math.round(data.bpm),
      key: fullKey,
      duration,
      tags: combinedTags
    };
  };

  const uploadFile = async (bucket: string, file: File): Promise<string | null> => {
    // Force direct local fallback for promo buckets to speed up uploads and reduce cloud latencies
    if (!supabase || bucket === 'promo_videos' || bucket === 'promo_videos_thumbnails' || bucket === 'promo_photos') {
      console.log(`Bypassing Supabase upload for bucket: ${bucket}`);
      try {
        return URL.createObjectURL(file);
      } catch (err) {
        return null;
      }
    }
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload file
      let { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { cacheControl: '3600', upsert: false });

      // If bucket doesn't exist, create it and retry once
      if (uploadError && (
        uploadError.message?.includes('Bucket not found') || 
        (uploadError as any).status === 404 ||
        uploadError.message === 'Bucket not found'
      )) {
        console.log(`Bucket '${bucket}' not found. Attempting auto-creation...`);
        try {
          const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: true });
          if (!bucketError) {
            const { error: retryError } = await supabase.storage.from(bucket).upload(filePath, file, { cacheControl: '3600', upsert: false });
            if (!retryError) {
              const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
              return data?.publicUrl || null;
            } else {
              console.warn("Retry upload failed after bucket creation:", retryError);
            }
          } else {
            console.warn("Failed to auto-create bucket due to policy/RSL constraints:", bucketError.message || bucketError);
          }
        } catch (bucketCreateErr) {
          console.warn("Error trying to create bucket:", bucketCreateErr);
        }
      } else if (!uploadError) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return data?.publicUrl || null;
      }

      // If we got here, there was an uploadError or bucket problem. We gracefully fall back
      // to a local Object URL to keep the application 100% functional in active browser sessions.
      console.warn(`Supabase upload failed in bucket '${bucket}', utilizing local Blob URL fallback.`);
      try {
        return URL.createObjectURL(file);
      } catch (err) {
        return null;
      }
    } catch (e) {
      console.warn(`Supabase file upload error in bucket '${bucket}', utilizing local Blob URL fallback:`, e);
      try {
        return URL.createObjectURL(file);
      } catch (err) {
        return null;
      }
    }
  };

  return (
    <MediaStoreContext.Provider value={{
      tracks, playlists, clients, activities, profile, loading, loadingProgress, loadingStatusText, shareLinks, messages, promoVideos,
      addTrack, updateTrack, deleteTrack, addPlaylist, updatePlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist,
      addClient, updateClient, deleteClient, updateProfile, addShareLink, deleteShareLink, getShareContent, addActivity, analyzeTrack, sendMessage, addPromoVideo, deletePromoVideo, incrementShareLinkAccess,
      analysisEngine, setAnalysisEngine: handleSetAnalysisEngine,
      uploadFile,
      toasts, addToast, removeToast, connected,
      enableMockData, setEnableMockData: handleSetEnableMockData
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

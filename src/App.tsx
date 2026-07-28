import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Filter,
  Play,
  Music,
  Activity as ActivityIcon,
  MessageSquare,
  Mail,
  Zap,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Download,
  Share2,
  Users,
  LayoutDashboard,
  Bell,
  User,
  ArrowUpRight,
  Settings,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Lock,
  ThumbsUp,
  ThumbsDown,
  Paperclip,
  Send,
  X,
  Trash2,
  Edit3,
  Video,
  AlertCircle,
  Eye,
  LayoutGrid,
  List,
  Table,
  BarChart3,
  GripVertical,
  Sun,
  Moon,
  Upload,
  UserPlus,
  FileArchive,
  Calendar,
  VolumeX,
  Pause,
  Volume2,
  Cpu,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { useMediaStore } from "./context/MediaStoreContext";
import { useAudio } from "./context/AudioContext";
import Shell from "./components/Shell";
import AudioPlayer from "./components/AudioPlayer";
import UploadZone from "./components/UploadZone";
import TrackOptionsMenu from "./components/TrackOptionsMenu";
import PromoPackModal from "./components/PromoPackModal";
import EditTrackModal from "./components/EditTrackModal";
import EditPlaylistModal from "./components/EditPlaylistModal";
import AddTrackToPlaylistModal from "./components/AddTrackToPlaylistModal";
import AddClientModal from "./components/AddClientModal";
import EditClientModal from "./components/EditClientModal";
import VideoPreviewModal from "./components/VideoPreviewModal";
import UploadVideoModal from "./components/UploadVideoModal";
import SharePortal from "./components/SharePortal";
import ClientPortal from "./components/ClientPortal";
import ShareModal from "./components/ShareModal";
import TrackDetailsModal from "./components/TrackDetailsModal";
import YouTubeHub from "./components/YouTubeHub";
import ReleasesHub from "./components/ReleasesHub";
import ExportMasterModal from "./components/ExportMasterModal";
import AudioAnalyzerStudio from "./components/AudioAnalyzerStudio";
import MusicVideoMaker from "./components/MusicVideoMaker";
import VoiceAssistant from "./components/VoiceAssistant";
import { Track, ShareLink, Client, Playlist } from "./types";
import { cn } from "./lib/utils";
import { getSupabaseClient, supabaseUrl } from "./lib/supabase";
import JSZip from "jszip";

// Helper to parse extended AI metadata from encoded tag keys
export const getTrackInfoFromTags = (tags: string[] | undefined | null) => {
  const info = {
    camelotKey: "",
    genreCategory: "",
    mood: "",
    vibe: "",
    instruments: "",
    pitch: "",
    cleanTags: [] as string[],
  };

  if (!tags || !Array.isArray(tags)) return info;

  tags.forEach((tag) => {
    if (!tag) return;
    if (tag.startsWith("camelot_key:")) {
      info.camelotKey = tag.replace("camelot_key:", "").trim();
    } else if (tag.startsWith("genre_category:")) {
      info.genreCategory = tag.replace("genre_category:", "").trim();
    } else if (tag.startsWith("mood:")) {
      info.mood = tag.replace("mood:", "").trim();
    } else if (tag.startsWith("vibe:")) {
      info.vibe = tag.replace("vibe:", "").trim();
    } else if (tag.startsWith("instruments:")) {
      info.instruments = tag.replace("instruments:", "").trim();
    } else if (tag.startsWith("pitch:")) {
      info.pitch = tag.replace("pitch:", "").trim();
    } else {
      info.cleanTags.push(tag);
    }
  });

  return info;
};

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (
      (localStorage.getItem("ogbeatz-theme") as "dark" | "light") || "dark"
    );
  });
  const [chartTimeframe, setChartTimeframe] = useState<"7d" | "30d">("7d");

  useEffect(() => {
    localStorage.setItem("ogbeatz-theme", theme);
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("theme-light");
    } else {
      root.classList.remove("theme-light");
    }
  }, [theme]);

  const [activeView, setActiveView] = useState<
    | "dashboard"
    | "tracks"
    | "playlists"
    | "clients"
    | "messages"
    | "sharing"
    | "activity"
    | "settings"
    | "profile"
    | "client-detail"
    | "videos"
    | "youtube"
    | "analyzer"
  >("dashboard");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedMessageClientId, setSelectedMessageClientId] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [trackListViewMode, setTrackListViewMode] = useState<
    "cards" | "columns" | "list"
  >("cards");
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [batchGenre, setBatchGenre] = useState("");
  const [batchMood, setBatchMood] = useState("");
  const [batchCustomTags, setBatchCustomTags] = useState("");
  const [batchMode, setBatchMode] = useState<"append" | "overwrite">("append");
  const [sortBy, setSortBy] = useState<"date_added" | "name" | "bpm">("date_added");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedTrackIds, setExpandedTrackIds] = useState<string[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedTrackForPromo, setSelectedTrackForPromo] =
    useState<Track | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [viewingTrackDetails, setViewingTrackDetails] = useState<Track | null>(
    null,
  );
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [videoSubTab, setVideoSubTab] = useState<"maker" | "archive">("maker");
  const [selectedTrackForVideo, setSelectedTrackForVideo] =
    useState<Track | null>(null);
  const [selectedPlaylistForVideo, setSelectedPlaylistForVideo] =
    useState<Playlist | null>(null);
  const [selectedVideoForPreview, setSelectedVideoForPreview] = useState<
    any | null
  >(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showUploadVideo, setShowUploadVideo] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [clientPortalUser, setClientPortalUser] = useState<Client | null>(null);
  const [sharingAsset, setSharingAsset] = useState<{
    track?: Track;
    playlist?: Playlist;
  } | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [clientMessageDraft, setClientMessageDraft] = useState("");
  const [zipNotesDraft, setZipNotesDraft] = useState("");
  const [activitySearchText, setActivitySearchText] = useState("");
  const [chatAttachment, setChatAttachment] = useState<string | null>(null);
  const [asyncSharedContent, setAsyncSharedContent] = useState<{
    track?: Track;
    playlist?: Playlist;
    link: ShareLink;
  } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<{
    status: "idle" | "checking" | "success" | "error";
    message?: string;
    url?: string;
  } | null>(null);
  const [inspectedTables, setInspectedTables] = useState<any[] | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectingError, setInspectingError] = useState<string | null>(null);
  const [customTableInput, setCustomTableInput] = useState("");

  const runDatabaseInspection = async (extraTableToProbe?: any) => {
    setInspecting(true);
    setInspectingError(null);
    try {
      const dbClient = await getSupabaseClient();
      if (!dbClient) {
        setInspectingError("No active Supabase connection.");
        return;
      }

      const targetQuery =
        typeof extraTableToProbe === "string"
          ? extraTableToProbe.trim()
          : customTableInput.trim();

      const candidates = new Set([
        "tracks",
        "playlists",
        "clients",
        "share_links",
        "messages",
        "profiles",
        "activities",
        "promo_videos",
      ]);

      if (targetQuery) {
        candidates.add(targetQuery);
      }

      const tables: any[] = [];

      for (const tableName of Array.from(candidates)) {
        try {
          const { data, count, error } = await dbClient
            .from(tableName)
            .select("*", { count: "exact" })
            .limit(3);

          if (
            error &&
            (error.code === "42P01" ||
              error.message?.includes("does not exist"))
          ) {
            continue; // skip tables that don't exist
          }

          let queryError = null;
          if (error) {
            queryError = error.message;
          }

          const columns: any[] = [];
          if (data && data.length > 0) {
            Object.keys(data[0]).forEach((key) => {
              columns.push({
                name: key,
                type: typeof data[0][key],
                description: "Discovered dynamically",
              });
            });
          } else {
            columns.push({
              name: "id",
              type: "id/uuid",
              description: "Discovered field",
            });
          }

          tables.push({
            tableName,
            columnCount: columns.length,
            columns,
            rowCount: count !== null ? count : data ? data.length : 0,
            sampleRows: data || [],
            error: queryError,
          });
        } catch (err) {
          // ignore
        }
      }

      setInspectedTables(tables);
    } catch (e: any) {
      setInspectingError(e.message || "Failed to inspect database tables.");
    } finally {
      setInspecting(false);
    }
  };

  const checkDatabase = async () => {
    setDbStatus({ status: "checking" });
    try {
      const dbClient = await getSupabaseClient();
      if (!dbClient) {
        setDbStatus({
          status: "error",
          message: "No active Supabase connection. Verify settings.",
        });
        return;
      }

      const { error } = await dbClient.from("tracks").select("id").limit(1);

      if (error) {
        setDbStatus({
          status: "error",
          message: `Connection established, but verification query failed: ${error.message}`,
          url: supabaseUrl,
        });
      } else {
        setDbStatus({
          status: "success",
          message:
            "Successfully established direct, secure client-to-database live telemetry link. Schema is ready.",
          url: supabaseUrl,
        });
        setTimeout(() => setDbStatus(null), 5000);
      }
    } catch (e: any) {
      setDbStatus({
        status: "error",
        message: e.message || "Direct database sync error.",
      });
    }
  };

  // Run database status check and schema inspection automatically on mounting or settings view
  useEffect(() => {
    checkDatabase();
    runDatabaseInspection();
  }, []);

  // Handle Pollinations BYOP (Bring Your Own Pollen) OAuth redirect fragment on mount
  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (hash && hash.includes("api_key=")) {
        const params = new URLSearchParams(hash.slice(1));
        const apiKey = params.get("api_key");
        if (apiKey) {
          localStorage.setItem("POLLINATIONS_USER_KEY", apiKey);
          
          if (window.opener) {
            try {
              window.opener.postMessage({ type: "POLLINATIONS_AUTH_SUCCESS", apiKey }, "*");
            } catch (err) {
              console.warn("window.opener message error:", err);
            }
            window.close();
            return;
          }
          
          addToast("Successfully linked your custom Pollinations account!", "success");
          window.location.hash = "";
        }
      }
    } catch (e) {
      console.warn("Failed to parse Pollinations OAuth fragment:", e);
    }
  }, []);

  useEffect(() => {
    if (activeView === "settings") {
      runDatabaseInspection();
    }
  }, [activeView]);

  useEffect(() => {
    const handleVoiceCommand = (e: Event) => {
      const customEvent = e as CustomEvent;
      const action = customEvent.detail?.action;
      if (action === 'create-playlist') {
        setActiveView('playlists');
        setShowCreatePlaylist(true);
      } else if (action === 'create-video') {
        setActiveView('videos');
        setVideoSubTab('maker');
      } else if (action === 'select-playlist') {
        const playlistId = customEvent.detail?.playlistId;
        if (playlistId) {
          setActiveView('playlists');
          setSelectedPlaylistId(playlistId);
        }
      }
    };
    window.addEventListener('ai-voice-command', handleVoiceCommand);
    return () => {
      window.removeEventListener('ai-voice-command', handleVoiceCommand);
    };
  }, []);

  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [showAddTracksToPlaylist, setShowAddTracksToPlaylist] = useState(false);

  const {
    tracks,
    playlists,
    clients,
    activities,
    messages,
    profile,
    loading,
    loadingProgress,
    loadingStatusText,
    shareLinks,
    promoVideos,
    deleteTrack,
    deletePromoVideo,
    updateTrack,
    addPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    addClient,
    updateClient,
    deleteClient,
    updateProfile,
    addShareLink,
    deleteShareLink,
    addActivity,
    sendMessage,
    incrementShareLinkAccess,
    getShareContent,
    uploadFile,
    analyzeTrack,
    analysisEngine,
    setAnalysisEngine,
    toasts,
    addToast,
    removeToast,
    enableMockData,
    setEnableMockData,
  } = useMediaStore();
  const hasIncrementedRef = React.useRef<string | null>(null);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId],
  );

  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportFormat, setExportFormat] = useState<'MP3' | 'WAV' | 'FLAC'>(() => {
    const saved = localStorage.getItem('ogbeatz_preferred_export_format');
    if (saved === 'MP3' || saved === 'WAV' || saved === 'FLAC') {
      return saved as 'MP3' | 'WAV' | 'FLAC';
    }
    return 'MP3';
  });
  const [showExportModal, setShowExportModal] = useState(false);

  const handleUpdateExportFormat = (fmt: 'MP3' | 'WAV' | 'FLAC') => {
    setExportFormat(fmt);
    localStorage.setItem('ogbeatz_preferred_export_format', fmt);
  };

  const fetchWithProxyFallback = async (url: string): Promise<Blob> => {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.blob();
      }
      throw new Error(`Direct fetch returned status ${res.status}`);
    } catch (err) {
      console.warn(`Direct fetch failed for ${url}, trying proxy fallback:`, err);
      const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        return await res.blob();
      }
      throw new Error(`Proxy fetch failed for ${url} (status ${res.status})`);
    }
  };

  const handleExportTracksZip = async (
    format: 'MP3' | 'WAV' | 'FLAC' = exportFormat,
    customPrefix: string = "",
    usePlaylistOnly: boolean = false
  ) => {
    const targetTracks = usePlaylistOnly && selectedPlaylist
      ? playlistTracks
      : tracks;

    if (targetTracks.length === 0) {
      addToast("No tracks in your library to export.", "error");
      return;
    }

    try {
      setIsExportingZip(true);
      addToast(`Initializing secure bundle compiler (${format})...`, "info");

      const zip = new JSZip();

      // Create a Catalog index file
      let catalog = `================================================================================
          OGBEATZ MASTER STUDIO - EXPORT CATALOG SUMMARY
          Generated On: ${new Date().toLocaleString()}
          Target Audio Format: ${format} (Studio High-Fidelity)
          Total Tracks: ${targetTracks.length}
================================================================================\n\n`;

      catalog += String("").padEnd(80, "-") + "\n";
      catalog += `${"NAME".padEnd(30)} | ${"BPM".padEnd(5)} | ${"KEY".padEnd(10)} | ${"DURATION".padEnd(8)} | ${"PLAYS".padEnd(6)} | ${"LIKES".padEnd(6)}\n`;
      catalog += String("").padEnd(80, "-") + "\n";

      targetTracks.forEach((track) => {
        const durMin = Math.floor(track.duration / 60);
        const durSec = Math.floor(track.duration % 60).toString().padStart(2, "0");
        const formattedDur = `${durMin}:${durSec}`;

        catalog += `${(track.name || "Untitled").substring(0, 30).padEnd(30)} | ${(track.bpm || "N/A").toString().padEnd(5)} | ${(track.key_signature || "N/A").substring(0, 10).padEnd(10)} | ${formattedDur.padEnd(8)} | ${(track.plays || 0).toString().padEnd(6)} | ${(track.likes || 0).toString().padEnd(6)}\n`;
      });

      catalog += String("").padEnd(80, "-") + "\n";
      catalog += `\n* Thank you for using OGBeatz. Keep 'Em Thirsty!\n`;

      zip.file("MASTER_CATALOG.txt", catalog);

      // Create separate folders and files for each track
      for (const track of targetTracks) {
        const folderName = (track.name || "Untitled_Track").replace(/[/\\?%*:|"<>\s]/g, "_");
        const trackFolder = zip.folder(folderName);

        if (trackFolder) {
          // 1. Generate full track_sheet.txt
          const parsedTags = getTrackInfoFromTags(track.tags);
          const activeTags = track.tags || [];
          
          let durMin = Math.floor(track.duration / 60);
          let durSec = Math.floor(track.duration % 60).toString().padStart(2, "0");

          // Format clean duration string
          const realDur = `${durMin}:${durSec}`;

          let formatEncoding = "MPEG-1 Audio Layer III (320kbps)";
          let formatExt = "mp3";
          let sizeMultiplier = 1;
          if (format === "WAV") {
            formatEncoding = "Uncompressed Linear PCM (24-bit / 48kHz)";
            formatExt = "wav";
            sizeMultiplier = 5.2;
          } else if (format === "FLAC") {
            formatEncoding = "Free Lossless Audio Codec (Level 5 / 24-bit)";
            formatExt = "flac";
            sizeMultiplier = 3.1;
          }

          const finalSize = track.size ? track.size * sizeMultiplier : 4700000 * sizeMultiplier;

          let trackSheet = `================================================================================
              OFFICIAL STUDIO MASTER SHEET: ${track.name.toUpperCase()}
================================================================================
STUDIO PROFILE:
--------------------------------------------------------------------------------
Track Name:      ${track.name}
Artist / Producer: ${track.artist || "OGBeatz"}
Target Format:   ${format}
Bitrate/Encoding: ${formatEncoding}
Track Size (Est): ${(finalSize / (1024 * 1024)).toFixed(2)} MB
Original Format: ${track.type || "audio/mpeg"}
Plays Count:     ${track.plays || 0}
Likes Count:     ${track.likes || 0}
Upload Date:     ${track.created_at ? new Date(track.created_at).toLocaleString() : "N/A"}

ANALYTICAL METRICS:
--------------------------------------------------------------------------------
BPM (Tempo):     ${track.bpm || "N/A"}
Key Signature:   ${track.key_signature || "N/A"}
Duration:        ${realDur} (${track.duration} seconds)
Primary Genre:   ${parsedTags.genreCategory || "N/A"}
Vocal/Inst type: ${activeTags.includes("Instrumental") ? "Instrumental" : "Vocal Track"}
Emotional Mood:  ${parsedTags.mood || "N/A"}
Auditory Vibe:   ${parsedTags.vibe || "N/A"}
Instruments:     ${parsedTags.instruments || "N/A"}

DISTRIBUTION ASSETS:
--------------------------------------------------------------------------------
Streaming Master URL:   ${track.file_url || "N/A"}
Artwork Canvas URL:     ${track.image_url || "N/A"}

TRACK DESCRIPTION / MARKETING PITCH:
--------------------------------------------------------------------------------
${parsedTags.pitch || "No additional description parsed."}

TAG INDEX:
--------------------------------------------------------------------------------
${activeTags.join(", ")}

================================================================================
Generated via OGBeatz Mastering Suite - Copyright 2026. All rights Reserved.
================================================================================\n`;

          trackFolder.file("track_sheet.txt", trackSheet);

          // 2. Generate lyrics files (timestamped + plain)
          const rawLyrics = track.lyrics || "";
          
          // Timestamped text
          trackFolder.file("lyrics.lrc", rawLyrics || "[00:00.00] No lyrics loaded/provided for this master. You can paste timestamped lyric scripts using the track editor.");

          // Plain text (strip LRC styled brackets like: [01:23.45], [02:00], etc.)
          const plainLyrics = rawLyrics
            ? rawLyrics.replace(/\[\d{1,2}:\d{2}(\.\d{1,3})?\]/g, "").replace(/^\s+/gm, "")
            : "No lyrics available.";
          
          trackFolder.file("lyrics_plain.txt", plainLyrics);

          // 3. Fetch and Append Audio file
          const sanitizedAudioName = `${(track.name || "Untitled").replace(/[/\\?%*:|"<>\s]/g, "_")}.${formatExt}`;
          if (track.file_data) {
            trackFolder.file(sanitizedAudioName, track.file_data);
          } else if (track.file_url) {
            try {
              const audioBlob = await fetchWithProxyFallback(track.file_url);
              trackFolder.file(sanitizedAudioName, audioBlob);
            } catch (err) {
              console.warn(`Could not bundle audio for track ${track.name}:`, err);
            }
          }

          // 4. Fetch Artwork and Append if Available
          let artBlob: Blob | null = null;
          if (track.image_data) {
            artBlob = track.image_data;
          } else if (track.image_url) {
            try {
              artBlob = await fetchWithProxyFallback(track.image_url);
            } catch (err) {
              console.warn(`Could not fetch artwork for track ${track.name}:`, err);
            }
          }

          if (artBlob) {
            let artExt = "png";
            const cType = artBlob.type;
            if (cType) {
              if (cType.includes("jpeg") || cType.includes("jpg")) {
                artExt = "jpg";
              } else if (cType.includes("webp")) {
                artExt = "webp";
              } else if (cType.includes("gif")) {
                artExt = "gif";
              }
            } else if (track.image_url) {
              const lower = track.image_url.toLowerCase();
              if (lower.includes(".jpg") || lower.includes(".jpeg")) {
                artExt = "jpg";
              } else if (lower.includes(".webp")) {
                artExt = "webp";
              } else if (lower.includes(".gif")) {
                artExt = "gif";
              }
            }
            trackFolder.file(`artwork.${artExt}`, artBlob);
          }
        }
      }

      addToast(`Compressing ${format} master catalogs and LRC scripts...`, "info");
      const content = await zip.generateAsync({ type: "blob" });
      
      const dateStr = new Date().toISOString().slice(0, 10);
      let basePrefix = "ogbeatz_masters";
      if (customPrefix && customPrefix.trim()) {
        basePrefix = customPrefix.trim().replace(/[/\\?%*:|"<>\s]/g, "_");
      } else if (usePlaylistOnly && selectedPlaylist) {
        basePrefix = selectedPlaylist.name.toLowerCase().replace(/[/\\?%*:|"<>\s]/g, "_");
      }
      
      const outputFilename = `${basePrefix}_${format.toLowerCase()}_export_${dateStr}.zip`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = outputFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast(`Studio Master Catalog (${format}) exported successfully as ZIP!`, "success");
    } catch (error: any) {
      console.error("ZIP Generation failed:", error);
      addToast(`Creation of library ZIP failed: ${error.message || error}`, "error");
    } finally {
      setIsExportingZip(false);
    }
  };

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const playlistTracks = useMemo(() => {
    if (!selectedPlaylist || !selectedPlaylist.track_ids) return [];
    return selectedPlaylist.track_ids
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is Track => t !== undefined);
  }, [selectedPlaylist, tracks]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData("text/plain");
    const sourceIndex = parseInt(sourceIndexStr, 10);

    setDraggedIndex(null);
    setDragOverIndex(null);

    if (isNaN(sourceIndex) || sourceIndex === targetIndex || !selectedPlaylist)
      return;

    const trackIds = [...(selectedPlaylist.track_ids || [])];
    const [draggedId] = trackIds.splice(sourceIndex, 1);
    trackIds.splice(targetIndex, 0, draggedId);

    try {
      await updatePlaylist(selectedPlaylist.id, { track_ids: trackIds });
      addActivity({
        type: "system",
        user: "OGBeatz",
        action: "Reordered compilation tracks",
        target: selectedPlaylist.name,
      });
    } catch (err) {
      console.error("Reorder failed:", err);
    }
  };

  const { stop, playTrack, activeTrack } = useAudio();

  // Fetch Shared Content for Anon Users
  useEffect(() => {
    if (shareToken && !loading) {
      const fetchShared = async () => {
        const content = await getShareContent(shareToken);
        if (content) {
          setAsyncSharedContent(content);
        } else {
          setShareError("Invalid or unauthorized share token.");
        }
      };
      fetchShared();
    }
  }, [shareToken, loading, getShareContent]);

  // Analytics Logic
  const stats = useMemo(() => {
    const totalPlays = tracks.reduce((acc, t) => acc + (t.plays || 0), 0);
    const totalLikes = tracks.reduce((acc, t) => acc + (t.likes || 0), 0);
    
    // Engagement count includes track likes plus interaction events from activities
    const activityEngagements = activities.filter(act => 
      ["download", "share", "social", "message", "upload", "comment"].includes(act.type)
    ).length;
    const totalEngagementCount = totalLikes + activityEngagements;
    const engagementRate = totalPlays > 0 ? (totalEngagementCount / totalPlays) * 100 : 0;

    return {
      totalTracks: tracks.length,
      activeClients: clients.length,
      totalPlays,
      totalEngagementCount,
      engagementRate: engagementRate.toFixed(1) + "%",
    };
  }, [tracks, clients, activities]);

  const chartData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const limitDays = chartTimeframe === "30d" ? 30 : 7;

    // Generate the last N days dynamically ending today
    const rangeDays = Array.from({ length: limitDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - ((limitDays - 1) - i));

      let nameStr = "";
      if (limitDays === 7) {
        nameStr = days[d.getDay()];
      } else {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        nameStr = `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
      }

      return {
        name: nameStr,
        dateStr: d.toDateString(),
        plays: 0,
        engagement: 0,
      };
    });

    // Populate data dynamically from active logs
    activities.forEach((act) => {
      if (!act.timestamp) return;
      const actDateStr = new Date(act.timestamp).toDateString();
      const match = rangeDays.find((day) => day.dateStr === actDateStr);
      if (match) {
        if (act.type === "play") {
          match.plays += 1;
        } else if (["download", "share", "social", "message", "upload"].includes(act.type)) {
          match.engagement += 1;
        }
      }
    });

    return rangeDays.map(({ name, plays, engagement }) => ({
      name,
      plays,
      engagement,
    }));
  }, [activities, chartTimeframe]);

  const filteredClients = useMemo(() => {
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
        c.company?.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
        (c.tags || []).some((t) =>
          t.toLowerCase().includes(clientSearchQuery.toLowerCase()),
        ),
    );
  }, [clients, clientSearchQuery]);

  const filteredTracks = useMemo(() => {
    const filtered = tracks.filter((t) => {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date_added") {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        comparison = timeA - timeB;
      } else if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === "bpm") {
        const bpmA = typeof a.bpm === "number" ? a.bpm : 0;
        const bpmB = typeof b.bpm === "number" ? b.bpm : 0;
        comparison = bpmA - bpmB;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [tracks, searchQuery, sortBy, sortOrder]);

  const isAllTracksSelected = useMemo(() => {
    return (
      filteredTracks.length > 0 &&
      filteredTracks.every((t) => selectedTrackIds.includes(t.id))
    );
  }, [filteredTracks, selectedTrackIds]);

  const toggleSelectAllTracks = useCallback(() => {
    if (isAllTracksSelected) {
      setSelectedTrackIds((prev) =>
        prev.filter((id) => !filteredTracks.some((t) => t.id === id))
      );
    } else {
      setSelectedTrackIds((prev) => {
        const next = [...prev];
        filteredTracks.forEach((t) => {
          if (!next.includes(t.id)) {
            next.push(t.id);
          }
        });
        return next;
      });
    }
  }, [filteredTracks, isAllTracksSelected]);

  const handleBatchAssignTags = useCallback(
    async (newTags: string[], overwrite: boolean = false) => {
      if (selectedTrackIds.length === 0) return;
      const tagsToApply = newTags.filter((tag) => tag.trim().length > 0);
      if (tagsToApply.length === 0) {
        addToast("Please provide or select at least one tag to assign.", "info");
        return;
      }

      addToast(`Batch updating ${selectedTrackIds.length} track(s)...`, "info");
      try {
        let succeedCount = 0;
        for (const trackId of selectedTrackIds) {
          const tr = tracks.find((t) => t.id === trackId);
          if (tr) {
            let updatedTagsList: string[] = [];
            if (overwrite) {
              updatedTagsList = tagsToApply;
            } else {
              const existing = tr.tags || [];
              const merged = new Set([...existing, ...tagsToApply]);
              updatedTagsList = Array.from(merged);
            }
            await updateTrack(trackId, { tags: updatedTagsList });
            succeedCount++;
          }
        }
        addToast(
          `Successfully updated ${succeedCount} track(s) with batch tags!`,
          "success"
        );
        setSelectedTrackIds([]);
      } catch (err: any) {
        console.error("Batch update failed:", err);
        addToast(`Batch tag update failed: ${err.message || err}`, "error");
      }
    },
    [selectedTrackIds, tracks, updateTrack, addToast]
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const zipInputRef = React.useRef<HTMLInputElement>(null);
  const chatImageInputRef = React.useRef<HTMLInputElement>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClients = () => {
    fileInputRef.current?.click();
  };

  const toggleClientSelection = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleBulkStatusUpdate = async (
    status: "online" | "offline" | "away",
  ) => {
    for (const id of selectedClientIds) {
      await updateClient(id, { status });
    }
    setSelectedClientIds([]);
  };

  const handleBulkDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete ${selectedClientIds.length} partners?`,
      )
    )
      return;
    for (const id of selectedClientIds) {
      await deleteClient(id);
    }
    if (selectedClient && selectedClientIds.includes(selectedClient.id)) {
      setSelectedClient(null);
    }
    setSelectedClientIds([]);
  };

  const handleBulkTagAdd = async () => {
    const tag = prompt("Enter tag to assign to selected partners:");
    if (!tag) return;
    for (const id of selectedClientIds) {
      const client = clients.find((c) => c.id === id);
      if (client && !client.tags.includes(tag)) {
        await updateClient(id, { tags: [...client.tags, tag] });
      }
    }
    setSelectedClientIds([]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      let importedClients: any[] = [];

      try {
        if (file.name.endsWith(".json")) {
          importedClients = JSON.parse(text);
        } else if (file.name.endsWith(".csv")) {
          const lines = text.split("\n");
          const headers = lines[0]
            .split(",")
            .map((h) => h.trim().toLowerCase());

          importedClients = lines
            .slice(1)
            .filter((line) => line.trim())
            .map((line) => {
              const values = line.split(",").map((v) => v.trim());
              const client: any = {};
              headers.forEach((header, index) => {
                if (values[index]) client[header] = values[index];
              });
              return client;
            });
        }

        let count = 0;
        for (const client of importedClients) {
          if (client.email && !clients.find((c) => c.email === client.email)) {
            await addClient({
              name: client.name || client.email.split("@")[0],
              email: client.email,
              status: "online",
            });
            count++;
          }
        }
        alert(`${count} industry contacts imported successfully.`);
      } catch (err) {
        console.error("Import error:", err);
        alert(
          "Failed to parse file. Please ensure it follows the CSV or JSON format.",
        );
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset for next import
  };

  const handleNavigateToVideoMaker = (track: Track) => {
    setSelectedTrackForVideo(track);
    setActiveView("videos");
    setVideoSubTab("maker");
  };

  const handleDeleteTrack = async (id: string) => {
    console.log(`[App] handleDeleteTrack called for ID: ${id}`);

    // Stop audio if deleting active track
    if (activeTrack?.id === id) {
      console.log(`[App] Deleting active track, stopping audio.`);
      stop();
    }

    try {
      await deleteTrack(id);
      console.log(`[App] deleteTrack context call completed for ID: ${id}`);
    } catch (err) {
      console.error(`[App] Error in handleDeleteTrack for ID: ${id}:`, err);
    }
  };

  const handleAnalyzeTrackManual = async (track: Track) => {
    addToast(
      `Initializing dynamic parameters check for "${track.name}"...`,
      "info",
    );
    try {
      const result = await analyzeTrack(track.name, track.duration, track.file_data as File | null, track.file_url);
      if (result) {
        await updateTrack(track.id, {
          bpm: result.bpm,
          key_signature: result.key,
          tags: result.tags,
        });
        addToast(
          `Successfully updated parameters for "${track.name}"!`,
          "success",
        );
      }
    } catch (err: any) {
      console.error("Manual AI Analysis error:", err);
      addToast(`AI Diagnostics failed: ${err.message || err}`, "error");
    }
  };

  const handleChatImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setChatAttachment(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    if (!file.name.endsWith(".zip")) {
      alert("Please upload a .ZIP archive for delivery.");
      return;
    }

    const directoryPath = `client-deliveries/${selectedClient.email.replace(/[.@]/g, "_")}/${file.name}`;

    addActivity({
      type: "system",
      user: "OGBeatz",
      action: `Uploading master archive to vault: ${file.name}...`,
    });

    try {
      const publicUrl = await uploadFile("deliveries", file);
      const downloadUrl =
        publicUrl || `https://vault.ogbeatz.com/${directoryPath}`;

      const notesHeading = zipNotesDraft.trim()
        ? `\n\nDelivery Notes:\n"${zipNotesDraft.trim()}"`
        : "";
      const messageContent = `Master archive delivered: ${file.name}\nResource Path: ${downloadUrl}${notesHeading}`;

      await sendMessage(selectedClient.id, messageContent);
      addActivity({
        type: "download",
        user: "OGBeatz",
        action: "delivered package",
        target: file.name,
        client_id: selectedClient.id,
      });

      setZipNotesDraft("");
      alert(
        `Secure master package ${file.name} successfully delivered to ${selectedClient.name}.`,
      );
    } catch (err) {
      console.error("ZIP delivery failed:", err);
      alert("ZIP shipping aborted. Check connectivity or permissions.");
    }

    e.target.value = "";
  };
  const handleDownload = async (track: Track) => {
    try {
      addToast(`Preparing high-fidelity ZIP bundle for "${track.name}"...`, "info");
      const zip = new JSZip();

      // Determine formats
      let formatEncoding = "MPEG-1 Audio Layer III (320kbps)";
      let formatExt = "mp3";
      let sizeMultiplier = 1;
      if (exportFormat === "WAV") {
        formatEncoding = "Uncompressed Linear PCM (24-bit / 48kHz)";
        formatExt = "wav";
        sizeMultiplier = 5.2;
      } else if (exportFormat === "FLAC") {
        formatEncoding = "Free Lossless Audio Codec (Level 5 / 24-bit)";
        formatExt = "flac";
        sizeMultiplier = 3.1;
      }

      const finalSize = track.size ? track.size * sizeMultiplier : 4700000 * sizeMultiplier;

      // 1. Fetch audio master blob
      const sanitizedAudioName = `${track.name.replace(/[/\\?%*:|"<>\s]/g, "_")}.${formatExt}`;
      if (track.file_data) {
        zip.file(sanitizedAudioName, track.file_data);
      } else if (track.file_url) {
        addToast("Retrieving high-fidelity audio waveform stream...", "info");
        try {
          const blob = await fetchWithProxyFallback(track.file_url);
          zip.file(sanitizedAudioName, blob);
        } catch (err) {
          console.warn("Could not retrieve remote master audio file:", err);
          addToast("Could not embed original master audio automatically. ZIP package will contain lyric stems, catalog keys, and distribution metadata.", "warning");
        }
      }

      // 2. Generate track_sheet.txt
      const parsedTags = getTrackInfoFromTags(track.tags);
      const activeTags = track.tags || [];
      
      const durMin = Math.floor(track.duration / 60);
      const durSec = Math.floor(track.duration % 60).toString().padStart(2, "0");
      const realDur = `${durMin}:${durSec}`;

      const trackSheet = `================================================================================
              OFFICIAL STUDIO MASTER SHEET: ${track.name.toUpperCase()}
================================================================================
STUDIO PROFILE:
--------------------------------------------------------------------------------
Track Name:      ${track.name}
Artist / Producer: ${track.artist || "OGBeatz"}
Target Format:   ${exportFormat}
Bitrate/Encoding: ${formatEncoding}
Track Size (Est): ${(finalSize / (1024 * 1024)).toFixed(2)} MB
Original Format: ${track.type || "audio/mpeg"}
Plays Count:     ${track.plays || 0}
Likes Count:     ${track.likes || 0}
Upload Date:     ${track.created_at ? new Date(track.created_at).toLocaleString() : "N/A"}

ANALYTICAL METRICS:
--------------------------------------------------------------------------------
BPM (Tempo):     ${track.bpm || "N/A"}
Key Signature:   ${track.key_signature || "N/A"}
Duration:        ${realDur} (${track.duration} seconds)
Primary Genre:   ${parsedTags.genreCategory || "N/A"}
Vocal/Inst type: ${activeTags.includes("Instrumental") ? "Instrumental" : "Vocal Track"}
Emotional Mood:  ${parsedTags.mood || "N/A"}
Auditory Vibe:   ${parsedTags.vibe || "N/A"}
Instruments:     ${parsedTags.instruments || "N/A"}

DISTRIBUTION ASSETS:
--------------------------------------------------------------------------------
Streaming Master URL:   ${track.file_url || "N/A"}
Artwork Canvas URL:     ${track.image_url || "N/A"}

TRACK DESCRIPTION / MARKETING PITCH:
--------------------------------------------------------------------------------
${parsedTags.pitch || "No additional description parsed."}

TAG INDEX:
--------------------------------------------------------------------------------
${activeTags.join(", ")}

================================================================================
Generated via OGBeatz Mastering Suite - Copyright 2026. All rights Reserved.
================================================================================\n`;

      const sanitizedBaseName = track.name.replace(/[/\\?%*:|"<>\s]/g, "_");
      zip.file(`${sanitizedBaseName}_MASTER_SHEET.txt`, trackSheet);

      // 3. Generate lyrics files (timestamped + plain)
      const rawLyrics = track.lyrics || "";
      
      // Timestamped text
      zip.file(`${sanitizedBaseName}_lyrics.lrc`, rawLyrics || "[00:00.00] No lyrics loaded/provided for this master. You can paste timestamped lyric scripts using the track editor.");

      // Plain text (strip LRC styled brackets like: [01:23.45], [02:00], etc.)
      const plainLyrics = rawLyrics
        ? rawLyrics.replace(/\[\d{1,2}:\d{2}(\.\d{1,3})?\]/g, "").replace(/^\s+/gm, "")
        : "No lyrics available.";
      
      zip.file(`${sanitizedBaseName}_lyrics_plain.txt`, plainLyrics);

      // 4. Fetch Artwork if available
      let artBlob: Blob | null = null;
      if (track.image_data) {
        artBlob = track.image_data;
      } else if (track.image_url) {
        addToast("Retrieving release artwork canvas...", "info");
        try {
          artBlob = await fetchWithProxyFallback(track.image_url);
        } catch (err) {
          console.warn("Could not retrieve master artwork due to network/CORS restrictions:", err);
        }
      }

      if (artBlob) {
        let artExt = "png";
        const cType = artBlob.type;
        if (cType) {
          if (cType.includes("jpeg") || cType.includes("jpg")) {
            artExt = "jpg";
          } else if (cType.includes("webp")) {
            artExt = "webp";
          } else if (cType.includes("gif")) {
            artExt = "gif";
          }
        } else if (track.image_url) {
          const lower = track.image_url.toLowerCase();
          if (lower.includes(".jpg") || lower.includes(".jpeg")) {
            artExt = "jpg";
          } else if (lower.includes(".webp")) {
            artExt = "webp";
          } else if (lower.includes(".gif")) {
            artExt = "gif";
          }
        }
        zip.file(`${sanitizedBaseName}_artwork.${artExt}`, artBlob);
      }

      // Generate the ZIP
      addToast("Finalizing compression on high-velocity studio ZIP archive...", "info");
      const zipContent = await zip.generateAsync({ type: "blob" });
      
      const zipFilename = `${sanitizedBaseName}_${exportFormat.toLowerCase()}_master.zip`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipContent);
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast(`High-fidelity Master ZIP package for "${track.name}" delivered successfully!`, "success");
    } catch (err: any) {
      console.error("ZIP Generation failed for track:", err);
      addToast(`Could not generate single-track ZIP: ${err.message || err}`, "error");
    }
  };

  const handleShare = (track: Track) => {
    setSharingAsset({ track });
  };

  const handleSharePlaylist = (playlist: Playlist) => {
    setSharingAsset({ playlist });
  };

  const handleRemoveTrackFromPlaylist = async (
    trackId: string,
    playlistId: string,
  ) => {
    if (
      confirm(
        "Remove this track from the collection? (Source file will remain in library)",
      )
    ) {
      if (activeTrack?.id === trackId) {
        stop();
      }
      await removeTrackFromPlaylist(trackId, playlistId);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || params.get("share");
    const portalClient = params.get("client_portal");

    if (token) setShareToken(token);
    if (portalClient && clients.length > 0) {
      const client = clients.find((c) => c.id === portalClient);
      if (client) {
        setClientPortalUser(client);
      }
    }
  }, [clients]);

  const sharedContent = useMemo(() => {
    if (
      !shareToken ||
      loading ||
      tracks.length === 0 ||
      shareLinks.length === 0
    )
      return null;

    const link = shareLinks.find((l) => l.token === shareToken);
    if (!link) return { invalid: true };

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return { expired: true };
    }

    if (link.track_id) {
      const track = tracks.find((t) => t.id === link.track_id);
      if (track) return { track, link };
    } else if (link.playlist_id) {
      const playlist = playlists.find((p) => p.id === link.playlist_id);
      if (playlist) return { playlist, link };
    }

    return { invalid: true };
  }, [shareToken, tracks, playlists, shareLinks, loading]);

  useEffect(() => {
    if (
      sharedContent?.link &&
      hasIncrementedRef.current !== sharedContent.link.id
    ) {
      incrementShareLinkAccess(sharedContent.link.id);
      hasIncrementedRef.current = sharedContent.link.id;
    }
  }, [sharedContent, incrementShareLinkAccess]);

  if (shareToken) {
    const displayContent = sharedContent?.link
      ? sharedContent
      : asyncSharedContent;

    if (displayContent && displayContent.link) {
      return (
        <SharePortal
          track={displayContent.track}
          playlist={displayContent.playlist}
          shareLink={displayContent.link}
        />
      );
    }

    if (loading || (!asyncSharedContent && !shareError)) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-6">
          <div className="w-16 h-16 rounded-[2rem] bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
            <img src="/ogbeatz_logo.svg" alt="THE BEATZ WAY Logo" className="w-12 h-12 object-contain animate-pulse" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white">
              Initializing Secure Portal
            </h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Establishing cryptographic handshake...
            </p>
          </div>
        </div>
      );
    }
    // If not loading and no content, maybe link is dead. We can either show an error or fall through.
    // Let's show a clean error for better UX.
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-8 p-8 selection:bg-orange-500 selection:text-black">
        <div className="w-24 h-24 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-8 shadow-[0_0_100px_rgba(239,68,68,0.2)]">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-3xl font-black italic uppercase tracking-tighter">
            Access Token Invalid
          </h2>
          <p className="text-zinc-500 text-sm font-medium">
            {sharedContent?.expired
              ? "This share link has expired and self-destructed. Please request a new reference link from the producer."
              : shareError ||
                "This share link is invalid or has been revoked by the production team."}
          </p>
        </div>
        <button
          onClick={() => (window.location.href = window.location.origin)}
          className="mt-8 px-8 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors text-white"
        >
          Return Home
        </button>
      </div>
    );
  }

  if (clientPortalUser) {
    if (loading) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-6">
          <div className="w-16 h-16 rounded-[2rem] bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
            <img src="/ogbeatz_logo.svg" alt="THE BEATZ WAY Logo" className="w-12 h-12 object-contain animate-pulse" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white">
              Loading Client Portal
            </h2>
          </div>
        </div>
      );
    }
    return <ClientPortal client={clientPortalUser} />;
  }

  const renderVideos = () => (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">
            {videoSubTab === "maker"
              ? "Music Video Maker Pro"
              : "Video Library"}
          </h1>
          <p className="text-zinc-500 text-sm font-medium">
            {videoSubTab === "maker"
              ? "Generate professional high-fidelity social assets from your beats and cover arts."
              : "Your personal library of video assets, generated clips, and promos."}
          </p>
        </div>
        {videoSubTab === "archive" && (
          <button
            onClick={() => setShowUploadVideo(true)}
            className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-black font-black uppercase text-[10px] tracking-widest rounded-full shadow-lg shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4 text-black" /> Upload Video
          </button>
        )}
      </div>

      {/* Sub-tabs toggler option bar */}
      <div className="flex gap-2.5 border-b border-zinc-900 pb-2">
        <button
          onClick={() => setVideoSubTab("maker")}
          className={`px-6 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-full transition-all duration-300 ${
            videoSubTab === "maker"
              ? "bg-orange-500 text-black shadow-lg shadow-orange-500/15"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
          }`}
        >
          🎵 Music Video Maker
        </button>
        <button
          onClick={() => setVideoSubTab("archive")}
          className={`px-6 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-full transition-all duration-300 ${
            videoSubTab === "archive"
              ? "bg-orange-500 text-black shadow-lg shadow-orange-500/15"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
          }`}
        >
          Video Library
        </button>
      </div>

      {videoSubTab === "maker" ? (
        <MusicVideoMaker 
          initialTrackId={selectedTrackForVideo?.id || undefined}
          onClearInitialTrackId={() => setSelectedTrackForVideo(null)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {promoVideos.length > 0 ? (
            promoVideos.map((video) => {
              const track = tracks.find((t) => t.id === video.track_id);
              const playlist = playlists.find((p) => p.id === video.playlist_id);
              const sourceName = track?.name || playlist?.name || "Unknown Asset";

              return (
                <motion.div
                  key={video.id}
                  layoutId={video.id}
                  onClick={() => setSelectedVideoForPreview(video)}
                  className="group relative bg-zinc-950 border border-zinc-900 rounded-[2.5rem] overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all shadow-xl"
                >
                  <div className="aspect-square relative overflow-hidden">
                    <img
                      src={video.thumbnail_url}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70"
                      alt={sourceName}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-xl border border-white/30 rounded-full flex items-center justify-center text-white scale-90 group-hover:scale-100 transition-transform">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>

                    <div className="absolute top-4 left-4">
                      <div className="px-3 py-1 bg-black/50 backdrop-blur-md border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-orange-500">
                        {video.style}
                      </div>
                    </div>

                    {/* Quick Delete Overlay Button & Confirmation Portal */}
                    {confirmDeleteId === video.id ? (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 z-30 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center select-none"
                      >
                        <AlertCircle className="w-8 h-8 text-rose-500 mb-2 animate-pulse" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Destroy Video Asset?</p>
                        <p className="text-[8px] text-zinc-500 uppercase tracking-widest mt-1 mx-2">This action is irreversible and purges all records permanently.</p>
                        <div className="flex items-center gap-2 mt-4 w-full px-2">
                          <button
                            onClick={() => {
                              deletePromoVideo(video.id);
                              setConfirmDeleteId(null);
                            }}
                            className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-black rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-rose-600/10"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(video.id);
                        }}
                        className="absolute top-4 right-4 z-20 p-2.5 bg-black/60 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-rose-500 hover:bg-rose-950/40 rounded-full opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-lg active:scale-90"
                        title="Destroy Promo Video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="p-6">
                    <h3 className="text-lg font-black italic uppercase tracking-tighter truncate">
                      {sourceName}
                    </h3>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                        {new Date(video.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">
                          READY
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="col-span-full py-32 bg-zinc-950/50 border border-zinc-900 rounded-[3.5rem] flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 rounded-[2rem] bg-zinc-900 flex items-center justify-center text-zinc-700">
                <Video className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-tighter">
                  Archive is empty
                </h3>
                <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">
                  Generate motion assets from the Tracks or Playlists menu.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderDashboard = () => (
    <div className="p-8 space-y-8">
      {/* Header Area */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">
            Dashboard
          </h1>
          <p className="text-zinc-500 text-sm font-medium">
            Welcome back, OG. Here's what's happening today.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={checkDatabase}
            disabled={dbStatus?.status === "checking"}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border",
              dbStatus?.status === "success"
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-500"
                : dbStatus?.status === "error"
                  ? "bg-red-500/10 border-red-500 text-red-500"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white",
            )}
          >
            {dbStatus?.status === "checking" ? (
              <Zap className="w-4 h-4 animate-spin" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {dbStatus?.status === "checking"
              ? "Testing DB..."
              : dbStatus?.status === "success"
                ? "Connected"
                : dbStatus?.status === "error"
                  ? "Connection Error"
                  : "Test DB"}
          </button>
          <button
            onClick={() => alert("Notification center synchronizing...")}
            className="p-2 text-zinc-500 hover:text-white transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            <div className="absolute top-2 right-2.5 w-2 h-2 bg-orange-500 rounded-full border-2 border-black" />
          </button>
          <button
            onClick={() => setActiveView("profile")}
            className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-zinc-800 transition-all border border-zinc-800"
          >
            <User className="w-4 h-4 text-orange-500" /> Profile
          </button>
        </div>
      </div>

      {dbStatus?.message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-6 rounded-3xl border flex flex-col gap-4",
            dbStatus.status === "success"
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-red-500/5 border-red-500/20",
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                dbStatus.status === "success" ? "bg-emerald-500" : "bg-red-500",
              )}
            />
            <p
              className={cn(
                "text-xs font-black uppercase tracking-widest",
                dbStatus.status === "success"
                  ? "text-emerald-500"
                  : "text-red-500",
              )}
            >
              {dbStatus.message}
            </p>
          </div>

          {dbStatus.status === "error" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-black/40 p-4 rounded-2xl border border-white/5">
              {[
                "tracks",
                "playlists",
                "clients",
                "share_links",
                "activities",
                "messages",
                "promo_videos",
                "profiles",
                "promo_packs",
                "todos",
              ].map((table) => (
                <div key={table} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">
                    {table}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: "Total Tracks",
            value: stats.totalTracks,
            icon: Music,
            trend: "+12%",
            color: "text-orange-500",
          },
          {
            label: "Active Clients",
            value: stats.activeClients,
            icon: Users,
            trend: "+5%",
            color: "text-blue-500",
          },
          {
            label: "Total Plays",
            value: stats.totalPlays.toLocaleString(),
            icon: Play,
            trend: "+18.2%",
            color: "text-emerald-500",
          },
          {
            label: "Engagement Count",
            value: stats.totalEngagementCount.toLocaleString(),
            icon: TrendingUp,
            trend: stats.engagementRate + " Rate",
            color: "text-purple-500",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-zinc-950 border border-zinc-900 p-6 rounded-[2rem] hover:border-zinc-800 transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center border border-zinc-800 group-hover:scale-110 transition-transform",
                  stat.color,
                )}
              >
                <stat.icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md">
                {stat.trend}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                {stat.label}
              </p>
              <h3 className="text-2xl font-black">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Performance Chart */}
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase">
                Performance Overview
              </h2>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mt-1">
                Play trends vs Engagement metrics
              </p>
              {/* Simple Custom Legend */}
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Plays</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Engagement</span>
                </div>
              </div>
            </div>
            <select
              value={chartTimeframe}
              onChange={(e) => setChartTimeframe(e.target.value as "7d" | "30d")}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none text-orange-500 cursor-pointer"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorPlays" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#18181b"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#52525b", fontSize: 10, fontWeight: 900 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#52525b", fontSize: 10, fontWeight: 900 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#09090b",
                    border: "1px solid #18181b",
                    borderRadius: "12px",
                  }}
                  itemStyle={{
                    fontSize: "10px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                  labelStyle={{
                    fontSize: "10px",
                    fontWeight: 900,
                    color: "#a1a1aa",
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="plays"
                  name="Plays"
                  stroke="#f97316"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorPlays)"
                />
                <Area
                  type="monotone"
                  dataKey="engagement"
                  name="Engagement"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorEngagement)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Recent Activity */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 flex flex-col">
          <h2 className="text-xl font-black tracking-tight uppercase mb-8">
            Pulse Feed
          </h2>
          <div className="space-y-6 flex-1 overflow-y-auto max-h-[350px] pr-2 scrollbar-hide">
            {activities
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime(),
              )
              .slice(0, 8)
              .map((act) => {
                const { Icon, color, bg } = getActivityIcon(act.type);
                return (
                  <div key={act.id} className="flex gap-4 items-start group">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl shrink-0 transition-transform group-hover:scale-110",
                        bg,
                      )}
                    >
                      <Icon className={cn("w-5 h-5", color)} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <p className="text-[11px] leading-tight flex flex-wrap items-center">
                        <span className="font-black text-white">
                          {act.user || "System"}
                        </span>
                        <span className="text-zinc-500 mx-1.5">
                          {getActivityVerb(act.type)}
                        </span>
                        <span className="font-black text-orange-500 hover:underline cursor-pointer truncate">
                          {getActivityLabel(act)}
                        </span>
                      </p>
                      <span className="text-[8px] font-black text-zinc-700 uppercase tracking-widest mt-1.5">
                        {new Date(act.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            {activities.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-center opacity-40">
                <ActivityIcon className="w-12 h-12 mb-4" />
                <p className="text-xs font-black uppercase tracking-widest">
                  No recent transaction logs
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setActiveView("activity")}
            className="w-full mt-8 pt-6 border-t border-zinc-900 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors"
          >
            Full Audit Path
          </button>
        </div>
      </div>

      {/* Track Stats Table / Secondary Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black uppercase tracking-tight">
              Top Performance
            </h3>
            <button
              onClick={() => setActiveView("tracks")}
              className="text-[10px] font-black uppercase tracking-widest text-orange-500"
            >
              View Library
            </button>
          </div>
          <div className="space-y-4">
            {tracks.slice(0, 4).map((track) => (
              <div
                key={track.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 group hover:bg-zinc-900 transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-zinc-800">
                    <img
                      src={track.image_url!}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase truncate">
                      {track.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-medium">
                      {track.artist}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black">
                      {track.plays}
                    </span>
                    <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                      Plays
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewingTrackDetails(track)}
                      className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-105"
                      title="View Track Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => playTrack(track, tracks)}
                      className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-105"
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black uppercase tracking-tight">
              System Status
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                Cloud Sync Active
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Database Latency", value: "18ms", status: "optimal" },
              { label: "Storage Usage", value: "42%", status: "optimal" },
              { label: "API Uptime", value: "99.9%", status: "optimal" },
              {
                label: "Active Sessions",
                value: stats.activeClients,
                status: "optimal",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="p-6 rounded-3xl bg-zinc-900/50 border border-zinc-800 flex flex-col items-center text-center space-y-2"
              >
                <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                  {item.label}
                </span>
                <span className="text-xl font-mono font-bold">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTracks = () => (
    <div className="p-8 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter">
            MASTER LIBRARY
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage and distribute your high-fidelity references.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Format Radio Button Selector */}
          <div className="flex items-center gap-1.5 bg-zinc-950/60 border border-zinc-900 rounded-full p-1 h-[44px] px-3 shadow-inner">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider pl-1 select-none">
              Format:
            </span>
            <div className="flex items-center gap-1">
              {(['MP3', 'WAV', 'FLAC'] as const).map((fmt) => (
                <label
                  key={fmt}
                  className={`px-3 py-1 rounded-full text-[10px] uppercase font-black tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1 select-none h-[34px] ${
                    exportFormat === fmt
                      ? 'bg-orange-500 text-black shadow-lg font-black'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportFormat"
                    value={fmt}
                    checked={exportFormat === fmt}
                    onChange={() => handleUpdateExportFormat(fmt)}
                    className="sr-only"
                  />
                  {fmt}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowExportModal(true)}
            disabled={isExportingZip}
            className="border border-zinc-800 bg-zinc-950 text-orange-500 hover:text-white hover:border-orange-500/50 px-6 py-3 rounded-full font-black tracking-widest uppercase text-xs flex items-center gap-2 hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none cursor-pointer h-[44px]"
            title={`Export master tracks, specifications sheet, and timestamped lrc lyrics in a unified ${exportFormat} ZIP archive`}
          >
            <FileArchive className={`w-4 h-4 ${isExportingZip ? 'animate-bounce' : ''}`} />
            {isExportingZip ? "Generating..." : `Export Library (${exportFormat})`}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-white text-black px-6 py-3 rounded-full font-black tracking-widest uppercase text-xs flex items-center gap-2 hover:scale-105 transition-transform h-[44px]"
          >
            <Plus className="w-4 h-4" /> Add New Master
          </button>
        </div>
      </div>

      {/* Dynamic Music Analysis Parameterizer - Parity Options */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-500/10 border border-orange-500/25 text-orange-500 rounded-2xl shrink-0">
              <Sparkles className="w-5 h-5 text-orange-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">
                Acoustic Analysis Framework
              </h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
                Determine the core parameters (BPM, key signature, textural tags) of your music using either cloud-scale AI modeling or high-precision in-browser client digital signal processing (DSP). This gives you total control over the analytical output.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 rounded-2xl border border-zinc-800 self-stretch lg:self-auto shadow-inner shrink-0">
            <button
              onClick={() => setAnalysisEngine('dsp')}
              className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all flex items-center justify-center gap-2 ${
                analysisEngine === 'dsp'
                  ? 'bg-orange-500 text-black shadow font-black'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Web Audio DSP
            </button>
            <button
              onClick={() => setAnalysisEngine('ai')}
              className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all flex items-center justify-center gap-2 ${
                analysisEngine === 'ai'
                  ? 'bg-orange-500 text-black shadow font-black'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Cognitive AI
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-zinc-900/70">
          <div 
            onClick={() => setAnalysisEngine('dsp')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              analysisEngine === 'dsp'
                ? 'bg-zinc-900/40 border-orange-500/20 shadow-lg'
                : 'bg-transparent border-transparent hover:border-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2 text-zinc-200">
              <div className={`w-1.5 h-1.5 rounded-full ${analysisEngine === 'dsp' ? 'bg-orange-500' : 'bg-zinc-600'}`} />
              <span className="text-[10.5px] font-mono font-black uppercase tracking-widest">Web Audio DSP (Local Engine)</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
              Decodes actual binary wave blocks in the browser. Uses <strong>envelope detectors</strong> and <strong>spectral pitch profiles</strong> to extract raw physical characteristics (BPM, Root Triads, Peak Crest Factor) with 100% privacy and zero latency.
            </p>
          </div>

          <div 
            onClick={() => setAnalysisEngine('ai')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              analysisEngine === 'ai'
                ? 'bg-zinc-900/40 border-orange-500/20 shadow-lg'
                : 'bg-transparent border-transparent hover:border-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2 text-zinc-200">
              <div className={`w-1.5 h-1.5 rounded-full ${analysisEngine === 'ai' ? 'bg-orange-500' : 'bg-zinc-600'}`} />
              <span className="text-[10.5px] font-mono font-black uppercase tracking-widest">Cognitive AI (Gemini Agent)</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
              Applies advanced contextual reasoning via <strong>Gemini 3.5</strong> on the server. Classifies micro-genres, mood patterns, visual textures, SEO keywords, and label-ready marketing pitches.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-orange-500 transition-colors" />
          <input
            type="text"
            placeholder="Search by name, artist, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-900 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:border-orange-500 transition-all text-white"
          />
        </div>

        {/* Sorting selector */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-900 p-1 rounded-2xl self-stretch md:self-auto shrink-0 shadow-inner h-[44px]">
          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider pl-3 pr-1 select-none whitespace-nowrap">
            Sort By:
          </span>
          <select
            value={sortBy}
            onChange={(e) => {
              const val = e.target.value as "date_added" | "name" | "bpm";
              setSortBy(val);
              if (val === "date_added") {
                setSortOrder("desc");
              } else {
                setSortOrder("asc");
              }
            }}
            className="bg-transparent text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white transition-all cursor-pointer focus:outline-none border-none py-1.5 pl-2 pr-7 appearance-none rounded-xl"
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
              backgroundSize: '12px'
            }}
          >
            <option value="date_added" className="bg-zinc-950 text-zinc-300 font-black">Date Added</option>
            <option value="name" className="bg-zinc-950 text-zinc-300 font-black">Name</option>
            <option value="bpm" className="bg-zinc-950 text-zinc-300 font-black">BPM</option>
          </select>
          
          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
            title={`Toggle sort order (Current: ${sortOrder === "asc" ? "Ascending" : "Descending"})`}
            className="p-1 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900/40 w-[34px] h-[34px] flex items-center justify-center transition-all shrink-0"
          >
            <ArrowUpDown className={`w-3.5 h-3.5 transition-transform duration-300 ${sortOrder === 'desc' ? 'rotate-180 text-orange-500' : 'text-zinc-400'}`} />
          </button>
        </div>

        {/* Layout View Preferences Selector */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-900 p-1 rounded-2xl self-stretch md:self-auto shrink-0 shadow-inner">
          <button
            type="button"
            onClick={() => setTrackListViewMode("cards")}
            title="Grid Cards Layout"
            className={`px-4 py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all flex items-center gap-2 ${
              trackListViewMode === "cards"
                ? "bg-orange-500 text-black font-black"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setTrackListViewMode("columns")}
            title="Detailed Columns/Table Layout"
            className={`px-4 py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all flex items-center gap-2 ${
              trackListViewMode === "columns"
                ? "bg-orange-500 text-black font-black"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            <Table className="w-4 h-4" />
            <span className="hidden sm:inline">Columns</span>
          </button>
          <button
            type="button"
            onClick={() => setTrackListViewMode("list")}
            title="Compact Row/List Layout"
            className={`px-4 py-2.5 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all flex items-center gap-2 ${
              trackListViewMode === "list"
                ? "bg-orange-500 text-black font-black"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">List</span>
          </button>
        </div>

        <button className="px-6 py-3 border border-zinc-900 rounded-2xl flex items-center gap-2 text-zinc-400 hover:text-white transition-colors self-stretch md:self-auto justify-center">
          <Filter className="w-4 h-4" /> Filters
        </button>
      </div>

      {showUpload && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <UploadZone onSuccess={() => setShowUpload(false)} />
        </motion.div>
      )}

      {trackListViewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              className="group relative bg-zinc-950 border border-zinc-900 rounded-[2rem] overflow-hidden hover:border-zinc-700 transition-all duration-500 shadow-2xl shadow-black/50 hover:shadow-orange-500/5"
            >
              <div className="aspect-square relative overflow-hidden bg-zinc-900 flex items-center justify-center">
                <img
                  src={track.image_url || "/ogbeatz_logo.svg"}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500">
                  <button
                    onClick={() => playTrack(track, filteredTracks)}
                    className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black shadow-2xl shadow-white/10 hover:scale-110 transition-transform active:scale-95"
                  >
                    <Play className="w-8 h-8 fill-current ml-1" />
                  </button>
                </div>

                <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                  <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-black tracking-widest uppercase text-white shadow-lg">
                    {track.status}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingTrackDetails(track);
                      }}
                      className="w-10 h-10 rounded-full bg-orange-500/10 backdrop-blur-md border border-orange-500/20 flex items-center justify-center text-orange-400 hover:bg-orange-500 hover:text-black transition-all animate-pulse"
                      title="View Track Details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(track);
                      }}
                      className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-white hover:text-black transition-all"
                      title="Download Track"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTrack(track);
                      }}
                      className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-white hover:text-black transition-all"
                      title="Edit Track"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTrack(track.id);
                      }}
                      className="w-10 h-10 rounded-full bg-rose-500/20 backdrop-blur-md border border-rose-500/30 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                      title="Delete Track"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <TrackOptionsMenu
                      track={track}
                      onEdit={() => setEditingTrack(track)}
                      onShare={() => handleShare(track)}
                      onDownload={() => handleDownload(track)}
                      onDelete={() => handleDeleteTrack(track.id)}
                      onCreatePromo={() => setSelectedTrackForPromo(track)}
                      onCreateVideo={() => handleNavigateToVideoMaker(track)}
                      onAddToPlaylist={(plId) =>
                        addTrackToPlaylist(track.id, plId)
                      }
                      playlists={playlists}
                      onAnalyze={() => handleAnalyzeTrackManual(track)}
                      onViewDetails={() => setViewingTrackDetails(track)}
                      className="bg-black/40 backdrop-blur-md rounded-full border border-white/10"
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-white/95">
                    {track.name}
                  </h3>
                  <p className="text-zinc-500 text-sm">{track.artist}</p>
                </div>

                {(() => {
                  const info = getTrackInfoFromTags(track.tags);
                  const isExpanded = expandedTrackIds.includes(track.id);
                  return (
                    <>
                      {info.cleanTags && info.cleanTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {info.cleanTags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[8px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden space-y-4 pt-2"
                          >
                            {info.pitch && (
                              <p className="text-[11px] text-zinc-400 italic bg-zinc-950/60 border border-zinc-900 rounded-xl p-3 leading-relaxed mt-1 select-all font-mono">
                                "{info.pitch}"
                              </p>
                            )}

                            {(info.genreCategory ||
                              info.mood ||
                              info.vibe ||
                              info.instruments) && (
                              <div className="space-y-1.5 border-t border-zinc-900/60 pt-3 text-[10px] font-mono leading-relaxed">
                                <span className="text-[8px] font-black uppercase text-orange-500 tracking-wider flex items-center gap-1.5 mb-1 bg-orange-500/5 px-2 py-0.5 rounded border border-orange-500/10 w-max">
                                  <span className="w-1 h-1 bg-orange-500 rounded-full animate-pulse" />
                                  🎯 AI A&R REPORT
                                </span>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-500 font-mono">
                                  {info.genreCategory && (
                                    <div className="flex items-center justify-between border-b border-zinc-905 pb-0.5 min-w-0">
                                      <span className="text-zinc-650 font-bold uppercase tracking-wider text-[7px] shrink-0">
                                        GENRE:
                                      </span>
                                      <span className="text-zinc-305 font-black truncate ml-1">
                                        {info.genreCategory}
                                      </span>
                                    </div>
                                  )}
                                  {info.mood && (
                                    <div className="flex items-center justify-between border-b border-zinc-905 pb-0.5 min-w-0">
                                      <span className="text-zinc-655 font-bold uppercase tracking-wider text-[7px] shrink-0">
                                        MOOD:
                                      </span>
                                      <span className="text-zinc-305 font-black truncate ml-1">
                                        {info.mood}
                                      </span>
                                    </div>
                                  )}
                                  {info.vibe && (
                                    <div className="flex items-center justify-between border-b border-zinc-905 pb-0.5 min-w-0">
                                      <span className="text-zinc-655 font-bold uppercase tracking-wider text-[7px] shrink-0">
                                        VIBE:
                                      </span>
                                      <span className="text-orange-400 font-bold truncate ml-1">
                                        {info.vibe}
                                      </span>
                                    </div>
                                  )}
                                  {info.instruments && (
                                    <div className="flex items-center justify-between border-b border-zinc-905 pb-0.5 col-span-2 min-w-0">
                                      <span className="text-zinc-655 font-bold uppercase tracking-wider text-[7px] shrink-0">
                                        GEAR:
                                      </span>
                                      <span className="text-zinc-400 font-medium truncate ml-1">
                                        {info.instruments}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {track.lyrics && (
                              <div className="border-t border-zinc-900 pt-3">
                                <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <span>🎙️</span> LYRIC SHEET
                                </p>
                                <div className="max-h-24 overflow-y-auto bg-zinc-950/65 rounded-xl p-3 border border-zinc-900 font-mono text-[9px] text-zinc-400 leading-relaxed whitespace-pre-wrap select-all">
                                  {track.lyrics}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <button
                        type="button"
                        onClick={() => {
                          setExpandedTrackIds((prev) =>
                            prev.includes(track.id)
                              ? prev.filter((id) => id !== track.id)
                              : [...prev, track.id],
                          );
                        }}
                        className="w-full mt-2 py-2 px-3 border border-zinc-905 hover:border-zinc-800 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 transition-all bg-zinc-950/40 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5 text-orange-500" />{" "}
                            Hide AI A&R & Lyrics
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 animate-pulse" />{" "}
                            Show AI A&R & Lyrics
                          </>
                        )}
                      </button>
                    </>
                  );
                })()}

                <div className="grid grid-cols-3 gap-2 border-t border-zinc-900 pt-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-zinc-600 uppercase">
                      BPM
                    </p>
                    <p className="text-sm font-mono text-zinc-300">
                      {track.bpm}
                    </p>
                  </div>
                  <div className="text-center border-x border-zinc-900">
                    <p className="text-[10px] font-black text-zinc-600 uppercase">
                      Key
                    </p>
                    <p className="text-sm font-mono text-zinc-300">
                      {track.key_signature}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-zinc-600 uppercase">
                      Plays
                    </p>
                    <p className="text-sm font-mono text-zinc-300">
                      {(track.plays / 1000).toFixed(1)}k
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {trackListViewMode === "columns" && (
        <div className="overflow-x-auto bg-zinc-950 border border-zinc-900 rounded-[2rem] shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-900 text-[10px] font-black text-zinc-500 uppercase tracking-widest bg-zinc-950/40">
                <th className="py-5 pl-8 pr-2 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllTracksSelected}
                    onChange={toggleSelectAllTracks}
                    title="Select All Tracks"
                    className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500/25 focus:ring-offset-zinc-950 accent-orange-500 cursor-pointer"
                  />
                </th>
                <th className="py-5 px-4">Name</th>
                <th className="py-5 px-4 hidden sm:table-cell text-center">
                  BPM
                </th>
                <th className="py-5 px-4 hidden sm:table-cell text-center font-mono">
                  Key
                </th>
                <th className="py-5 px-4 hidden md:table-cell text-center">
                  BPM Range
                </th>
                <th className="py-5 px-4 hidden md:table-cell text-center">
                  Plays
                </th>
                <th className="py-5 px-4 hidden lg:table-cell">Vibe & A&R</th>
                <th className="py-5 px-4 text-center">Status</th>
                <th className="py-5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/40">
              {filteredTracks.map((track) => {
                const info = getTrackInfoFromTags(track.tags);
                const isSelected = selectedTrackIds.includes(track.id);
                return (
                  <tr
                    key={track.id}
                    className={`group hover:bg-zinc-900/30 transition-colors ${
                      isSelected ? "bg-orange-500/5 hover:bg-orange-500/10" : ""
                    }`}
                  >
                    {/* Multiselect Checkbox */}
                    <td className="py-4 pl-8 pr-2 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedTrackIds((prev) =>
                            prev.includes(track.id)
                              ? prev.filter((id) => id !== track.id)
                              : [...prev, track.id]
                          );
                        }}
                        className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500/25 focus:ring-offset-zinc-950 accent-orange-500 cursor-pointer"
                      />
                    </td>

                    {/* Name column */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-4">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-900 shrink-0 group">
                          <img
                            src={track.image_url || "/ogbeatz_logo.svg"}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={() => playTrack(track, filteredTracks)}
                              className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-lg"
                            >
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p
                            onClick={() => setViewingTrackDetails(track)}
                            className="text-sm font-bold text-white hover:text-orange-400 transition-colors cursor-pointer truncate max-w-xs uppercase tracking-tight"
                          >
                            {track.name}
                          </p>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">
                            {track.artist || "OGBEATZ MASTER"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* BPM Column */}
                    <td className="py-4 px-4 hidden sm:table-cell text-center font-mono text-zinc-300 text-xs font-semibold">
                      {track.bpm || "—"}
                    </td>

                    {/* Key Column */}
                    <td className="py-4 px-4 hidden sm:table-cell text-center font-mono text-zinc-300 text-xs font-semibold">
                      {track.key_signature || "—"}
                    </td>

                    {/* Additional meta */}
                    <td className="py-4 px-4 hidden md:table-cell text-center font-mono text-zinc-650 text-[10px]">
                      {track.bpm ? `${track.bpm - 3} - ${track.bpm + 3}` : "—"}
                    </td>

                    {/* Plays Column */}
                    <td className="py-4 px-4 hidden md:table-cell text-center font-mono text-zinc-400 text-xs">
                      {track.plays?.toLocaleString() || "0"}
                    </td>

                    {/* Vibe and A&R info */}
                    <td className="py-4 px-4 hidden lg:table-cell max-w-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">
                          {info.vibe || "DYNAMIC MASTER"}
                        </span>
                        <span
                          className="text-[9px] text-zinc-500 truncate block max-w-[200px]"
                          title={info.pitch || ""}
                        >
                          {info.pitch || "Pre-rendered waveform profile."}
                        </span>
                      </div>
                    </td>

                    {/* Status Column */}
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                          track.status === "ready"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                        }`}
                      >
                        {track.status}
                      </span>
                    </td>

                    {/* Actions Column */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setViewingTrackDetails(track)}
                          className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-black hover:scale-105 transition-all"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(track)}
                          className="w-8 h-8 rounded-full bg-white/5 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center hover:scale-105 transition-all"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingTrack(track)}
                          className="w-8 h-8 rounded-full bg-white/5 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center hover:scale-105 transition-all"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTrack(track.id)}
                          className="w-8 h-8 rounded-full bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white flex items-center justify-center hover:scale-105 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <TrackOptionsMenu
                          track={track}
                          onEdit={() => setEditingTrack(track)}
                          onShare={() => handleShare(track)}
                          onDownload={() => handleDownload(track)}
                          onDelete={() => handleDeleteTrack(track.id)}
                          onCreatePromo={() => setSelectedTrackForPromo(track)}
                          onCreateVideo={() => handleNavigateToVideoMaker(track)}
                          onAddToPlaylist={(plId) =>
                            addTrackToPlaylist(track.id, plId)
                          }
                          playlists={playlists}
                          onAnalyze={() => handleAnalyzeTrackManual(track)}
                          onViewDetails={() => setViewingTrackDetails(track)}
                          className="bg-black/60 hover:bg-zinc-900 border border-zinc-900 rounded-full"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {trackListViewMode === "list" && (
        <div className="space-y-3">
          {filteredTracks.map((track) => {
            const info = getTrackInfoFromTags(track.tags);
            return (
              <div
                key={track.id}
                className="group relative bg-zinc-950 border border-zinc-900 rounded-[1.5rem] p-4 hover:border-zinc-700 transition-all duration-300 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl shadow-black/40"
              >
                {/* Left side: cover art, play, details */}
                <div className="flex items-center gap-4 w-full md:w-auto min-w-0">
                  <div className="relative w-16 h-16 rounded-[1rem] overflow-hidden bg-zinc-900 border border-zinc-900 shrink-0">
                    <img
                      src={track.image_url || "/ogbeatz_logo.svg"}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => playTrack(track, filteredTracks)}
                        className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform"
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 md:flex-initial">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        onClick={() => setViewingTrackDetails(track)}
                        className="text-sm font-black text-white hover:text-orange-400 cursor-pointer uppercase tracking-tight truncate max-w-[180px] sm:max-w-xs"
                      >
                        {track.name}
                      </h4>
                      <span className="px-2.5 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[8px] font-black uppercase tracking-wider border border-orange-500/10">
                        {track.bpm} BPM
                      </span>
                      {track.key_signature && (
                        <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 text-[8px] font-mono leading-none border border-zinc-800">
                          {track.key_signature}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs font-bold mt-1">
                      Uploaded by {track.artist || "OGBEATZ"}
                    </p>

                    {/* Tags row */}
                    {info.cleanTags && info.cleanTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {info.cleanTags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded bg-zinc-900/60 border border-zinc-900 text-[8px] font-black uppercase tracking-widest text-zinc-650 font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle info block (Genre, vibe, plays) */}
                <div className="hidden lg:flex items-center gap-12 font-mono text-center">
                  <div className="space-y-1">
                    <span className="text-[8px] text-zinc-600 uppercase font-black block tracking-widest">
                      A&R Genre
                    </span>
                    <span className="text-xs text-zinc-300 font-bold uppercase">
                      {info.genreCategory || "General Audio"}
                    </span>
                  </div>
                  <div className="space-y-1 border-l border-zinc-900 pl-8">
                    <span className="text-[8px] text-zinc-600 uppercase font-black block tracking-widest">
                      Dynamic Vibe
                    </span>
                    <span className="text-xs text-orange-400 font-bold uppercase">
                      {info.vibe || "Waveform"}
                    </span>
                  </div>
                  <div className="space-y-1 border-l border-zinc-900 pl-8">
                    <span className="text-[8px] text-zinc-600 uppercase font-black block tracking-widest">
                      Total plays
                    </span>
                    <span className="text-xs text-zinc-400 font-bold">
                      {(track.plays || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Right side: quick tool buttons & overflow options menu */}
                <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto mt-2 md:mt-0 border-t border-zinc-900/40 md:border-t-0 pt-3 md:pt-0">
                  <div className="flex sm:hidden items-center text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    Plays:{" "}
                    <span className="text-white ml-1 font-mono">
                      {track.plays || 0}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto md:ml-0">
                    <button
                      onClick={() => setViewingTrackDetails(track)}
                      className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-black transition-all"
                      title="View Track Details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDownload(track)}
                      className="w-10 h-10 rounded-full bg-white/5 border border-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center hover:bg-zinc-900"
                      title="Download"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setEditingTrack(track)}
                      className="w-10 h-10 rounded-full bg-white/5 border border-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center hover:bg-zinc-900"
                      title="Edit Metadata"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTrack(track.id)}
                      className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center"
                      title="Delete Track"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    <TrackOptionsMenu
                      track={track}
                      onEdit={() => setEditingTrack(track)}
                      onShare={() => handleShare(track)}
                      onDownload={() => handleDownload(track)}
                      onDelete={() => handleDeleteTrack(track.id)}
                      onCreatePromo={() => setSelectedTrackForPromo(track)}
                      onCreateVideo={() => handleNavigateToVideoMaker(track)}
                      onAddToPlaylist={(plId) =>
                        addTrackToPlaylist(track.id, plId)
                      }
                      playlists={playlists}
                      onAnalyze={() => handleAnalyzeTrackManual(track)}
                      onViewDetails={() => setViewingTrackDetails(track)}
                      className="bg-black/60 hover:bg-zinc-900 border border-zinc-900 rounded-full"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderClients = () => (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic">
            Institutional Partners
          </h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
            Bridge the gap between feedback and final masters.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedClientIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 mr-2"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 mr-2">
                {selectedClientIds.length} Selected
              </span>
              <div className="h-4 w-px bg-orange-500/20 mx-1" />
              <button
                onClick={() => handleBulkStatusUpdate("online")}
                className="text-[9px] font-black uppercase tracking-widest text-orange-500 hover:text-white transition-colors"
              >
                Set Online
              </button>
              <button
                onClick={handleBulkTagAdd}
                className="text-[9px] font-black uppercase tracking-widest text-orange-500 hover:text-white transition-colors"
                title="Bulk Tag"
              >
                Add Tag
              </button>
              <button
                onClick={handleBulkDelete}
                className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedClientIds([])}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="text"
              placeholder="SEARCH PARTNERS..."
              value={clientSearchQuery}
              onChange={(e) => setClientSearchQuery(e.target.value)}
              className="bg-zinc-950 border border-zinc-900 rounded-full py-2.5 pl-12 pr-6 text-[10px] font-black uppercase tracking-widest outline-none focus:border-orange-500/50 transition-all w-64"
            />
          </div>
          <button
            onClick={handleImportClients}
            className="px-6 py-3 border border-zinc-900 rounded-full text-[10px] font-black uppercase tracking-widest hover:border-zinc-700 transition-all text-zinc-400 hover:text-white"
          >
            Bulk Ingest
          </button>
          <button
            onClick={() => setShowAddClient(true)}
            className="bg-white text-black px-6 py-3 rounded-full font-black tracking-widest uppercase text-xs flex items-center gap-2 hover:scale-105 transition-transform shadow-xl shadow-white/5"
          >
            <Plus className="w-4 h-4" /> Initialize Contact
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredClients.length > 0 ? (
          filteredClients.map((client) => (
            <div
              key={client.id}
              onClick={() => toggleClientSelection(client.id)}
              className={cn(
                "bg-zinc-950 border rounded-3xl p-6 transition-all group relative cursor-pointer",
                selectedClientIds.includes(client.id)
                  ? "border-orange-500 ring-1 ring-orange-500/50"
                  : "border-zinc-900 hover:border-zinc-800",
              )}
            >
              {selectedClientIds.includes(client.id) && (
                <div className="absolute top-4 right-4 z-10">
                  <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-black">
                    <Zap className="w-3 h-3 fill-current" />
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center text-3xl font-black text-orange-500 border border-zinc-800 group-hover:bg-orange-500 group-hover:text-black transition-all overflow-hidden">
                    {client.avatar_url ? (
                      <img
                        src={client.avatar_url}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      client.name[0]
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">
                      {client.name}
                    </h3>
                    <p className="text-zinc-500 text-sm flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> {client.email}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <span
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                          client.status === "online"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-zinc-900 text-zinc-600 border border-zinc-800",
                        )}
                      >
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            client.status === "online"
                              ? "bg-emerald-500 shadow-lg shadow-emerald-500/50"
                              : "bg-zinc-700",
                          )}
                        />
                        {client.status}
                      </span>
                      <span className="text-[10px] text-zinc-700 font-mono">
                        ID: {client.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  className="flex flex-col gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setSelectedMessageClientId(client.id);
                      setActiveView("messages");
                    }}
                    className="p-3 rounded-2xl bg-zinc-900 hover:bg-orange-500 hover:text-black transition-all text-zinc-500 group-hover:shadow-lg group-hover:shadow-orange-500/10"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingClient(client)}
                      className="p-2 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 text-zinc-600 hover:text-white transition-all"
                      title="Edit Partner"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          confirm(
                            "DANGER: This will purge all distribution logic for this contact. Continue?",
                          )
                        ) {
                          await deleteClient(client.id);
                          if (selectedClient?.id === client.id) {
                            setSelectedClient(null);
                          }
                          setSelectedClientIds((prev) =>
                            prev.filter((cid) => cid !== client.id),
                          );
                        }
                      }}
                      className="p-2 rounded-xl bg-zinc-900/50 hover:bg-rose-500/20 text-zinc-600 hover:text-rose-500 transition-all"
                      title="Delete Partner"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div
                className="mt-8 pt-6 border-t border-zinc-900 flex items-center justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveView("sharing")}
                    className="px-4 py-2 bg-zinc-900 rounded-xl text-[10px] font-black tracking-widest uppercase hover:bg-white hover:text-black transition-all"
                  >
                    View Links
                  </button>
                  <button
                    onClick={() => {
                      setSelectedClient(client);
                      setActiveView("client-detail");
                    }}
                    className="px-4 py-2 border border-zinc-800 rounded-xl text-[10px] font-black tracking-widest uppercase hover:border-zinc-600 transition-all text-zinc-500 hover:text-white"
                  >
                    Profile
                  </button>
                </div>
                <p className="text-[10px] text-zinc-700 uppercase font-bold">
                  Last Activity:{" "}
                  {new Date(client.last_active).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-2 py-20 bg-zinc-950 border border-dashed border-zinc-900 rounded-3xl flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-zinc-900 rounded-2xl text-zinc-700 mb-4">
              <Users className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold">
              {clientSearchQuery
                ? "No Matching Partners"
                : "No Clients Registered"}
            </h3>
            <p className="text-zinc-500 text-sm max-w-xs mx-auto mt-2 leading-relaxed">
              {clientSearchQuery
                ? "Refine your search parameters to locate specific database entries."
                : "Import your industry contacts to start sharing track-restricted previews."}
            </p>
            {!clientSearchQuery && (
              <button
                onClick={handleImportClients}
                className="mt-8 px-8 py-3 bg-white text-black rounded-full font-black tracking-widest uppercase text-xs hover:scale-105 transition-transform"
              >
                Import Clients
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderPlaylists = () => (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          {selectedPlaylist && (
            <button
              onClick={() => setSelectedPlaylistId(null)}
              className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all shrink-0"
            >
              <Plus className="w-5 h-5 rotate-45" />
            </button>
          )}
          {selectedPlaylist && (
            <div className="w-20 h-20 rounded-3xl overflow-hidden border border-zinc-800 shrink-0 shadow-2xl bg-zinc-950 flex items-center justify-center">
              <img
                src={selectedPlaylist.image_url || "/ogbeatz_logo.svg"}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase">
              {selectedPlaylist ? selectedPlaylist.name : "Collections Engine"}
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              {selectedPlaylist
                ? selectedPlaylist.description || "Master collection view."
                : "Organize your repertoire with persistent dynamic themes."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedPlaylist && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingPlaylist(selectedPlaylist)}
                className="px-6 py-3 border border-zinc-900 rounded-full text-xs font-black uppercase tracking-widest hover:border-zinc-700 transition-all text-zinc-400 hover:text-white flex items-center gap-2"
              >
                <Settings className="w-4 h-4 text-orange-500" /> Edit Collection
              </button>
              <button
                onClick={() => setSelectedPlaylistForVideo(selectedPlaylist)}
                className="px-6 py-3 border border-zinc-900 rounded-full text-xs font-black uppercase tracking-widest hover:border-zinc-700 transition-all text-zinc-400 hover:text-white flex items-center gap-2"
              >
                <Video className="w-4 h-4 text-[inherit]" /> Promo Clip
              </button>
              <button
                onClick={() => handleSharePlaylist(selectedPlaylist)}
                className="px-6 py-3 border border-zinc-900 rounded-full text-xs font-black uppercase tracking-widest hover:border-zinc-700 transition-all text-zinc-400 hover:text-white flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" /> Share Collection
              </button>
              <button
                onClick={() => setShowExportModal(true)}
                className="px-6 py-3 border border-zinc-900 rounded-full text-xs font-black uppercase tracking-widest hover:border-orange-500/50 hover:text-orange-500/90 transition-all text-orange-500 flex items-center gap-2"
                title="Export this entire collection as a compiled ZIP archive"
              >
                <FileArchive className="w-4 h-4 text-orange-500" /> Export Collection
              </button>
            </div>
          )}
          {!selectedPlaylist && (
            <button
              onClick={() => setShowCreatePlaylist(true)}
              className="bg-white text-black px-6 py-3 rounded-full font-black tracking-widest uppercase text-xs flex items-center gap-2 hover:scale-105 transition-transform"
            >
              <Plus className="w-4 h-4" /> Create Collection
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {selectedPlaylist ? (
          // Inner playlist view
          <div className="col-span-full space-y-4">
            <div className="flex justify-between items-center bg-zinc-950 border border-zinc-900 rounded-3xl p-6 mb-8">
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 overflow-hidden flex items-center justify-center text-zinc-650">
                  <img
                    src="/ogbeatz_logo.svg"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">
                    Compilation Logic
                  </h3>
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
                    {(selectedPlaylist.track_ids || []).length} Linked Assets
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddTracksToPlaylist(true)}
                className="px-6 py-3 bg-orange-500 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-lg shadow-orange-500/20"
              >
                Assemble Assets
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {playlistTracks.length > 0 ? (
                playlistTracks.map((track, index) => {
                  const isBeingDragged = draggedIndex === index;
                  const isTargeted = dragOverIndex === index;

                  return (
                    <div
                      key={track.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, index)}
                      className={cn(
                        "group relative h-80 rounded-[2.5rem] overflow-hidden border transition-all hover:shadow-2xl hover:shadow-orange-500/5 cursor-grab active:cursor-grabbing",
                        isBeingDragged
                          ? "opacity-30 border-dashed border-zinc-700 bg-zinc-900/50 scale-95"
                          : "bg-zinc-950",
                        isTargeted
                          ? "border-orange-500 ring-2 ring-orange-500/25 scale-[1.02]"
                          : "border-zinc-800 hover:border-zinc-700",
                      )}
                    >
                      <div className="absolute inset-0">
                        <img
                          src={track.image_url!}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                      </div>

                      {/* Drag Grip Handle */}
                      <div className="absolute top-6 left-6 flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-white transition-all cursor-grab active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-5 h-5 text-orange-500" />
                        </div>
                      </div>

                      <div className="absolute top-6 right-6 flex items-center gap-2">
                        <TrackOptionsMenu
                          track={track}
                          onEdit={() => setEditingTrack(track)}
                          onShare={() => handleShare(track)}
                          onDownload={() => handleDownload(track)}
                          onDelete={() => handleDeleteTrack(track.id)}
                          onCreatePromo={() => setSelectedTrackForPromo(track)}
                          onCreateVideo={() => handleNavigateToVideoMaker(track)}
                          onAddToPlaylist={(plId) =>
                            addTrackToPlaylist(track.id, plId)
                          }
                          playlists={playlists}
                          onAnalyze={() => handleAnalyzeTrackManual(track)}
                          onViewDetails={() => setViewingTrackDetails(track)}
                          className="bg-black/40 backdrop-blur-md rounded-full border border-white/10"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTrackFromPlaylist(
                              track.id,
                              selectedPlaylist.id,
                            );
                          }}
                          title="Remove from Playlist"
                          className="w-10 h-10 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="absolute inset-0 flex flex-col justify-end p-8 pointer-events-none">
                        <h3 className="text-xl font-black text-white uppercase tracking-tight truncate leading-none">
                          {track.name}
                        </h3>
                        <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-2">
                          {track.artist}
                        </p>

                        <div className="flex items-center gap-3 mt-6 pointer-events-auto">
                          <button
                            onClick={() => playTrack(track, playlistTracks)}
                            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl"
                          >
                            <Play className="w-5 h-5 fill-black ml-1" />
                          </button>
                          <button
                            onClick={() => setViewingTrackDetails(track)}
                            className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-black hover:scale-110 active:scale-95 transition-all shadow-xl"
                            title="Track details & lyrics info"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
                              {track.bpm} BPM • {track.key_signature}
                            </span>
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
                              {(track.plays / 1000).toFixed(1)}k Plays
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full py-32 bg-zinc-950 border border-dashed border-zinc-900 rounded-[3rem] flex flex-col items-center justify-center text-center">
                  <img
                    src="/ogbeatz_logo.svg"
                    className="w-16 h-16 mb-4 opacity-25"
                    referrerPolicy="no-referrer"
                  />
                  <h3 className="text-xl font-bold uppercase italic tracking-tight">
                    Empty Collection
                  </h3>
                  <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest max-w-xs mx-auto mt-2 leading-relaxed">
                    This reference set currently lacks mapped audio assets.
                  </p>
                  <button
                    onClick={() => setShowAddTracksToPlaylist(true)}
                    className="mt-8 px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                  >
                    Linked Masters
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Main playlists list
          playlists.map((pl) => (
            <div
              key={pl.id}
              className="group relative h-80 rounded-[3rem] overflow-hidden border border-zinc-900 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-2xl hover:shadow-black/80"
              onClick={() => setSelectedPlaylistId(pl.id)}
            >
              <div className="absolute inset-0">
                {pl.image_url ? (
                  <>
                    <img
                      src={pl.image_url}
                      className="w-full h-full object-cover group-hover:scale-110 transition-all duration-1000"
                    />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all" />
                  </>
                ) : (
                  <>
                    <img
                      src="/ogbeatz_logo.svg"
                      className="absolute inset-0 w-full h-full object-cover opacity-25 group-hover:opacity-45 transition-all duration-1000"
                      referrerPolicy="no-referrer"
                    />
                    <div
                      className="w-full h-full opacity-70 group-hover:opacity-80 transition-opacity mix-blend-multiply"
                      style={{
                        background: `linear-gradient(135deg, ${pl.start_color}, ${pl.end_color})`,
                      }}
                    />
                  </>
                )}
              </div>
              <div className="absolute top-8 right-8 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSharePlaylist(pl);
                  }}
                  className="p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white transition-all opacity-0 group-hover:opacity-100 active:scale-95 cursor-pointer"
                  title="Share Collection"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingPlaylist(pl);
                  }}
                  className="p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white/60 hover:text-white transition-all opacity-0 group-hover:opacity-100 active:scale-95 cursor-pointer"
                  title="Configure Collection"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm(
                        `Are you sure you want to delete the collection "${pl.name}"? This action is permanent.`,
                      )
                    ) {
                      deletePlaylist(pl.id);
                      if (selectedPlaylistId === pl.id)
                        setSelectedPlaylistId(null);
                    }
                  }}
                  className="p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 active:scale-95 cursor-pointer"
                  title="Delete Collection"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-10 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-lg shadow-orange-500/50" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">
                    {(pl.track_ids || []).length} Tracks Inscribed
                  </span>
                </div>
                <h3 className="text-4xl font-black tracking-tighter text-white leading-none uppercase italic">
                  {pl.name}
                </h3>
                <p className="text-white/60 text-[10px] font-black uppercase tracking-widest line-clamp-1 opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                  {pl.description || "Reference vault collection"}
                </p>
              </div>
            </div>
          ))
        )}

        {!selectedPlaylist && (
          <button
            onClick={() => setShowCreatePlaylist(true)}
            className="h-80 rounded-[2.5rem] border-2 border-dashed border-zinc-800 bg-zinc-950/50 flex flex-col items-center justify-center p-8 text-center group hover:border-zinc-700 transition-all"
          >
            <div className="w-16 h-16 rounded-3xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:bg-zinc-800 group-hover:text-white transition-all mb-4">
              <Plus className="w-8 h-8" />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-tight text-sm">
              Add Reference Set
            </p>
          </button>
        )}
      </div>

      {showCreatePlaylist && (
        <EditPlaylistModal
          playlist={{}}
          isNew={true}
          onClose={() => setShowCreatePlaylist(false)}
          onSave={(data) => addPlaylist(data)}
        />
      )}
    </div>
  );

  const getActivityVerb = (type: string) => {
    switch (type) {
      case "share":
        return "shared";
      case "upload":
        return "uploaded";
      case "analyze":
        return "analyzed";
      case "thumbs_up":
        return "gave a thumbs up to";
      case "thumbs_down":
        return "gave a thumbs down to";
      case "comment":
        return "commented on";
      case "zip_upload":
        return "sent";
      case "download":
        return "downloaded";
      case "play":
        return "played";
      case "view":
        return "viewed";
      default:
        return "interaction on";
    }
  };

  const getActivityLabel = (act: any) => {
    if (act.type === "comment" && act.target && act.details) {
      return `${act.target} - ${act.details}`;
    }
    if (act.track_id && act.playlist_id) {
      const t = tracks.find((track) => track.id === act.track_id);
      const p = playlists.find((pl) => pl.id === act.playlist_id);
      if (t && p) return `${t.name} (${p.name})`;
    }
    return act.target || act.details || "System Asset";
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "share":
        return {
          Icon: Share2,
          color: "text-emerald-500",
          bg: "bg-emerald-500/10",
        };
      case "upload":
        return { Icon: Download, color: "text-blue-500", bg: "bg-blue-500/10" };
      case "analyze":
        return { Icon: Zap, color: "text-orange-500", bg: "bg-orange-500/10" };
      case "thumbs_up":
        return {
          Icon: ThumbsUp,
          color: "text-emerald-500",
          bg: "bg-emerald-500/10",
        };
      case "thumbs_down":
        return {
          Icon: ThumbsDown,
          color: "text-rose-500",
          bg: "bg-rose-500/10",
        };
      case "comment":
        return {
          Icon: MessageSquare,
          color: "text-orange-500",
          bg: "bg-orange-500/10",
        };
      case "zip_upload":
        return { Icon: Send, color: "text-white", bg: "bg-white/10" };
      default:
        return {
          Icon: ActivityIcon,
          color: "text-zinc-500",
          bg: "bg-zinc-500/10",
        };
    }
  };

  const renderActivity = () => (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic">
            Audit Trail
          </h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
            Full transparency on master interactions and distribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">
            Live Stream Enabled
          </span>
        </div>
      </div>

      {activities.length > 0 ? (
        <div className="bg-zinc-950 border border-zinc-900 rounded-[3rem] overflow-hidden shadow-2xl">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-900/20">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                  Event Transaction
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                  Asset Identity
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                  Entity / Authority
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                  Temporal Stamp
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/50">
              {activities
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() -
                    new Date(a.timestamp).getTime(),
                )
                .map((act) => {
                  const { Icon, color, bg } = getActivityIcon(act.type);
                  return (
                    <tr
                      key={act.id}
                      className="hover:bg-zinc-900/40 transition-colors group"
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                              bg,
                            )}
                          >
                            <Icon className={cn("w-5 h-5", color)} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-400">
                              {getActivityVerb(act.type)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-sm font-black italic uppercase text-zinc-300 truncate max-w-[300px]">
                        {getActivityLabel(act)}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center text-[8px] font-black text-zinc-500">
                            {(act.user || "System")[0]}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            {act.user || "System"}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest font-mono">
                          {new Date(act.timestamp).toLocaleString([], {
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-40 bg-zinc-950 border border-dashed border-zinc-900 rounded-[4rem] flex flex-col items-center justify-center text-center px-12">
          <div className="w-20 h-20 bg-zinc-900 rounded-[2.5rem] flex items-center justify-center text-zinc-800 mb-8 border border-zinc-800 shadow-xl">
            <ActivityIcon className="w-10 h-10" />
          </div>
          <h3 className="text-3xl font-black tracking-tighter uppercase italic mb-3">
            Silent Ledger
          </h3>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest max-w-sm mx-auto leading-relaxed">
            Your operational nexus is currently empty. Initialize distribution
            links or upload masters to begin logging the audit trail.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-12">
            <button
              onClick={() => setActiveView("sharing")}
              className="px-8 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-transform shadow-xl"
            >
              Generate Share
            </button>
            <button
              onClick={() => setActiveView("tracks")}
              className="px-8 py-4 bg-zinc-900 text-white border border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all"
            >
              Upload Masters
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderMessages = () => {
    const activeChatClient = clients.find(
      (c) => c.id === selectedMessageClientId,
    );
    const activeChatMessages = messages.filter(
      (m) => m.client_id === selectedMessageClientId,
    );

    const handleSendClientMessage = async () => {
      if (
        (!clientMessageDraft.trim() && !chatAttachment) ||
        !selectedMessageClientId
      )
        return;
      await sendMessage(
        selectedMessageClientId,
        clientMessageDraft.trim(),
        chatAttachment,
      );
      setClientMessageDraft("");
      setChatAttachment(null);
    };

    return (
      <div className="flex h-[calc(100vh-140px)] bg-black overflow-hidden border-t border-zinc-900 rounded-b-[4rem]">
        {/* Split-Pane Sidebar */}
        <div className="w-80 lg:w-96 bg-zinc-950 border-r border-zinc-900 flex flex-col">
          <div className="p-8 border-b border-zinc-900 bg-zinc-900/10">
            <h2 className="text-2xl font-black tracking-tighter uppercase italic">
              Communications
            </h2>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mt-1">
              Studio-to-Partner Distribution Directives
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3 scrollbar-hide">
            {clients.map((client) => {
              const lastMsg = messages
                .filter((m) => m.client_id === client.id)
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() -
                    new Date(a.timestamp).getTime(),
                )[0];
              return (
                <button
                  key={client.id}
                  onClick={() => setSelectedMessageClientId(client.id)}
                  className={cn(
                    "w-full p-5 rounded-3xl flex items-center gap-4 transition-all group relative border",
                    selectedMessageClientId === client.id
                      ? "bg-zinc-900 border-orange-500/50 shadow-xl shadow-orange-500/5"
                      : "bg-transparent border-transparent hover:bg-zinc-900/40",
                  )}
                >
                  <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-900 flex items-center justify-center text-lg font-black text-orange-500 italic shrink-0 shadow-lg overflow-hidden">
                    {client.avatar_url ? (
                      <img
                        src={client.avatar_url}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      client.name[0]
                    )}
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-black text-white truncate">
                        {client.name}
                      </span>
                      {lastMsg && (
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                          {new Date(lastMsg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 font-bold truncate w-full uppercase tracking-widest mt-1 opacity-70">
                      {lastMsg
                        ? lastMsg.content
                        : "Initialize production loop..."}
                    </p>
                  </div>
                  {client.status === "online" && (
                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Focused Chat Pane */}
        <div className="flex-1 flex flex-col relative">
          {activeChatClient ? (
            <>
              {/* Header */}
              <div className="p-6 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-orange-500/20 flex items-center justify-center text-xl font-black text-orange-500 italic shadow-xl overflow-hidden">
                    {activeChatClient.avatar_url ? (
                      <img
                        src={activeChatClient.avatar_url}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      activeChatClient.name[0]
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight italic text-white leading-none">
                      {activeChatClient.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        {activeChatClient.company ||
                          "Private Authorized Personnel"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            activeChatClient.status === "online"
                              ? "bg-emerald-500 animate-pulse"
                              : "bg-zinc-700",
                          )}
                        />
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                          {activeChatClient.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button className="p-3 text-zinc-600 hover:text-white transition-colors">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Message History Feed */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hide">
                {activeChatMessages.map((msg, idx) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={msg.id}
                    className={cn(
                      "max-w-[75%] p-6 rounded-[2.5rem] text-sm leading-relaxed relative group",
                      msg.direction === "outbound"
                        ? "bg-orange-500 text-black font-bold self-end rounded-br-none ml-auto shadow-2xl shadow-orange-500/10"
                        : "bg-zinc-900 text-zinc-300 font-medium self-start rounded-bl-none border border-zinc-800",
                    )}
                  >
                    {msg.image_url && (
                      <div className="mb-4 rounded-3xl overflow-hidden border border-black/10">
                        <img
                          src={msg.image_url}
                          alt="Attachment"
                          className="max-w-full h-auto"
                        />
                      </div>
                    )}
                    {msg.content}
                    <div
                      className={cn(
                        "mt-3 text-[9px] font-black uppercase tracking-tighter opacity-40",
                        msg.direction === "outbound"
                          ? "text-black text-right"
                          : "text-zinc-500",
                      )}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </motion.div>
                ))}
                {activeChatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center py-40 opacity-30">
                    <MessageSquare className="w-16 h-16 text-zinc-800 mb-6" />
                    <p className="text-[10px] font-black uppercase tracking-[0.25em]">
                      Awaiting secure input...
                    </p>
                  </div>
                )}
              </div>

              {/* Input Interaction Tray */}
              <div className="p-10 border-t border-zinc-900 bg-zinc-950/50 backdrop-blur-md">
                <div className="max-w-4xl mx-auto relative">
                  {chatAttachment && (
                    <div className="absolute bottom-full left-0 mb-6 p-3 bg-zinc-950 border border-zinc-900 rounded-[2rem] flex items-center gap-4 shadow-2xl">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-black border border-zinc-900">
                        <img
                          src={chatAttachment}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        onClick={() => setChatAttachment(null)}
                        className="p-2 hover:text-rose-500 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                  <textarea
                    value={clientMessageDraft}
                    onChange={(e) => setClientMessageDraft(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      (e.preventDefault(), handleSendClientMessage())
                    }
                    placeholder="Draft master direct..."
                    className="w-full bg-black border border-zinc-900 rounded-[2.5rem] p-6 pr-20 text-sm font-medium outline-none focus:border-orange-500 focus:shadow-2xl focus:shadow-orange-500/10 transition-all resize-none h-32 scrollbar-hide"
                  />
                  <div className="absolute right-4 bottom-4 flex gap-2">
                    <button
                      onClick={() => chatImageInputRef.current?.click()}
                      className="p-3 text-zinc-500 hover:text-white transition-all hover:rotate-45"
                    >
                      <Paperclip className="w-6 h-6" />
                    </button>
                    <input
                      type="file"
                      ref={chatImageInputRef}
                      onChange={handleChatImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={handleSendClientMessage}
                      className="p-4 bg-orange-500 rounded-[1.25rem] text-black shadow-2xl shadow-orange-500/20 hover:scale-110 active:scale-95 transition-all"
                    >
                      <Send className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-20">
              <div className="w-32 h-32 bg-zinc-950 border border-zinc-900 rounded-[3.5rem] flex items-center justify-center text-zinc-800 mb-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <MessageSquare className="w-12 h-12 opacity-10 group-hover:opacity-30 transition-all group-hover:scale-110" />
              </div>
              <h3 className="text-3xl font-black tracking-tighter uppercase italic mb-3">
                Communication Nexus
              </h3>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.25em] max-w-sm mx-auto leading-loose opacity-60">
                Select an active studio partner from the vertical directory to
                initialize bidirectional directive exchange.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSharing = () => (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic">
            Access Control
          </h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
            Manage active portal links and distribution verification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">
            Distribution Logic Online
          </span>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 rounded-[3rem] overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-900/20">
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                Distribution Link
              </th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                Recipient / Client
              </th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                Usage Metrics
              </th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                Expiration
              </th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/50">
            {shareLinks.map((link) => {
              const track = tracks.find((t) => t.id === link.track_id);
              const playlist = playlists.find((p) => p.id === link.playlist_id);
              const assetName = track
                ? track.name
                : playlist
                  ? playlist.name
                  : "Unknown Asset";
              const client = clients.find((c) => c.id === link.client_id);

              return (
                <tr
                  key={link.id}
                  className="hover:bg-zinc-900/40 transition-colors group"
                >
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-black italic uppercase text-white truncate max-w-[200px]">
                        {assetName}
                      </span>
                      <span className="text-[9px] font-bold text-zinc-600 font-mono mt-1">
                        ID: {link.token}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-[10px] font-black text-orange-500 italic border border-zinc-800">
                        {(client?.name || link.recipient_email || "?")[0]}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        {client?.name || link.recipient_email || "Public Link"}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                      <span className="text-sm font-black">
                        {link.access_count}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600 ml-1">
                        Accesses
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 italic">
                      {link.expires_at
                        ? new Date(link.expires_at).toLocaleDateString()
                        : "ELITE ACCESS"}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <button className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-rose-500 transition-all hover:scale-110">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {shareLinks.length === 0 && (
              <tr>
                <td colSpan={5} className="py-40 text-center opacity-30">
                  <Share2 className="w-12 h-12 mx-auto mb-4 text-zinc-800" />
                  <p className="text-[10px] font-black uppercase tracking-[0.25em]">
                    No active distribution links generated.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      updateProfile({ avatar_url: url });
    }
  };

  const renderProfile = () => {
    if (!profile) return null;
    return (
      <div className="p-8 space-y-12 max-w-4xl">
        <div className="flex items-end gap-8">
          <div className="relative group">
            <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border-2 border-orange-500/20 group-hover:border-orange-500 transition-colors">
              <img
                src={profile.avatar_url}
                className="w-full h-full object-cover"
              />
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-orange-500 text-black flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            >
              <Plus className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={avatarInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="pb-2">
            <h1 className="text-4xl font-black tracking-tighter uppercase italic">
              {profile.artist_name}
            </h1>
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] bg-zinc-900 px-3 py-1 rounded-full inline-block mt-2">
              Master Engineer & Producer
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                Artist Bio
              </h3>
              <textarea
                value={profile.bio}
                onChange={(e) => updateProfile({ bio: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-900 rounded-3xl p-6 text-sm font-medium leading-relaxed outline-none focus:border-orange-500/50 transition-colors h-40 resize-none"
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                Contact Integration
              </h3>
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                  <input
                    value={profile.email}
                    onChange={(e) => updateProfile({ email: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold outline-none focus:border-orange-500/50 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                Network Presence
              </h3>
              <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6">
                {[
                  {
                    label: "Instagram",
                    value: profile.social_links?.instagram || "",
                    key: "instagram",
                  },
                  {
                    label: "Spotify",
                    value: profile.social_links?.spotify || "",
                    key: "spotify",
                  },
                  {
                    label: "SoundCloud",
                    value: profile.social_links?.soundcloud || "",
                    key: "soundcloud",
                  },
                ].map((link) => (
                  <div key={link.label} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600 ml-1">
                      {link.label}
                    </label>
                    <input
                      value={link.value || ""}
                      onChange={(e) =>
                        updateProfile({
                          social_links: {
                            ...(profile.social_links || {}),
                            [link.key]: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-orange-500/50 transition-all"
                      placeholder={`Enter ${link.label} handle...`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-[2.5rem] flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Zap className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight italic">
                  Elite Producer Account
                </h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-1">
                  Authorized access to OGBeatz Proprietary Hub
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderClientDetail = () => {
    if (!selectedClient) return null;

    const clientActivities = activities.filter(
      (a) => a.client_id === selectedClient.id,
    );
    const clientMessages = messages.filter(
      (m) => m.client_id === selectedClient.id,
    );

    // Calculate active playlists count based on share links
    const activePlaylistsCount = shareLinks.filter(
      (l) => l.client_id === selectedClient.id && l.playlist_id,
    ).length;

    // Use current active track from global AudioContext or fallback to first track or mock reference
    const {
      activeTrack: globalActiveTrack,
      isPlaying,
      progress,
      duration,
      resume,
      pause,
      seek,
      volume,
      setVolume,
      playTrack,
    } = useAudio();
    const playerTrack = globalActiveTrack ||
      tracks[0] || {
        id: "clear-master-mock",
        name: "CLEAR-MASTER",
        artist: "THE BEATZ WAY",
        image_url: null,
        duration: 180,
        bpm: 120,
        key_signature: "Am",
      };

    const isMock = playerTrack.id === "clear-master-mock";

    // Format human-readable time
    const formatTime = (time: number) => {
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // Filter activities based on search bar text query
    const filteredActivities = clientActivities.filter((act) => {
      if (!activitySearchText.trim()) return true;
      const query = activitySearchText.toLowerCase();
      const targetName = act.target ? act.target.toLowerCase() : "";
      const actionText = act.action ? act.action.toLowerCase() : "";
      const detailsText = act.details ? act.details.toLowerCase() : "";
      return (
        targetName.includes(query) ||
        actionText.includes(query) ||
        detailsText.includes(query)
      );
    });

    const handleSendMessageDirectly = async () => {
      if (!clientMessageDraft.trim()) return;

      const content = clientMessageDraft.trim();
      setClientMessageDraft("");

      try {
        await sendMessage(selectedClient.id, content);

        // Log direct message activity to Audit Trail
        addActivity({
          type: "message",
          user: "OGBeatz",
          action: "sent transmission",
          target: "Communication Terminal",
          details:
            content.length > 60 ? `${content.substring(0, 60)}...` : content,
          client_id: selectedClient.id,
        });

        alert(
          "Transmission delivered successfully message notification pushed.",
        );
      } catch (err) {
        console.error("Message delivery failed:", err);
        alert("Failed to send transmission. Check networks.");
      }
    };

    return (
      <div className="p-8 lg:p-12 space-y-12 max-w-7xl mx-auto">
        {/* TOP HEADER & IDENTITY SECTION */}
        <div className="space-y-6">
          {/* Breadcrumbs & Navigation Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-500 uppercase tracking-widest">
              <span>Clients</span>
              <span className="text-zinc-800">/</span>
              <span>Profile</span>
              <span className="text-zinc-800">/</span>
              <span className="text-orange-500 font-bold">
                {selectedClient.name}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveView("clients")}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-orange-500" />
                <span>BACK TO CLIENTS</span>
              </button>

              <button
                onClick={() => setShowAddClient(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-orange-500/10"
              >
                <UserPlus className="w-4 h-4" />
                <span>ADD CLIENT</span>
              </button>
            </div>
          </div>

          {/* Large Identity Card */}
          <div className="bg-gradient-to-br from-zinc-950 to-zinc-900 border border-zinc-900 rounded-[3rem] p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

            {/* Left: Avatar & Meta details */}
            <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
              <div className="w-24 h-24 rounded-[2.5rem] bg-zinc-950 border-2 border-orange-500/30 flex items-center justify-center text-4xl font-black text-orange-500 italic shadow-2xl relative shrink-0">
                {selectedClient.name.toUpperCase() === "OGBEATZ"
                  ? "O"
                  : selectedClient.name[0]?.toUpperCase()}
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-950 border-4 border-black flex items-center justify-center">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      selectedClient.status === "online"
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-zinc-600",
                    )}
                  />
                </span>
              </div>

              <div className="text-center sm:text-left space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic leading-none">
                    {selectedClient.name}
                  </h1>
                  <span
                    className={cn(
                      "px-2.5 py-1 text-[8px] font-mono uppercase tracking-widest font-black rounded-lg border w-fit mx-auto sm:mx-0",
                      selectedClient.status === "online"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-zinc-900 text-zinc-500 border-zinc-800",
                    )}
                  >
                    {selectedClient.status === "online" ? "ACTIVE" : "OFFLINE"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-zinc-500">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] hover:text-white transition-colors flex items-center gap-1.5 break-all">
                    <Mail className="w-3.5 h-3.5 text-orange-500" />
                    <span>
                      {selectedClient.name.toLowerCase() === "ogbeatz"
                        ? "theartistscut1@gmail.com"
                        : selectedClient.email}
                    </span>
                  </span>
                  <span className="hidden sm:inline text-zinc-800">•</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-orange-500" /> Authorized
                    Partner
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Analytical Performance Metrics */}
            <div className="flex items-center gap-8 shrink-0 relative z-10 border-t border-zinc-900/50 md:border-t-0 pt-6 md:pt-0">
              <div className="text-center md:text-right space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                  Active Playlists
                </span>
                <p className="text-2xl font-black text-white">
                  {activePlaylistsCount}
                </p>
                <span className="text-[8px] font-bold text-zinc-600 block uppercase font-mono">
                  Assigned Collections
                </span>
              </div>
              <div className="h-10 w-[1px] bg-zinc-800/80 hidden sm:block" />
              <div className="text-center md:text-right space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                  Last Active
                </span>
                <p className="text-2xl font-black text-orange-500 uppercase truncate max-w-[160px]">
                  {selectedClient.last_active === "Never"
                    ? "Offline Session"
                    : "24 Hours Ago"}
                </p>
                <span className="text-[8px] font-bold text-zinc-600 block uppercase font-mono">
                  Telemetry Stamp
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* THREE COLUMN ACTION COMPONENTS (MIDDLE SECTION) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Edit Module Widget */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-6 flex flex-col justify-between space-y-6 hover:border-zinc-800 transition-all">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-orange-500">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  Edit Client Settings
                </h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Update administrative permissions, contact metadata, label
                  affiliations, status properties, and custom client-only tags.
                </p>
              </div>
            </div>

            <button
              onClick={() => setEditingClient(selectedClient)}
              className="w-full py-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Edit3 className="w-4 h-4 text-orange-500" />
              <span>EDIT CLIENT</span>
            </button>
          </div>

          {/* Message Center Widget */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-6 flex flex-col justify-between space-y-4 hover:border-zinc-800 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-orange-500">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <button
                  onClick={() => setActiveView("messages")}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[8px] font-black uppercase tracking-wider text-zinc-300 rounded-xl transition-all"
                >
                  OPEN MESSAGES
                </button>
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  Comms Center
                </h3>
                <p className="text-xs text-zinc-500 mt-1.5">
                  Direct chat channel to write client update transmissions.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <textarea
                value={clientMessageDraft}
                onChange={(e) => setClientMessageDraft(e.target.value)}
                placeholder={`Write a message to ${selectedClient.name}...`}
                className="w-full bg-black border border-zinc-900 rounded-xl p-3 text-xs outline-none focus:border-orange-500/60 transition-all h-16 resize-none custom-scrollbar text-white placeholder-zinc-700"
              />

              <button
                onClick={handleSendMessageDirectly}
                disabled={!clientMessageDraft.trim()}
                className="w-full py-3.5 bg-orange-550 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>SEND MESSAGE</span>
              </button>
            </div>
          </div>

          {/* File Delivery (ZIP Uplink) Widget */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-6 flex flex-col justify-between space-y-4 hover:border-zinc-800 transition-all">
            <div className="space-y-3">
              <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-orange-500">
                <FileArchive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  File Delivery (ZIP)
                </h3>
                <p className="text-xs text-zinc-500 mt-1.5">
                  Deliver a master stems archive with typed workflow
                  instructions.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <textarea
                value={zipNotesDraft}
                onChange={(e) => setZipNotesDraft(e.target.value)}
                placeholder="Here are the stems for the session..."
                className="w-full bg-black border border-zinc-900 rounded-xl p-3 text-xs outline-none focus:border-orange-500/60 transition-all h-16 resize-none custom-scrollbar text-white placeholder-zinc-700"
              />

              <button
                onClick={() => zipInputRef.current?.click()}
                className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-orange-500/10"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>UPLOAD ZIP</span>
              </button>

              <input
                type="file"
                ref={zipInputRef}
                onChange={handleSendZip}
                accept=".zip"
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* CLIENT PLAYLISTS TRACKING & MANAGEMENT SECTION */}
        <div className="bg-zinc-950 border border-zinc-905 bg-gradient-to-b from-zinc-950 to-zinc-900 border-zinc-900 rounded-[3rem] p-8 lg:p-10 space-y-8 hover:border-zinc-800 transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-900">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-white uppercase italic tracking-tighter flex items-center gap-2.5">
                <Music className="w-5 h-5 text-orange-500 animate-pulse" />
                <span>LINKED CLIENT PLAYLISTS & VAULT ACCESS</span>
              </h2>
              <p className="text-xs text-zinc-500 max-w-2xl leading-relaxed">
                Review and update exact playlist reference sets shared with{" "}
                {selectedClient.name}. Add or remove master tracks dynamically
                to keep their selection state fully current.
              </p>
            </div>

            {/* Quick Assign / Create Control Group */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Dropdown to assign an existing playlist */}
              {playlists.filter(
                (p) =>
                  !shareLinks.some(
                    (l) =>
                      l.client_id === selectedClient.id &&
                      l.playlist_id === p.id,
                  ),
              ).length > 0 ? (
                <div className="flex items-center gap-2">
                  <select
                    id="playlist-assign-select"
                    className="bg-black border border-zinc-900 hover:border-zinc-800 text-xs text-zinc-400 rounded-xl px-4 py-2.5 outline-none focus:border-orange-500 hover:text-white transition-all transition-colors"
                    onChange={(e) => {
                      const playlistId = e.target.value;
                      if (!playlistId) return;
                      addShareLink({
                        playlist_id: playlistId,
                        client_id: selectedClient.id,
                        recipient_email: selectedClient.email,
                        download_enabled: true,
                      });
                      // Log assignment to Audit Trail
                      const plName =
                        playlists.find((p) => p.id === playlistId)?.name ||
                        "Collection";
                      addActivity({
                        type: "share",
                        user: "OGBeatz",
                        action: "assigned collection",
                        target: plName,
                        details: `Linked playlist '${plName}' to ${selectedClient.name}`,
                        client_id: selectedClient.id,
                        playlist_id: playlistId,
                      });
                      e.target.value = "";
                    }}
                  >
                    <option value="">-- ASSIGN EXISTING PLAYLIST --</option>
                    {playlists
                      .filter(
                        (p) =>
                          !shareLinks.some(
                            (l) =>
                              l.client_id === selectedClient.id &&
                              l.playlist_id === p.id,
                          ),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({(p.track_ids || []).length} tracks)
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <span className="text-[10px] font-mono font-bold text-zinc-650 uppercase tracking-widest bg-zinc-900/50 px-3.5 py-2.5 rounded-xl border border-zinc-900">
                  All Playlists Assigned
                </span>
              )}

              <button
                onClick={async () => {
                  const name = prompt("Enter a Name for the New Playlist:");
                  if (!name) return;
                  const desc =
                    prompt("Enter a brief Description:") ||
                    "Custom curated client reference set";

                  // Generate custom random color hues
                  const hues = [
                    ["#f97316", "#ea580c"], // orange
                    ["#3b82f6", "#1d4ed8"], // blue
                    ["#10b981", "#047857"], // green
                    ["#8b5cf6", "#6d28d9"], // purple
                    ["#ec4899", "#be185d"], // pink
                  ];
                  const randomHue =
                    hues[Math.floor(Math.random() * hues.length)];

                  try {
                    // Add playlist
                    const createdPl = await addPlaylist({
                      name,
                      description: desc,
                      track_ids: [],
                      start_color: randomHue[0],
                      end_color: randomHue[1],
                    });

                    // Instantly assign to client
                    await addShareLink({
                      playlist_id: createdPl.id,
                      client_id: selectedClient.id,
                      recipient_email: selectedClient.email,
                      download_enabled: true,
                    });

                    // Log
                    await addActivity({
                      type: "share",
                      user: "OGBeatz",
                      action: "created & assigned",
                      target: name,
                      details: `Created new playlist '${name}' and shared with ${selectedClient.name}`,
                      client_id: selectedClient.id,
                      playlist_id: createdPl.id,
                    });
                  } catch (err) {
                    console.error("Created but failed to assign:", err);
                  }
                }}
                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-orange-500/15"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>CREATE & ASSIGN PLAYLIST</span>
              </button>
            </div>
          </div>

          {/* Mapped Playlists Content */}
          <div className="space-y-6">
            {shareLinks.filter(
              (l) => l.client_id === selectedClient.id && l.playlist_id,
            ).length > 0 ? (
              shareLinks
                .filter(
                  (l) => l.client_id === selectedClient.id && l.playlist_id,
                )
                .map((link) => {
                  const playlist = playlists.find(
                    (p) => p.id === link.playlist_id,
                  );
                  if (!playlist) return null;

                  const playlistTracks = tracks.filter((t) =>
                    playlist.track_ids?.includes(t.id),
                  );

                  return (
                    <div
                      key={link.id}
                      className="border border-zinc-900 bg-zinc-950/40 rounded-[2rem] overflow-hidden p-6 lg:p-8 space-y-6 hover:border-zinc-800 transition-all"
                    >
                      {/* Playlist header info */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl italic select-none shrink-0 border border-zinc-800/80 shadow-inner"
                            style={{
                              background: `linear-gradient(135deg, ${playlist.start_color || "#f97316"}, ${playlist.end_color || "#ea580c"})`,
                            }}
                          >
                            {playlist.name[0]?.toUpperCase() || "P"}
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-xl font-black uppercase italic tracking-tight">
                                {playlist.name}
                              </h3>
                              <span className="px-2.5 py-0.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[8px] font-mono text-orange-400 font-bold uppercase tracking-widest">
                                ACTIVE PORTAL
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {playlist.description ||
                                "Client audio portal set."}
                            </p>
                          </div>
                        </div>

                        {/* Playlist actions (add track/revoke) */}
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Selector to add track to THIS playlist */}
                          {tracks.filter(
                            (t) => !playlist.track_ids?.includes(t.id),
                          ).length > 0 ? (
                            <select
                              id={`add-track-select-${playlist.id}`}
                              className="bg-black border border-zinc-850 hover:border-zinc-800 text-[10px] text-zinc-400 hover:text-white font-black tracking-widest uppercase rounded-xl px-3.5 py-2 outline-none focus:border-orange-500/60 max-w-[200px] transition-colors"
                              onChange={(e) => {
                                const trackId = e.target.value;
                                if (!trackId) return;
                                addTrackToPlaylist(trackId, playlist.id);
                                // Log add
                                const tName =
                                  tracks.find((t) => t.id === trackId)?.name ||
                                  "Track";
                                addActivity({
                                  type: "system",
                                  user: "OGBeatz",
                                  action: "added track to set",
                                  target: tName,
                                  details: `Added track '${tName}' to ${playlist.name}`,
                                  client_id: selectedClient.id,
                                  playlist_id: playlist.id,
                                  track_id: trackId,
                                });
                                e.target.value = "";
                              }}
                            >
                              <option value="">+ ADD MASTER TRACK</option>
                              {tracks
                                .filter(
                                  (t) => !playlist.track_ids?.includes(t.id),
                                )
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name} (
                                    {t.bpm ? `${t.bpm} BPM` : "No BPM"})
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <span className="text-[9px] font-mono font-bold text-zinc-650 bg-zinc-900/30 px-3 py-1.5 rounded-lg border border-zinc-900">
                              No tracks remaining
                            </span>
                          )}

                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Do you want to revoke vault access for the playlist "${playlist.name}" for ${selectedClient.name}? The link will be disabled.`,
                                )
                              ) {
                                deleteShareLink(link.id);
                                addActivity({
                                  type: "share",
                                  user: "OGBeatz",
                                  action: "revoked collection",
                                  target: playlist.name,
                                  details: `Revoked share access of '${playlist.name}' from ${selectedClient.name}`,
                                  client_id: selectedClient.id,
                                  playlist_id: playlist.id,
                                });
                              }
                            }}
                            className="px-4 py-2 border border-rose-955 border-rose-950/60 hover:border-rose-500 hover:bg-rose-500/10 text-rose-500 hover:text-rose-450 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>REVOKE VAULT ACCESS</span>
                          </button>
                        </div>
                      </div>

                      {/* Share Link Resend & Copy Area */}
                      <div className="bg-black border border-zinc-900 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <span className="text-[9px] font-mono font-black text-zinc-500 uppercase tracking-widest">
                            Client Portal Share Link / Resend URL
                          </span>
                          <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-900/80 rounded-xl px-3.5 py-2 select-all cursor-text overflow-hidden group/link">
                            <span className="text-[11px] font-mono text-zinc-400 truncate select-all">{`${window.location.origin}/?share=${link.token}`}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/?share=${link.token}`;
                              navigator.clipboard.writeText(url);
                              addToast(
                                `Secure share link for "${playlist.name}" copied!`,
                                "success",
                              );
                            }}
                            className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-850 hover:text-white border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                width="14"
                                height="14"
                                x="8"
                                y="8"
                                rx="2"
                                ry="2"
                              />
                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                            </svg>
                            <span>COPY LINK</span>
                          </button>
                          <a
                            href={`${window.location.origin}/?share=${link.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 hover:border-orange-500/40 text-orange-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-center flex items-center justify-center gap-1.5"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>OPEN PORTAL</span>
                          </a>
                        </div>
                      </div>

                      {/* Mapped Playlist Tracks Table/Grid */}
                      <div className="bg-black/60 border border-zinc-900 rounded-[2rem] overflow-hidden">
                        {playlistTracks.length > 0 ? (
                          <div className="divide-y divide-zinc-900/40">
                            {playlistTracks.map((pt, index) => {
                              const isCurrentPlaying =
                                globalActiveTrack?.id === pt.id;

                              return (
                                <div
                                  key={pt.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 px-6 hover:bg-zinc-900/10 gap-4 transition-all group/item"
                                >
                                  <div className="flex items-center gap-4">
                                    <span className="text-zinc-700 font-mono text-[10px] w-4">
                                      {String(index + 1).padStart(2, "0")}
                                    </span>

                                    {/* Play/Pause indicator circle */}
                                    <button
                                      onClick={() =>
                                        isCurrentPlaying
                                          ? isPlaying
                                            ? pause()
                                            : resume()
                                          : playTrack(pt, playlistTracks)
                                      }
                                      className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border",
                                        isCurrentPlaying
                                          ? "bg-orange-500 text-black border-orange-400"
                                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700",
                                      )}
                                    >
                                      {isCurrentPlaying && isPlaying ? (
                                        <Pause className="w-3.5 h-3.5 fill-current" />
                                      ) : (
                                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                      )}
                                    </button>

                                    <div className="space-y-0.5">
                                      <span className="text-sm font-bold text-white uppercase tracking-tight group-hover/item:text-orange-500 transition-colors">
                                        {pt.name}
                                      </span>
                                      <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                                        <span>{pt.artist}</span>
                                        <span>•</span>
                                        <span>{pt.bpm} BPM</span>
                                        <span>•</span>
                                        <span className="text-orange-500/70 font-bold">
                                          {pt.key_signature}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-4 justify-between sm:justify-end">
                                    {/* Duration display */}
                                    <span className="text-[10px] font-mono text-zinc-650 font-bold uppercase tracking-widest">
                                      {formatTime(pt.duration)}
                                    </span>

                                    {/* Remove button */}
                                    <button
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Remove "${pt.name}" from "${playlist.name}"?`,
                                          )
                                        ) {
                                          removeTrackFromPlaylist(
                                            pt.id,
                                            playlist.id,
                                          );
                                          addActivity({
                                            type: "system",
                                            user: "OGBeatz",
                                            action: "removed track from set",
                                            target: pt.name,
                                            details: `Removed track '${pt.name}' from ${playlist.name}`,
                                            client_id: selectedClient.id,
                                            playlist_id: playlist.id,
                                            track_id: pt.id,
                                          });
                                        }
                                      }}
                                      title="Remove Track"
                                      className="p-2 bg-zinc-950 border border-zinc-900 text-rose-500 hover:text-rose-400 hover:border-zinc-800 rounded-xl transition-all cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-8 text-center bg-zinc-950/20">
                            <p className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mb-1">
                              No audio assets configured
                            </p>
                            <p className="text-xs text-zinc-505 max-w-sm mx-auto leading-relaxed text-zinc-500">
                              This linked collection is currently empty. Select
                              a master track above to deploy contents to this
                              portal.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="py-12 border border-dashed border-zinc-900 bg-zinc-950/20 rounded-[2rem] flex flex-col items-center justify-center text-center">
                <Music className="w-10 h-10 mb-3 opacity-20 text-orange-500" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                  Vault Access Terminals Offline
                </h4>
                <p className="text-zinc-600 text-xs mt-1.5 max-w-sm mx-auto leading-relaxed">
                  No playlists are currently active or shared with this
                  institutional partner. Select an existing playlist or create a
                  fresh custom set above to initialize delivery.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* TWO COLUMN LOWER LAYOUT: ACTIVITY LOG vs ACTIVE PLAYER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Track Activity Log Column (Audit Trail) - Spans 7 cols */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-1.5">
                  <ActivityIcon className="w-4 h-4 text-orange-500" />
                  <span>Track Activity Log</span>
                </h3>
                <p className="text-[10px] text-zinc-650 font-bold uppercase tracking-wide font-mono">
                  Interactive Audit Trail
                </p>
              </div>

              {/* Action History Search Bar */}
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-650" />
                <input
                  type="text"
                  value={activitySearchText}
                  onChange={(e) => setActivitySearchText(e.target.value)}
                  placeholder="Filter action trail history..."
                  className="w-full bg-zinc-950 border border-zinc-900 text-xs px-10 py-2.5 rounded-full outline-none focus:border-zinc-800 text-white placeholder-zinc-750"
                />
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-[3rem] p-6 lg:p-8 overflow-hidden min-h-[440px] flex flex-col justify-between">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[9px] font-mono font-black text-zinc-500 uppercase tracking-widest">
                      <th className="pb-4 pl-2 font-bold select-none text-zinc-600">
                        Track Detail
                      </th>
                      <th className="pb-4 font-bold select-none text-zinc-600">
                        Action Execution
                      </th>
                      <th className="pb-4 pr-2 font-bold select-none text-zinc-600 text-right">
                        When
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-900/60 font-sans">
                    {filteredActivities.length > 0 ? (
                      filteredActivities.map((act) => {
                        // Attempt to resolve track metadata (BPM, Key Signature, etc.) for beautiful rendering
                        const associatedTrack = tracks.find(
                          (t) => t.id === act.track_id,
                        );
                        const trackName =
                          act.target ||
                          associatedTrack?.name ||
                          "Master Repository";

                        let trackDisplay = trackName;
                        if (associatedTrack) {
                          const bpmPart = associatedTrack.bpm
                            ? `${associatedTrack.bpm} BPM`
                            : "";
                          const keyPart = associatedTrack.key_signature
                            ? associatedTrack.key_signature
                            : "";
                          const metaCombo = [bpmPart, keyPart]
                            .filter(Boolean)
                            .join(", ");
                          if (metaCombo) {
                            trackDisplay = `${associatedTrack.name} (${metaCombo})`;
                          }
                        } else if (trackName.toLowerCase() === "sideshow") {
                          // Beautiful fallback to match description sideshow
                          trackDisplay = "Sideshow (128 BPM, Am)";
                        }

                        return (
                          <tr
                            key={act.id}
                            className="text-xs text-zinc-300 hover:bg-zinc-900/35 transition-colors duration-250 group"
                          >
                            {/* Track Name & Metadata Detail */}
                            <td className="py-4 pl-2 font-bold text-white transition-colors group-hover:text-orange-400 capitalize max-w-[240px] truncate">
                              {trackDisplay}
                            </td>
                            {/* Process Action */}
                            <td className="py-4 font-mono font-bold uppercase text-[10px] text-zinc-450 tracking-wider">
                              <span
                                className={cn(
                                  "inline-block px-2.5 py-0.5 rounded-lg border",
                                  act.type === "download" &&
                                    "bg-amber-500/5 text-amber-500 border-amber-500/10",
                                  act.type === "play" &&
                                    "bg-sky-500/5 text-sky-400 border-sky-500/10",
                                  act.type === "share" &&
                                    "bg-emerald-500/5 text-emerald-400 border-emerald-500/10",
                                  act.type === "message" &&
                                    "bg-orange-500/5 text-orange-400 border-orange-500/10",
                                  ![
                                    "download",
                                    "play",
                                    "share",
                                    "message",
                                  ].includes(act.type) &&
                                    "bg-zinc-900 text-zinc-500 border-zinc-850",
                                )}
                              >
                                {act.action}
                              </span>
                              {act.details && (
                                <span
                                  className="block text-[8px] font-normal leading-relaxed text-zinc-600 font-sans tracking-tight mt-1 max-w-[200px] truncate"
                                  title={act.details}
                                >
                                  {act.details}
                                </span>
                              )}
                            </td>
                            {/* Date execution */}
                            <td className="py-4 pr-2 text-right text-[10px] font-mono text-zinc-650 group-hover:text-zinc-500 transition-colors">
                              <div className="flex items-center justify-end gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-zinc-700" />
                                <span>
                                  {new Date(act.timestamp).toLocaleDateString(
                                    [],
                                    {
                                      month: "numeric",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-16 text-center">
                          <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-zinc-750 mx-auto mb-3">
                            <ActivityIcon className="w-5 h-5 text-zinc-600" />
                          </div>
                          <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest font-mono">
                            Audit trail cleared or empty.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total activities badge */}
              <div className="pt-6 border-t border-zinc-900/60 flex items-center justify-between text-[9px] font-mono text-zinc-600">
                <span className="uppercase font-bold tracking-widest">
                  Client audit length:
                </span>
                <span className="font-bold text-zinc-550 bg-zinc-900 border border-zinc-850 px-2.5 py-0.5 rounded-md">
                  {filteredActivities.length} logs found
                </span>
              </div>
            </div>
          </div>

          {/* Sticky Mini Active Player Column - Spans 5 cols */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                The Active Player
              </h3>
              <p className="text-[10px] text-zinc-655 font-bold uppercase tracking-wide font-mono">
                High Fidelity Control Node
              </p>
            </div>

            {/* Simulated Canvas / Progress SVG waveform */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-[3rem] p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden group shadow-2xl min-h-[440px]">
              {/* Rotating Vinyl disk album display */}
              <div className="relative w-40 h-40 xl:w-44 xl:h-44 rounded-full bg-zinc-900 border-4 border-zinc-850 flex items-center justify-center shadow-xl group overflow-hidden">
                <img
                  src={playerTrack.image_url || "/ogbeatz_logo.svg"}
                  className={cn(
                    "w-full h-full object-cover rounded-full transition-transform duration-[15000s] ease-linear",
                    isPlaying ? "rotate-[360deg] scale-102 duration-[25s]" : "",
                  )}
                  referrerPolicy="no-referrer"
                />

                {/* Center hole vinyl ring */}
                <div className="absolute w-10 h-10 bg-black rounded-full border-2 border-zinc-850/80 flex items-center justify-center z-10">
                  <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                </div>
              </div>

              {/* Metadata titles */}
              <div className="space-y-1 w-full px-2">
                <p className="text-[10px] text-orange-500 font-black uppercase tracking-[0.3em] font-mono flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping inline-block" />
                  <span>ENGAGED NODE MONITORS</span>
                </p>
                <h4 className="text-xl font-black text-white uppercase italic tracking-tighter truncate max-w-full">
                  {playerTrack.name}
                </h4>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider font-sans">
                  PRODUCED & MASTERED BY {playerTrack.artist || "THE BEATZ WAY"}
                </p>
              </div>

              {/* Micro Simulated Waveform Canvas Seek Panel */}
              <div className="w-full space-y-2 text-left">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-zinc-650 px-1">
                  <span>Waveform Wave-Surfer</span>
                  <span className="text-orange-500/80">
                    {formatTime(
                      isMock
                        ? isPlaying
                          ? progress % playerTrack.duration
                          : progress
                        : progress,
                    )}{" "}
                    / {formatTime(playerTrack.duration)}
                  </span>
                </div>

                <div
                  onClick={(e) => {
                    if (!isMock) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const pct = Math.max(0, Math.min(1, clickX / rect.width));
                      seek(pct * duration);
                    } else {
                      // Simulating mock playback clicking
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const pct = Math.max(0, Math.min(1, clickX / rect.width));
                      setVolume(pct);
                    }
                  }}
                  className="relative h-12 w-full cursor-pointer bg-black rounded-xl border border-zinc-900 group-hover:border-zinc-800/80 flex items-center overflow-hidden"
                >
                  <div className="absolute inset-x-3 inset-y-1.5 flex items-center gap-0.5 pointer-events-none">
                    {[...Array(30)].map((_, idx) => {
                      const totalSecs = playerTrack.duration || 1;
                      const activeProgressPct = (progress / totalSecs) * 100;
                      const thisBarPct = (idx / 30) * 100;
                      const isBarActive = thisBarPct <= activeProgressPct;
                      const peakHeight =
                        Math.sin((idx / 30) * Math.PI) * 24 +
                        (idx % 3 === 0 ? 8 : idx % 2 === 0 ? 14 : 6);

                      return (
                        <div
                          key={idx}
                          style={{ height: `${peakHeight}px` }}
                          className={cn(
                            "flex-1 rounded-sm transition-colors duration-300",
                            isBarActive ? "bg-orange-500" : "bg-zinc-900/60",
                          )}
                        />
                      );
                    })}
                  </div>

                  {/* Progress laser locator */}
                  <div
                    style={{
                      left: `${(progress / (playerTrack.duration || 1)) * 100}%`,
                    }}
                    className="absolute top-0 bottom-0 w-0.5 bg-orange-400/85 pointer-events-none transition-all duration-100 ease-out"
                  />
                </div>
              </div>

              {/* Player Controls buttons bar */}
              <div className="w-full flex items-center justify-between gap-6 pt-2">
                {/* Play controls */}
                <button
                  onClick={() => {
                    if (isMock) {
                      if (isPlaying) {
                        alert("Pausing simulated master audit node.");
                      } else {
                        if (tracks.length > 0) playTrack(tracks[0]);
                      }
                    } else if (!globalActiveTrack) {
                      if (
                        playerTrack &&
                        playerTrack.id !== "clear-master-mock"
                      ) {
                        playTrack(playerTrack);
                      } else if (tracks.length > 0) {
                        playTrack(tracks[0]);
                      }
                    } else {
                      isPlaying ? pause() : resume();
                    }
                  }}
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-[1.08] active:scale-[0.94] transition-all cursor-pointer shadow-lg shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-black" />
                  ) : (
                    <Play className="w-6 h-6 fill-black ml-1" />
                  )}
                </button>

                {/* Simulated Volume scroll bar */}
                <div className="flex-1 flex items-center gap-3 bg-zinc-900/50 border border-zinc-900/40 p-3 rounded-2xl">
                  <button
                    onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                    className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-orange-500 animate-pulse" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-zinc-400" />
                    )}
                  </button>
                  <div className="flex-1 h-1 bg-black rounded-full relative group cursor-pointer overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full bg-orange-500 rounded-full"
                      style={{ width: `${volume * 100}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-[8px] font-mono tracking-widest text-zinc-600 font-bold uppercase">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-8 selection:bg-orange-500 selection:text-black">
        <div className="relative group">
          <div className="absolute -inset-1.5 bg-gradient-to-b from-orange-500 to-amber-600 rounded-[2rem] opacity-35 blur-xl group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative w-16 h-16 rounded-[1.5rem] bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg overflow-hidden">
            <img src="/ogbeatz_logo.svg" alt="THE BEATZ WAY Logo" className="w-12 h-12 object-contain animate-bounce" />
          </div>
        </div>

        <div className="text-center space-y-4 max-w-sm px-6">
          <div className="space-y-1">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-white">
              Initializing Vault
            </h2>
            <div className="flex items-center justify-center gap-1.5 text-[9px] font-mono text-zinc-500 tracking-widest uppercase">
              <span>Secure Session</span>
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping"></span>
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="space-y-2.5">
            <div className="w-64 h-2 bg-zinc-950 rounded-full border border-zinc-900 overflow-hidden relative p-[1px]">
              <div
                style={{
                  width: `${Math.min(Math.max(loadingProgress, 5), 100)}%`,
                }}
                className="h-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 rounded-full transition-all duration-300 ease-out"
              ></div>
            </div>

            <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
              <span className="text-zinc-500 uppercase tracking-wider animate-pulse truncate max-w-[180px]">
                {loadingStatusText}
              </span>
              <span className="text-orange-500 font-bold tracking-widest tabular-nums">
                {loadingProgress}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Shell activeView={activeView} onViewChange={(v) => setActiveView(v)}>
      <div className="pb-24">
        {activeView === "dashboard" && renderDashboard()}
        {activeView === "tracks" && renderTracks()}
        {activeView === "analyzer" && <AudioAnalyzerStudio />}
        {activeView === "clients" && renderClients()}
        {activeView === "playlists" && renderPlaylists()}
        {activeView === "videos" && renderVideos()}
        {activeView === "activity" && renderActivity()}
        {activeView === "messages" && renderMessages()}
        {activeView === "sharing" && renderSharing()}
        {activeView === "profile" && renderProfile()}
        {activeView === "client-detail" && renderClientDetail()}
        {activeView === "youtube" && <YouTubeHub />}
        {activeView === "releases" && <ReleasesHub />}
        {/* Settings View */}
        {activeView === "settings" && (
          <div className="p-8 space-y-8 max-w-3xl">
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase text-white">
                System Configuration
              </h1>
              <p className="text-zinc-500 text-sm mt-1">
                Configure your cloud databases, security parameters, and Gemini
                API services.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Supabase Connection Manager */}
              <div className="md:col-span-2 space-y-6">
                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">
                      Supabase Cloud Connection
                    </h3>
                    <button
                      onClick={checkDatabase}
                      disabled={dbStatus?.status === "checking"}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                        dbStatus?.status === "success"
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                          : dbStatus?.status === "error"
                            ? "bg-red-500/15 border-red-500/30 text-red-500"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white",
                      )}
                    >
                      {dbStatus?.status === "checking"
                        ? "Verifying..."
                        : "Re-verify DB"}
                    </button>
                  </div>

                  {/* Connection Diagnostic Overview */}
                  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                        Active Database Url
                      </span>
                      <span className="text-[10px] font-mono select-all bg-black/40 px-2 py-1 rounded border border-white/5 text-zinc-400">
                        {supabaseUrl}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                        Connection Mode
                      </span>
                      <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                        Production Cloud Connected
                      </span>
                    </div>
                  </div>

                  {/* Explicit Guidance For Blank Setup */}
                  {false && (
                    <div className="space-y-3 border-t border-zinc-900 pt-4">
                      <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl space-y-2">
                        <p className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                          ⚠️ Why is my Supabase data empty?
                        </p>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          The application is currently connected to the **OG
                          BEATZ Template Sandbox Database**. This ensures the
                          system runs immediately, but it starts **blank or with
                          template tracks**, rather than loading your personal
                          unreleased master portfolios.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                          How to load your personal Supabase data:
                        </p>
                        <ol className="text-[10px] text-zinc-500 space-y-2 list-decimal list-inside pl-1 leading-relaxed">
                          <li>
                            Look at the leftmost workspace panel (under the File
                            Explorer directory tree).
                          </li>
                          <li>
                            Click research and open the file named{" "}
                            <span className="text-orange-500 font-bold font-mono">
                              .env
                            </span>{" "}
                            (or check the settings tab of this AI assistant
                            workspace).
                          </li>
                          <li>
                            Fill in your private credentials:
                            <pre className="mt-1.5 p-2 bg-black rounded-lg border border-white/5 font-mono text-[9px] text-zinc-400 leading-3">
                              SUPABASE_URL=https://your-project-id.supabase.co
                              SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX...
                            </pre>
                          </li>
                          <li>
                            Press{" "}
                            <span className="font-bold text-white">Save</span>.
                            The builder server will automatically boot, load
                            your credentials and query your real tracks, client
                            directories, and and messages!
                          </li>
                        </ol>
                      </div>
                    </div>
                  )}

                  {/* Display active environment keys parsed securely from node process */}
                  <div className="space-y-2 border-t border-zinc-900 pt-4">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      Node Environment Variables Status
                    </h4>
                    <div className="grid grid-cols-1 divide-y divide-zinc-900/50">
                      {((dbStatus as any)?.envKeysCheck || []).map(
                        (env: any) => (
                          <div
                            key={env.key}
                            className="flex items-center justify-between py-2 text-xs"
                          >
                            <span className="font-mono text-[11px] text-zinc-400">
                              {env.key}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-500 font-mono italic">
                                {env.preview}
                              </span>
                              <span
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  env.status === "active"
                                    ? "bg-emerald-500"
                                    : "bg-zinc-800",
                                )}
                              />
                            </div>
                          </div>
                        ),
                      )}
                      {(!dbStatus || !(dbStatus as any)?.envKeysCheck) && (
                        <p className="text-[10px] text-zinc-500 italic pt-1">
                          Run database check to view active environments.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Supabase Tables Catalog */}
                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300">
                        Live Database Catalog Explorer
                      </h3>
                      <p className="text-[11px] text-zinc-500 mt-0.5 font-bold uppercase tracking-wide">
                        Discovered table schemas and row contents in your active
                        Supabase project.
                      </p>
                    </div>
                    <button
                      onClick={() => runDatabaseInspection()}
                      disabled={inspecting}
                      className="text-[10px] self-start sm:self-auto font-black uppercase tracking-widest text-orange-500 hover:text-orange-400 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 rounded-lg transition-all"
                    >
                      {inspecting ? "Searching..." : "Refresh Schema"}
                    </button>
                  </div>

                  {/* Probe Custom User Table search input bar */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-805 p-4 space-y-3">
                    <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">
                      Query Custom Database Tables
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter existing table name (e.g. tracks, songs, users, beats...)"
                        value={customTableInput}
                        onChange={(e) => setCustomTableInput(e.target.value)}
                        className="flex-1 bg-black text-xs text-white placeholder-zinc-650 rounded-lg border border-zinc-800 px-3 py-2 outline-none focus:border-orange-500 transition-all font-mono"
                      />
                      <button
                        onClick={() => runDatabaseInspection(customTableInput)}
                        disabled={inspecting || !customTableInput.trim()}
                        className="text-xs bg-orange-500 hover:bg-orange-400 text-black px-4 py-2 rounded-lg font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                      >
                        {inspecting ? "Searching..." : "Search"}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-semibold uppercase leading-normal">
                      💡 If your database was already populated with custom
                      schemas, type a table name above to examine loaded columns
                      and records.
                    </p>
                  </div>

                  {inspecting ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 bg-zinc-900/40 rounded-2xl border border-zinc-900">
                      <Zap className="w-6 h-6 text-orange-500 animate-spin" />
                      <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest animate-pulse">
                        Scanning database schemas...
                      </p>
                    </div>
                  ) : inspectingError ? (
                    <div className="p-4 bg-red-500/5 border border-red-500/10 text-red-550 rounded-2xl space-y-1.5 text-xs">
                      <p className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-red-400">
                        <AlertCircle className="w-4 h-4" /> Connection schema
                        probe warnings
                      </p>
                      <p className="text-zinc-400 text-[11px] leading-relaxed font-mono select-all bg-black/40 p-2.5 rounded-lg border border-red-500/5 mt-2">
                        {inspectingError}
                      </p>
                      <div className="pt-2 text-[10px] text-zinc-500 leading-relaxed space-y-1 bg-black/50 p-3 rounded-lg border border-white/5">
                        <p className="font-bold text-zinc-400 uppercase tracking-widest mb-1">
                          Checklist to establish connection:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>
                            Verify your{" "}
                            <span className="font-mono text-zinc-300">
                              SUPABASE_URL
                            </span>{" "}
                            matches in settings.
                          </li>
                          <li>
                            Confirm your API anonymized credential (anon key)
                            doesn't contain gaps or broken characters.
                          </li>
                          <li>
                            Make sure PostgreSQL is turned on and accepting
                            queries.
                          </li>
                        </ul>
                      </div>
                    </div>
                  ) : inspectedTables ? (
                    <div className="space-y-4">
                      {inspectedTables.length === 0 ? (
                        <div className="p-8 text-center bg-zinc-900 rounded-2xl border border-zinc-800 text-zinc-500 space-y-1">
                          <AlertCircle className="w-5 h-5 mx-auto text-zinc-650 mb-1" />
                          <p className="text-xs font-bold uppercase tracking-widest text-zinc-300">
                            No tables discovered
                          </p>
                          <p className="text-[10px] text-zinc-550 leading-relaxed">
                            The database is fully connected, but contains zero
                            public tables or schemas.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {inspectedTables.map((table) => {
                            return (
                              <div
                                key={table.tableName}
                                className="bg-zinc-900 border border-zinc-850 rounded-2xl p-4 space-y-3"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="space-y-0.5">
                                    <span className="font-mono text-sm font-black text-orange-500 select-all">
                                      {table.tableName}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                      <span>{table.columnCount} columns</span>
                                      <span>•</span>
                                      <span
                                        className={cn(
                                          table.rowCount > 0
                                            ? "text-emerald-500"
                                            : "text-zinc-500",
                                        )}
                                      >
                                        {table.rowCount} records loaded
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-[9px] bg-zinc-850 px-2.5 py-1 rounded font-mono text-zinc-400 border border-white/5 uppercase font-bold tracking-wider">
                                    TABLE REST
                                  </span>
                                </div>

                                {/* Table Columns chips list */}
                                <div className="space-y-1.5 border-t border-zinc-850/50 pt-3">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                    Columns Detected
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {table.columns.map((col: any) => (
                                      <span
                                        key={col.name}
                                        className="px-2 py-0.5 bg-black/40 border border-white/5 font-mono text-[9px] text-zinc-350 rounded hover:border-zinc-700 transition-all select-all"
                                      >
                                        {col.name}{" "}
                                        <span className="text-zinc-550 text-[8px]">
                                          {col.type}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Sample Records JSON Box if rowCount > 0 */}
                                {table.rowCount > 0 &&
                                  table.sampleRows &&
                                  table.sampleRows.length > 0 && (
                                    <div className="space-y-2 border-t border-zinc-850/50 pt-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                          Sample Records Preview
                                        </p>
                                        <span className="text-[9px] text-zinc-500 italic">
                                          Showing up to{" "}
                                          {table.sampleRows.length} rows
                                        </span>
                                      </div>
                                      <pre className="p-3 bg-black/80 rounded-xl border border-white/5 font-mono text-[10px] text-zinc-400 overflow-x-auto max-h-48 leading-relaxed scrollbar-thin select-all">
                                        {JSON.stringify(
                                          table.sampleRows,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    </div>
                                  )}

                                {table.error ? (
                                  <p className="text-[10px] text-red-400 italic bg-red-500/5 px-2.5 py-1 rounded border border-red-500/10 select-all font-mono">
                                    Error: {table.error}
                                  </p>
                                ) : table.rowCount === 0 ? (
                                  <p className="text-[10px] text-zinc-500 italic bg-zinc-950/40 px-2.5 py-1 rounded border border-white/5">
                                    This table is empty. Try uploading tracks or
                                    adding clients to populate it.
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      Click Refresh to discover schema details.
                    </p>
                  )}
                </div>
              </div>

              {/* Account Security & Support Rail */}
              <div className="space-y-6">
                {/* Demo Mock Data Toggle Card */}
                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-4">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-300">
                      Demo Mock Data
                    </h3>
                    <p className="text-[11px] text-zinc-550 leading-relaxed font-bold uppercase tracking-wider mt-0.5">
                      Toggle pre-populated sample tracks, clients, playlists, and messages. Turn off to show only your uploaded content.
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-2xl border border-zinc-800">
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider">Show Sample Data</p>
                      <p className="text-[10px] text-zinc-550 font-medium">
                        {enableMockData ? "Demo records are visible" : "Only your own content is shown"}
                      </p>
                    </div>
                    <button
                      onClick={() => setEnableMockData(!enableMockData)}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer",
                        enableMockData ? "bg-orange-500" : "bg-zinc-800"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-1 w-4 h-4 bg-black rounded-full transition-transform",
                          enableMockData ? "right-1" : "left-1"
                        )}
                      />
                    </button>
                  </div>

                  {!enableMockData && (
                    <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-xl">
                      <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest leading-normal">
                        ✓ Pristine Workspace Enabled
                      </p>
                      <p className="text-[9px] text-zinc-550 leading-normal mt-1">
                        All mock tracks, playlists, clients, messages, and activity records have been safely hidden, exposing purely your private uploaded/created assets.
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">
                    System UI Theme
                  </h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed uppercase font-bold tracking-wider">
                    Configure your studio layout aesthetics to match your work
                    environment.
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex flex-col items-center gap-3 p-4 rounded-2xl border text-center transition-all cursor-pointer",
                        theme === "dark"
                          ? "bg-zinc-900 border-orange-500 text-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.1)]"
                          : "bg-black border-zinc-900 text-zinc-500 hover:border-zinc-805 hover:bg-zinc-900/40 hover:text-zinc-300",
                      )}
                    >
                      <Moon className="w-5 h-5" />
                      <div>
                        <span className="block text-xs font-black uppercase tracking-widest">
                          CYBERPUNK
                        </span>
                        <span className="block text-[8px] font-mono uppercase tracking-widest opacity-60">
                          Dark Ambient
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex flex-col items-center gap-3 p-4 rounded-2xl border text-center transition-all cursor-pointer",
                        theme === "light"
                          ? "bg-zinc-100 border-orange-500 text-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.1)]"
                          : "bg-black border-zinc-900 text-zinc-500 hover:border-zinc-805 hover:bg-zinc-900/40 hover:text-zinc-300",
                      )}
                    >
                      <Sun className="w-5 h-5" />
                      <div>
                        <span className="block text-xs font-black uppercase tracking-widest">
                          MINIMALIST
                        </span>
                        <span className="block text-[8px] font-mono uppercase tracking-widest opacity-60">
                          High Light
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">
                    Account Security
                  </h3>
                  <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-2xl border border-zinc-800">
                    <div className="space-y-1">
                      <p className="text-xs font-bold">Two-Factor Auth</p>
                      <p className="text-[10px] text-zinc-500">
                        Secure master deliveries.
                      </p>
                    </div>
                    <div className="w-10 h-5 bg-zinc-800 rounded-full relative cursor-pointer">
                      <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-orange-500 rounded-full" />
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">
                    Storage Usage
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-zinc-400">
                      <span>Ref Masters Cache</span>
                      <span>4.2GB / 10GB</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 w-[42%]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <AudioPlayer onEdit={(track) => setEditingTrack(track)} />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv,.json"
        className="hidden"
      />

      <AnimatePresence>
        {selectedTrackForPromo && (
          <PromoPackModal
            key="promo-pack-modal"
            track={selectedTrackForPromo}
            onClose={() => setSelectedTrackForPromo(null)}
          />
        )}
        {editingTrack && (
          <EditTrackModal
            key="edit-track-modal"
            track={editingTrack}
            onClose={() => setEditingTrack(null)}
            onSave={updateTrack}
            onDelete={handleDeleteTrack}
          />
        )}
        {editingPlaylist && (
          <EditPlaylistModal
            key="edit-playlist-modal"
            playlist={editingPlaylist}
            onClose={() => setEditingPlaylist(null)}
            onSave={(updates) => updatePlaylist(editingPlaylist.id, updates)}
            onDelete={(id) => {
              deletePlaylist(id);
              if (selectedPlaylistId === id) setSelectedPlaylistId(null);
            }}
          />
        )}
        {editingClient && (
          <EditClientModal
            key="edit-client-modal"
            client={editingClient}
            onClose={() => setEditingClient(null)}
          />
        )}
        {showAddClient && (
          <AddClientModal
            key="add-client-modal"
            onClose={() => setShowAddClient(false)}
          />
        )}
        {selectedPlaylist && showAddTracksToPlaylist && (
          <AddTrackToPlaylistModal
            key="add-track-to-playlist-modal"
            playlist={selectedPlaylist}
            onClose={() => setShowAddTracksToPlaylist(false)}
          />
        )}
        {sharingAsset && (
          <ShareModal
            key="share-modal"
            track={sharingAsset.track}
            playlist={sharingAsset.playlist}
            onClose={() => setSharingAsset(null)}
          />
        )}
        {selectedVideoForPreview && (
          <VideoPreviewModal
            key="video-preview-modal"
            video={selectedVideoForPreview}
            onClose={() => setSelectedVideoForPreview(null)}
          />
        )}
        {showUploadVideo && (
          <UploadVideoModal
            key="upload-video-modal"
            onClose={() => setShowUploadVideo(false)}
          />
        )}
        {viewingTrackDetails && (
          <TrackDetailsModal
            key="track-details-modal"
            track={viewingTrackDetails}
            onClose={() => setViewingTrackDetails(null)}
            onDownload={(t) => handleDownload(t)}
            onShare={(t) => handleShare(t)}
            onCreateVideo={(t) => handleNavigateToVideoMaker(t)}
            onEdit={(t) => {
              setViewingTrackDetails(null);
              setEditingTrack(t);
            }}
            playlistTracks={tracks}
          />
        )}
        {showExportModal && (
          <ExportMasterModal
            key="export-master-modal"
            onClose={() => setShowExportModal(false)}
            onExport={handleExportTracksZip}
            defaultFormat={exportFormat}
            onUpdateDefaultFormat={handleUpdateExportFormat}
            selectedPlaylistName={selectedPlaylist ? selectedPlaylist.name : null}
            totalLibraryTracksCount={tracks.length}
            playlistTracksCount={playlistTracks.length}
          />
        )}
      </AnimatePresence>

      {/* Floating Toolbar for Batch tagging selected tracks */}
      {trackListViewMode === "columns" && selectedTrackIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-5xl px-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-zinc-950/95 border border-zinc-800 p-4 md:p-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl flex flex-col gap-4 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-zinc-900">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white">
                  {selectedTrackIds.length} Track{selectedTrackIds.length > 1 ? 's' : ''} Selected for Batch Tagging
                </h4>
              </div>
              <button
                onClick={() => setSelectedTrackIds([])}
                className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all underline decoration-zinc-800 underline-offset-4 cursor-pointer"
              >
                Clear Selection
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Genre category selection */}
              <div className="space-y-1.5 text-left">
                <label className="block text-[8px] font-black uppercase tracking-widest text-zinc-500">
                  Genre Category
                </label>
                <div className="relative">
                  <select
                    value={batchGenre}
                    onChange={(e) => setBatchGenre(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 focus:border-orange-500/50 focus:outline-none appearance-none rounded-xl h-[40px]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      backgroundSize: '12px'
                    }}
                  >
                    <option value="" className="bg-zinc-950 text-zinc-350">— Select Genre —</option>
                    <option value="Trap" className="bg-zinc-950 text-zinc-300">Trap</option>
                    <option value="Hip Hop" className="bg-zinc-950 text-zinc-300">Hip Hop</option>
                    <option value="Lofi" className="bg-zinc-950 text-zinc-300">Lofi</option>
                    <option value="Drill" className="bg-zinc-950 text-zinc-300">Drill</option>
                    <option value="R&B" className="bg-zinc-950 text-zinc-300">R&B</option>
                    <option value="Cinematic" className="bg-zinc-950 text-zinc-300">Cinematic</option>
                    <option value="Boom Bap" className="bg-zinc-950 text-zinc-300">Boom Bap</option>
                    <option value="West Coast" className="bg-zinc-950 text-zinc-300">West Coast</option>
                    <option value="Electro" className="bg-zinc-950 text-zinc-300">Electro</option>
                  </select>
                </div>
              </div>

              {/* Mood category selection */}
              <div className="space-y-1.5 text-left">
                <label className="block text-[8px] font-black uppercase tracking-widest text-zinc-500">
                  Mood Tag
                </label>
                <div className="relative">
                  <select
                    value={batchMood}
                    onChange={(e) => setBatchMood(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 focus:border-orange-500/50 focus:outline-none appearance-none rounded-xl h-[40px]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      backgroundSize: '12px'
                    }}
                  >
                    <option value="" className="bg-zinc-950 text-zinc-350">— Select Mood —</option>
                    <option value="Gritty" className="bg-zinc-950 text-zinc-300">Gritty</option>
                    <option value="Dark" className="bg-zinc-950 text-zinc-300">Dark</option>
                    <option value="Energetic" className="bg-zinc-950 text-zinc-300">Energetic</option>
                    <option value="Chill" className="bg-zinc-950 text-zinc-300">Chill</option>
                    <option value="Aggressive" className="bg-zinc-950 text-zinc-300">Aggressive</option>
                    <option value="Smooth" className="bg-zinc-950 text-zinc-300">Smooth</option>
                    <option value="Hypnotic" className="bg-zinc-950 text-zinc-300">Hypnotic</option>
                    <option value="Moody" className="bg-zinc-950 text-zinc-300">Moody</option>
                    <option value="Suspenseful" className="bg-zinc-950 text-zinc-300">Suspenseful</option>
                    <option value="Melancholic" className="bg-zinc-950 text-zinc-300">Melancholic</option>
                  </select>
                </div>
              </div>

              {/* Custom tags string input */}
              <div className="space-y-1.5 text-left">
                <label className="block text-[8px] font-black uppercase tracking-widest text-zinc-500">
                  Custom Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={batchCustomTags}
                  onChange={(e) => setBatchCustomTags(e.target.value)}
                  placeholder="e.g. key:9A, club, dynamic"
                  className="w-full bg-zinc-900/50 border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 placeholder:text-zinc-650 rounded-xl focus:border-orange-500/50 focus:outline-none h-[40px]"
                />
              </div>

              {/* Batch Mode option and Action Button */}
              <div className="flex items-center gap-2 text-left">
                <div className="flex-1 space-y-1.5">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-zinc-500">
                    Mode
                  </label>
                  <div className="flex bg-zinc-900 rounded-xl p-0.5 border border-zinc-800 h-[40px]">
                    <button
                      type="button"
                      onClick={() => setBatchMode("append")}
                      className={`flex-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${
                        batchMode === "append"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-500 hover:text-zinc-400"
                      }`}
                    >
                      Append
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchMode("overwrite")}
                      className={`flex-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${
                        batchMode === "overwrite"
                          ? "bg-orange-500 text-black font-black"
                          : "text-zinc-500 hover:text-zinc-400"
                      }`}
                    >
                      Replace
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const compiledTags: string[] = [];
                    if (batchGenre) {
                      compiledTags.push(`genre_category:${batchGenre}`);
                    }
                    if (batchMood) {
                      compiledTags.push(`mood:${batchMood}`);
                    }
                    if (batchCustomTags) {
                      const list = batchCustomTags
                        .split(",")
                        .map((t) => t.trim())
                        .filter((t) => t.length > 0);
                      compiledTags.push(...list);
                    }

                    if (compiledTags.length === 0) {
                      addToast("Please provide or select at least one tag to assign.", "info");
                      return;
                    }

                    await handleBatchAssignTags(compiledTags, batchMode === "overwrite");
                    setBatchGenre("");
                    setBatchMood("");
                    setBatchCustomTags("");
                  }}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black font-black uppercase text-[10px] tracking-widest rounded-xl transition-all h-[40px] flex items-center justify-center cursor-pointer shadow-lg shadow-orange-500/10 active:scale-95 shrink-0"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Database Operations Toasts */}
      <div className="fixed top-24 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts &&
            toasts.map((toast) => (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: 0.15 },
                }}
                className={cn(
                  "p-4 rounded-2xl border flex items-start gap-3 shadow-2xl backdrop-blur-xl pointer-events-auto",
                  toast.type === "success"
                    ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-100/90"
                    : toast.type === "error"
                      ? "bg-red-950/95 border-red-500/30 text-red-100/95"
                      : "bg-zinc-900/95 border-zinc-800 text-zinc-100",
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {toast.type === "success" && (
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mt-1.5" />
                  )}
                  {toast.type === "error" && (
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                  )}
                  {toast.type === "info" && (
                    <Music className="w-4 h-4 text-zinc-400 mt-0.5" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {toast.type === "success" && "Database Sync Success"}
                    {toast.type === "error" && "Database Writing Issue"}
                    {toast.type === "info" && "Studio Local Notice"}
                  </p>
                  <p className="text-xs leading-relaxed font-semibold">
                    {toast.message}
                  </p>
                </div>

                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-zinc-500 hover:text-white transition-colors p-0.5 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      <VoiceAssistant activeView={activeView} onViewChange={setActiveView} />
    </Shell>
  );
}

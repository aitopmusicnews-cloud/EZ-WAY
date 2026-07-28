import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Disc,
    Plus,
    Trash2,
    Calendar,
    Award,
    Sliders,
    Globe,
    Search,
    CheckCircle,
    Loader2,
    Activity,
    Sparkles,
    ExternalLink,
    Lock,
    RefreshCw,
    Play,
    TrendingUp,
    FileText,
    ArrowUpRight,
    Volume2
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from "recharts";
import { useMediaStore } from "../context/MediaStoreContext";

interface ReleasesHubProps {
    addToast?: (message: string, type: "success" | "error" | "info") => void;
}

interface Release {
    id: string;
    trackId: string;
    name: string;
    artist: string;
    albumName: string;
    status: "In Production" | "Distributed" | "Scheduled" | "Released";
    releaseDate: string;
    upc: string;
    isrc: string;
    spotifyId: string;
    spotifyUrl: string;
    imageUrl: string;
    streams: number;
    popularity: number;
    saves: number;
    playlistAdds: number;
    marketingStage: string;
}

export default function ReleasesHub({ addToast }: ReleasesHubProps) {
    const { tracks, toasts, addToast: storeAddToast } = useMediaStore();
    const triggerToast = addToast || storeAddToast || ((msg) => console.log(msg));

    // Navigation and status states
    const [activeTab, setActiveTab] = useState<"tracker" | "analytics" | "planner" | "catalog">("tracker");
    const [loading, setLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [releases, setReleases] = useState<Release[]>([]);
    
    // Auth Status state
    const [authStatus, setAuthStatus] = useState({
        connected: false,
        profileName: "THE BEATZ WAY MASTER",
        followers: "84,200",
        profileImageUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=150&auto=format&fit=crop",
        spotifyUrl: "https://open.spotify.com/artist/3njrZB5AqufxgNN6GqqFN0?si=GrvByX1lTqGNtDVEW9Jtfw",
        hasClientId: false
    });

    const [showSetupGuide, setShowSetupGuide] = useState(false);

    // Form inputs for new Release tracker
    const [showAddModal, setShowAddModal] = useState(false);
    const [newReleaseName, setNewReleaseName] = useState("");
    const [newReleaseArtist, setNewReleaseArtist] = useState("THE BEATZ WAY");
    const [newReleaseAlbum, setNewReleaseAlbum] = useState("");
    const [newReleaseStatus, setNewReleaseStatus] = useState<"In Production" | "Distributed" | "Scheduled" | "Released">("In Production");
    const [newReleaseDate, setNewReleaseDate] = useState("");
    const [newReleaseUPC, setNewReleaseUPC] = useState("");
    const [newReleaseISRC, setNewReleaseISRC] = useState("");
    const [newReleaseImage, setNewReleaseImage] = useState("https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=250&auto=format&fit=crop");

    // Search Spotify Catalog
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedReleaseForLink, setSelectedReleaseForLink] = useState<string | null>(null);

    // Selected release for deep analytics or editing
    const [selectedReleaseId, setSelectedReleaseId] = useState<string>("");

    // Fetch initial state
    useEffect(() => {
        fetchSpotifyState();
        fetchReleases();
    }, []);

    const fetchSpotifyState = async () => {
        try {
            const res = await fetch("/api/spotify/state");
            if (res.ok) {
                const data = await res.json();
                setAuthStatus(data);
            }
        } catch (err) {
            console.error("Failed to recover Spotify auth state:", err);
        }
    };

    const fetchReleases = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch("/api/spotify/releases");
            if (res.ok) {
                const data = await res.json();
                setReleases(data.releases);
                if (data.releases.length > 0 && !data.releases.some(r => r.id === selectedReleaseId)) {
                    setSelectedReleaseId(data.releases[0].id);
                }
            }
        } catch (err) {
            console.error("Failed to fetch tracked releases:", err);
        } finally {
            setIsSyncing(false);
        }
    };

    // Spotify Popup OAuth Initiator
    const handleSpotifyConnect = async () => {
        try {
            setLoading(true);
            try {
                localStorage.removeItem("SPOTIFY_OAUTH_STATUS");
            } catch (e) {}

            const res = await fetch(`/api/spotify/auth-url?origin=${encodeURIComponent(window.location.origin)}`);
            if (!res.ok) {
                throw new Error("Failed to compile Spotify authorization endpoints.");
            }
            const { url } = await res.json();

            // Open popup center-screen
            const authWindow = window.open(
                url,
                "spotify_oauth_popup",
                "width=600,height=750,location=no,toolbar=no,menubar=no,status=no"
            );

            if (!authWindow) {
                triggerToast("Popup blocker blocked Spotify authorization! Please allow popups and retry.", "error");
                setLoading(false);
                return;
            }

            const handleMessage = (event: MessageEvent) => {
                if (event.origin !== window.location.origin && !event.origin.endsWith(".run.app")) {
                    return;
                }
                if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
                    triggerToast("Spotify API successfully authorized!", "success");
                    fetchSpotifyState();
                    fetchReleases();
                }
            };

            window.addEventListener("message", handleMessage);

            const timer = setInterval(() => {
                try {
                    const status = localStorage.getItem("SPOTIFY_OAUTH_STATUS");
                    if (status === "SUCCESS") {
                        localStorage.removeItem("SPOTIFY_OAUTH_STATUS");
                        triggerToast("Spotify API authenticated via local state sync!", "success");
                        fetchSpotifyState();
                        fetchReleases();
                        clearInterval(timer);
                        window.removeEventListener("message", handleMessage);
                        authWindow.close();
                        setLoading(false);
                        return;
                    }
                } catch (e) {}

                if (authWindow.closed) {
                    clearInterval(timer);
                    window.removeEventListener("message", handleMessage);
                    setLoading(false);
                }
            }, 800);

        } catch (err: any) {
            triggerToast(`Could not authenticate with Spotify: ${err.message || err}`, "error");
            setLoading(false);
        }
    };

    const handleSpotifyDisconnect = async () => {
        try {
            const res = await fetch("/api/spotify/disconnect", { method: "POST" });
            if (res.ok) {
                triggerToast("Spotify profile unlinked successfully.", "info");
                setAuthStatus(prev => ({ ...prev, connected: false }));
            }
        } catch (err) {
            triggerToast("Disconnection failed.", "error");
        }
    };

    // Add release tracker
    const handleAddRelease = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newReleaseName.trim()) {
            triggerToast("Release name is required.", "error");
            return;
        }

        try {
            const res = await fetch("/api/spotify/releases", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newReleaseName,
                    artist: newReleaseArtist,
                    albumName: newReleaseAlbum || "Single Mix",
                    status: newReleaseStatus,
                    releaseDate: newReleaseDate || new Date().toISOString().split("T")[0],
                    upc: newReleaseUPC,
                    isrc: newReleaseISRC,
                    imageUrl: newReleaseImage
                })
            });

            if (res.ok) {
                const data = await res.json();
                triggerToast(`Release tracker created for "${newReleaseName}"!`, "success");
                setReleases(prev => [...prev, data.release]);
                setSelectedReleaseId(data.release.id);
                setShowAddModal(false);
                
                // Clear state
                setNewReleaseName("");
                setNewReleaseAlbum("");
                setNewReleaseUPC("");
                setNewReleaseISRC("");
            } else {
                throw new Error("Could not create tracker on server.");
            }
        } catch (err: any) {
            triggerToast(err.message || "Failed to create tracker.", "error");
        }
    };

    // Update release stats or marketing stage
    const handleUpdateRelease = async (id: string, updates: Partial<Release>) => {
        try {
            const res = await fetch(`/api/spotify/releases/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates)
            });

            if (res.ok) {
                const data = await res.json();
                setReleases(prev => prev.map(r => r.id === id ? data.release : r));
                triggerToast("Release tracking progress updated successfully.", "success");
            }
        } catch (err) {
            triggerToast("Failed to sync updates to the cloud.", "error");
        }
    };

    // Delete release tracker
    const handleDeleteRelease = async (id: string) => {
        try {
            const res = await fetch(`/api/spotify/releases/${id}`, { method: "DELETE" });
            if (res.ok) {
                setReleases(prev => prev.filter(r => r.id !== id));
                triggerToast("Retracted release from tracker successfully.", "info");
                if (selectedReleaseId === id) {
                    setSelectedReleaseId("");
                }
            }
        } catch (err) {
            triggerToast("Failed to delete release tracker.", "error");
        }
    };

    // Search Spotify Catalog
    const handleSpotifySearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        try {
            const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(searchQuery)}`);
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.tracks || []);
            }
        } catch (err) {
            triggerToast("Catalog search query failed.", "error");
        } finally {
            setIsSearching(false);
        }
    };

    // Link tracker to actual Spotify track
    const linkSpotifyTrackToRelease = async (spotifyId: string, spotifyUrl: string, imageUrl: string, popularity: number) => {
        if (!selectedReleaseForLink) return;
        
        await handleUpdateRelease(selectedReleaseForLink, {
            spotifyId,
            spotifyUrl,
            imageUrl,
            popularity,
            status: "Released",
            streams: Math.floor(25000 + Math.random() * 80000) // seed initial streams
        });

        setSelectedReleaseForLink(null);
        setSearchResults([]);
        setSearchQuery("");
        triggerToast("Linked tracker to official Spotify catalog item!", "success");
    };

    // Calculate aggregated stats
    const totalStreams = releases.reduce((sum, r) => sum + (r.streams || 0), 0);
    const totalSaves = releases.reduce((sum, r) => sum + (r.saves || 0), 0);
    const totalPlaylistAdds = releases.reduce((sum, r) => sum + (r.playlistAdds || 0), 0);

    const activeRelease = releases.find(r => r.id === selectedReleaseId);

    // Dynamic graph dataset modeling
    const analyticsChartData = activeRelease ? [
        { name: "Day 1", Streams: Math.round(activeRelease.streams * 0.1), "Saves": Math.round(activeRelease.saves * 0.1) },
        { name: "Day 3", Streams: Math.round(activeRelease.streams * 0.25), "Saves": Math.round(activeRelease.saves * 0.22) },
        { name: "Day 5", Streams: Math.round(activeRelease.streams * 0.45), "Saves": Math.round(activeRelease.saves * 0.48) },
        { name: "Day 7", Streams: Math.round(activeRelease.streams * 0.65), "Saves": Math.round(activeRelease.saves * 0.68) },
        { name: "Day 10", Streams: Math.round(activeRelease.streams * 0.8), "Saves": Math.round(activeRelease.saves * 0.82) },
        { name: "Day 14", Streams: activeRelease.streams, "Saves": activeRelease.saves },
    ] : [
        { name: "Day 1", Streams: 0, Saves: 0 },
        { name: "Day 3", Streams: 0, Saves: 0 },
        { name: "Day 5", Streams: 0, Saves: 0 },
        { name: "Day 7", Streams: 0, Saves: 0 },
        { name: "Day 10", Streams: 0, Saves: 0 },
        { name: "Day 14", Streams: 0, Saves: 0 },
    ];

    const marketingMilestones = [
        {
            stage: "Pre-save page",
            label: "Launch Pre-Save Page",
            desc: "Construct the digital gate and collect fan pre-saves via Linktree/Feature.fm.",
            leadTime: "3-4 weeks prior"
        },
        {
            stage: "Spotify Pitch",
            label: "Pitch to Spotify Editors",
            desc: "Formulate and submit your formal pitch pitch through Spotify for Artists.",
            leadTime: "2-3 weeks prior"
        },
        {
            stage: "Social Post",
            label: "Initiate Social Teasers",
            desc: "Blast 15-second visual snippets and instrumental hooks onto TikTok & Reels.",
            leadTime: "1-2 weeks prior"
        },
        {
            stage: "Launch Visualizer",
            label: "Deploy High-HD Visualizer",
            desc: "Trigger YouTube visualizer broadcast synced to premium sound waves.",
            leadTime: "Release Day"
        },
        {
            stage: "Playlist Campaign",
            label: "Engage Playlist Pitching",
            desc: "Submit release logs to curated indie Spotify tastemakers to drive streams.",
            leadTime: "Post Launch"
        }
    ];

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto text-zinc-300">
            {/* Header section with cosmic minimal styling */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-zinc-950 border border-zinc-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[#1db954] shadow-lg shadow-emerald-500/5 shrink-0">
                        <Disc className="w-9 h-9 animate-spin" style={{ animationDuration: '6s' }} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-black tracking-tighter uppercase text-white">Spotify Releases Hub</h1>
                            <span className="px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[8px] font-black uppercase text-zinc-400 tracking-wider font-mono">
                                A&R Pipeline
                            </span>
                        </div>
                        <p className="text-zinc-500 text-xs font-semibold mt-1 max-w-xl">
                            Track the distribution milestones of your digital master mixes, monitor streaming trajectories, search the Spotify catalog, and coordinate campaigns.
                        </p>
                    </div>
                </div>

                {/* Spotify Authentication Connection widget */}
                <div className="flex items-center gap-3 shrink-0">
                    {authStatus.connected ? (
                        <div className="flex items-center gap-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3 pr-4">
                            <img
                                src={authStatus.profileImageUrl}
                                className="w-10 h-10 rounded-xl object-cover border border-zinc-700 shadow-md"
                                alt="spotify profile"
                                referrerPolicy="no-referrer"
                            />
                            <div>
                                <h4 className="text-[11px] font-black uppercase tracking-wider text-white leading-none flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                    {authStatus.profileName}
                                </h4>
                                <p className="text-[9px] font-mono tracking-widest text-zinc-500 mt-1 uppercase font-black">
                                    {authStatus.followers} FOLLOWERS
                                </p>
                            </div>
                            <button
                                onClick={handleSpotifyDisconnect}
                                className="ml-2 hover:bg-zinc-800 p-1.5 rounded-lg text-zinc-500 hover:text-red-500 transition-colors cursor-pointer"
                                title="Unlink Spotify"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowSetupGuide(!showSetupGuide)}
                                    className={`px-4 py-3 border font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer ${
                                        showSetupGuide 
                                            ? "bg-zinc-800 border-zinc-700 text-white" 
                                            : "bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-400 hover:text-white"
                                    }`}
                                >
                                    Setup Guide
                                </button>
                                <button
                                    onClick={handleSpotifyConnect}
                                    disabled={loading}
                                    className="flex items-center gap-2.5 px-6 py-3 bg-[#1db954] hover:bg-[#1ed760] text-black font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg shadow-emerald-500/10 active:scale-95 transition-all cursor-pointer"
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-black" />
                                    ) : (
                                        <Disc className="w-4 h-4 text-black fill-black" />
                                    )}
                                    Connect Spotify
                                </button>
                            </div>
                            <span className="text-[8px] font-mono tracking-widest text-zinc-600 uppercase font-black">
                                {authStatus.hasClientId ? "LIVE API DETECTED" : "SIMULATED PREVIEW ENABLED"}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Collapsable Connections Guide */}
            {showSetupGuide && (
                <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-8 space-y-5 text-xs relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
                    
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                        <h3 className="text-white font-black text-sm uppercase tracking-tight flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-emerald-500" />
                            How to Connect Live Spotify Profile & Catalog
                        </h3>
                        <button 
                            onClick={() => setShowSetupGuide(false)}
                            className="text-zinc-500 hover:text-white text-[10px] uppercase font-black tracking-widest"
                        >
                            [Close Guide]
                        </button>
                    </div>
                    
                    <p className="text-zinc-400 text-xs leading-relaxed">
                        By default, the dashboard runs in simulated developer preview mode so you can see how the pipelines coordinate. To hook it up to your real profile and pull live streams/catalog queries, follow these integration steps:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-zinc-500">
                        <div className="space-y-3.5">
                            <h4 className="text-white font-black uppercase text-[10px] tracking-widest">1. Create Spotify Developer App</h4>
                            <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                                <li>Navigate to the official <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline font-semibold inline-flex items-center gap-0.5">Spotify Developer Dashboard <ExternalLink className="w-3 h-3" /></a> and sign in.</li>
                                <li>Click <strong>Create App</strong>. Provide your brand's name & description.</li>
                                <li>Configure the <strong>Redirect URI</strong> field exactly with your dev or production domain:
                                    <div className="bg-zinc-900 text-zinc-300 p-3 rounded-xl font-mono text-[9px] border border-zinc-800 mt-2 select-all overflow-x-auto">
                                        {window.location.origin}/api/spotify/callback
                                    </div>
                                </li>
                                <li>Check Web API scope agreements and click <strong>Save</strong>.</li>
                            </ol>
                        </div>

                        <div className="space-y-3.5">
                            <h4 className="text-white font-black uppercase text-[10px] tracking-widest">2. Load Credentials to Environment</h4>
                            <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                                <li>Open your newly created Spotify app to retrieve the <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
                                <li>Click on the <strong>Settings Menu</strong> at the top right of this AI Studio environment.</li>
                                <li>Go to the <strong>Secrets / Environment Variables</strong> tab.</li>
                                <li>Insert the keys using the following variable tags:
                                    <div className="bg-zinc-900 text-zinc-300 p-3 rounded-xl font-mono text-[9px] border border-zinc-800 mt-2 space-y-1">
                                        <div>SPOTIFY_CLIENT_ID=<span className="text-zinc-500">{"<your_client_id>"}</span></div>
                                        <div>SPOTIFY_CLIENT_SECRET=<span className="text-zinc-500">{"<your_client_secret>"}</span></div>
                                    </div>
                                </li>
                                <li>Save changes and restart your development server to apply the live auth flow.</li>
                            </ol>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation Tabs bar */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <div className="flex gap-2">
                    {[
                        { id: "tracker", label: "Releases Tracker", icon: Activity },
                        { id: "analytics", label: "Streaming Analytics", icon: TrendingUp },
                        { id: "planner", label: "Marketing Planner", icon: Sliders },
                        { id: "catalog", label: "Spotify Search Utility", icon: Search }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setActiveTab(tab.id as any);
                                // Reset search state when switching tabs
                                if (tab.id !== "catalog") {
                                    setSearchResults([]);
                                    setSelectedReleaseForLink(null);
                                }
                            }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all cursor-pointer ${
                                activeTab === tab.id
                                    ? "bg-zinc-900 border border-zinc-800 text-white"
                                    : "text-zinc-500 hover:text-zinc-300"
                            }`}
                        >
                            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-emerald-500" : ""}`} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchReleases}
                        disabled={isSyncing}
                        className="p-2.5 bg-zinc-950 border border-zinc-900 hover:border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer"
                        title="Sync Tracks"
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-emerald-500" : ""}`} />
                    </button>

                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-white font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                        <Plus className="w-4 h-4 text-emerald-500" />
                        Create Tracker
                    </button>
                </div>
            </div>

            {/* TAB CONTENT: 1. RELEASES TRACKER */}
            {activeTab === "tracker" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Tracks Selection List */}
                    <div className="lg:col-span-2 space-y-4">
                        {releases.length === 0 ? (
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-12 text-center">
                                <Disc className="w-12 h-12 text-zinc-700 mx-auto mb-4 animate-spin" style={{ animationDuration: '8s' }} />
                                <h3 className="text-white font-black text-lg uppercase tracking-tight">No Tracked Releases</h3>
                                <p className="text-zinc-500 text-xs mt-2 max-w-sm mx-auto">
                                    You have not registered any release trackers. Create one above to monitor your master tracks.
                                </p>
                            </div>
                        ) : (
                            releases.map(rel => {
                                const isSelected = rel.id === selectedReleaseId;
                                return (
                                    <motion.div
                                        key={rel.id}
                                        layoutId={`rel_card_${rel.id}`}
                                        onClick={() => setSelectedReleaseId(rel.id)}
                                        className={`bg-zinc-950 border rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all cursor-pointer ${
                                            isSelected 
                                                ? "border-emerald-500/40 shadow-xl shadow-emerald-500/5 bg-zinc-950/80" 
                                                : "border-zinc-900 hover:border-zinc-800"
                                        }`}
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className="relative group shrink-0">
                                                <img
                                                    src={rel.imageUrl}
                                                    className="w-16 h-16 rounded-xl object-cover border border-zinc-800 shadow-md group-hover:scale-105 transition-transform"
                                                    alt={rel.name}
                                                    referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Volume2 className="w-5 h-5 text-white" />
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-white font-bold text-sm tracking-tight leading-none">
                                                        {rel.name}
                                                    </h3>
                                                    {rel.status === "Released" ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-500/20 text-[7px] text-emerald-400 font-black uppercase tracking-wider font-mono">
                                                            Out Now
                                                        </span>
                                                    ) : rel.status === "Scheduled" ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-950/40 border border-blue-500/20 text-[7px] text-blue-400 font-black uppercase tracking-wider font-mono">
                                                            Scheduled
                                                        </span>
                                                    ) : rel.status === "Distributed" ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-500/20 text-[7px] text-amber-400 font-black uppercase tracking-wider font-mono">
                                                            Distributed
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[7px] text-zinc-400 font-black uppercase tracking-wider font-mono">
                                                            Production
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-zinc-500 text-xs font-semibold mt-1">
                                                    {rel.artist} • <span className="text-zinc-600 font-mono text-[10px]">{rel.albumName}</span>
                                                </p>
                                                <p className="text-[9px] font-mono text-zinc-600 mt-2 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    Date: {rel.releaseDate}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Status progress bar / Streams */}
                                        <div className="w-full md:w-56 space-y-2">
                                            <div className="flex justify-between text-[9px] font-mono uppercase font-black text-zinc-500">
                                                <span>Release Pipeline</span>
                                                <span className="text-emerald-500">
                                                    {rel.status === "Released" ? "100%" : rel.status === "Scheduled" ? "75%" : rel.status === "Distributed" ? "50%" : "25%"}
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-emerald-500 transition-all duration-1000" 
                                                    style={{ 
                                                        width: rel.status === "Released" ? "100%" : rel.status === "Scheduled" ? "75%" : rel.status === "Distributed" ? "50%" : "25%" 
                                                    }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[9px] font-mono text-zinc-600">
                                                <span>ISRC Checked</span>
                                                <span>{rel.streams > 0 ? `${rel.streams.toLocaleString()} Streams` : "Upcoming"}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>

                    {/* Sidebar Details Panel */}
                    <div className="space-y-6">
                        {activeRelease ? (
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 space-y-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[60px] pointer-events-none" />

                                <div className="flex items-center gap-4 border-b border-zinc-900 pb-4">
                                    <img
                                        src={activeRelease.imageUrl}
                                        className="w-16 h-16 rounded-2xl object-cover border border-zinc-800"
                                        alt={activeRelease.name}
                                        referrerPolicy="no-referrer"
                                    />
                                    <div>
                                        <h3 className="text-white font-black text-base uppercase tracking-tight leading-tight">{activeRelease.name}</h3>
                                        <p className="text-zinc-500 text-xs mt-1">{activeRelease.artist}</p>
                                        <p className="text-[10px] font-mono text-zinc-600 uppercase font-bold mt-1.5">{activeRelease.albumName}</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black tracking-widest uppercase text-zinc-500">Distribution Blueprint</h4>
                                    
                                    <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                                        <div className="bg-zinc-900/60 border border-zinc-800/40 p-2.5 rounded-xl">
                                            <span className="text-zinc-600 text-[8px] uppercase tracking-wider block font-bold">UPC Code</span>
                                            <span className="text-zinc-300 font-bold mt-1 block">{activeRelease.upc || "N/A"}</span>
                                        </div>
                                        <div className="bg-zinc-900/60 border border-zinc-800/40 p-2.5 rounded-xl">
                                            <span className="text-zinc-600 text-[8px] uppercase tracking-wider block font-bold">ISRC Code</span>
                                            <span className="text-zinc-300 font-bold mt-1 block">{activeRelease.isrc || "N/A"}</span>
                                        </div>
                                    </div>

                                    <div className="bg-zinc-900/40 border border-zinc-900 p-3.5 rounded-2xl space-y-2">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-zinc-400 font-semibold">Distribution Status</span>
                                            <select
                                                value={activeRelease.status}
                                                onChange={(e) => handleUpdateRelease(activeRelease.id, { status: e.target.value as any })}
                                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-white font-bold text-[10px] uppercase tracking-wider"
                                            >
                                                <option value="In Production">In Production</option>
                                                <option value="Distributed">Distributed</option>
                                                <option value="Scheduled">Scheduled</option>
                                                <option value="Released">Released</option>
                                            </select>
                                        </div>
                                        <p className="text-[9px] text-zinc-500 leading-normal">
                                            Updating the status automatically updates the release timeline benchmarks and enables streaming counter hooks if "Released".
                                        </p>
                                    </div>

                                    <div className="bg-zinc-900/40 border border-zinc-900 p-3.5 rounded-2xl space-y-2">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-zinc-400 font-semibold">Active Campaign Phase</span>
                                            <select
                                                value={activeRelease.marketingStage}
                                                onChange={(e) => handleUpdateRelease(activeRelease.id, { marketingStage: e.target.value })}
                                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-white font-bold text-[10px] uppercase tracking-wider max-w-[150px]"
                                            >
                                                <option value="Pre-save page">Pre-save Page</option>
                                                <option value="Spotify Pitch">Spotify Pitch</option>
                                                <option value="Social Post">Social Teaser</option>
                                                <option value="Launch Visualizer">Launch Visualizer</option>
                                                <option value="Playlist Campaign">Playlist Campaign</option>
                                            </select>
                                        </div>
                                    </div>

                                    {activeRelease.spotifyId ? (
                                        <div className="space-y-3.5 border-t border-zinc-900 pt-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black tracking-widest uppercase text-zinc-400">Spotify Data Feed</h4>
                                                <a
                                                    href={activeRelease.spotifyUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-emerald-500 hover:text-emerald-400 flex items-center gap-1 text-[9px] uppercase font-black tracking-widest"
                                                >
                                                    View Page <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>

                                            {/* Spotify embed preview player */}
                                            <div className="h-20 bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
                                                <iframe
                                                    src={`https://open.spotify.com/embed/track/${activeRelease.spotifyId}`}
                                                    width="100%"
                                                    height="80"
                                                    frameBorder="0"
                                                    allowTransparency={true}
                                                    allow="encrypted-media"
                                                    className="rounded-xl"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                                                <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/40">
                                                    <span className="text-zinc-600 text-[8px] uppercase tracking-wider block font-bold">Total Streams</span>
                                                    <span className="text-emerald-500 font-bold mt-1 block">{activeRelease.streams.toLocaleString()}</span>
                                                </div>
                                                <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/40">
                                                    <span className="text-zinc-600 text-[8px] uppercase tracking-wider block font-bold">Catalog Popularity</span>
                                                    <span className="text-zinc-300 font-bold mt-1 block">{activeRelease.popularity}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 text-center space-y-2">
                                            <Disc className="w-8 h-8 text-zinc-700 mx-auto animate-spin" style={{ animationDuration: '10s' }} />
                                            <p className="text-zinc-400 font-bold text-[10px] uppercase tracking-wider">Unlinked Spotify Catalog Item</p>
                                            <p className="text-[9px] text-zinc-500 leading-normal max-w-xs mx-auto">
                                                This track tracker has not been matched with any official Spotify item. Sync it using the Search Utility tab.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setSelectedReleaseForLink(activeRelease.id);
                                                    setSearchQuery(activeRelease.name);
                                                    setActiveTab("catalog");
                                                    // Trigger search on focus
                                                    setTimeout(() => handleSpotifySearch(), 100);
                                                }}
                                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-white font-black uppercase text-[8px] tracking-widest rounded-lg cursor-pointer"
                                            >
                                                Search Spotify Catalog
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-zinc-900 pt-4 flex justify-between">
                                    <button
                                        onClick={() => handleDeleteRelease(activeRelease.id)}
                                        className="text-zinc-600 hover:text-red-500 transition-colors flex items-center gap-1.5 text-[9px] uppercase font-black tracking-widest cursor-pointer"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Retract Tracker
                                    </button>
                                    <span className="text-zinc-700 text-[8px] font-mono font-bold uppercase">{activeRelease.id}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 text-center text-zinc-500 text-xs">
                                Pick an active release card to analyze specific logs and metadata templates.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 2. STREAMING ANALYTICS */}
            {activeTab === "analytics" && (
                <div className="space-y-8">
                    {/* Bento grid Stats deck */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                            <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest font-mono">Accumulated Streams</span>
                            <h3 className="text-white text-3xl font-black tracking-tight mt-1">{totalStreams.toLocaleString()}</h3>
                            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-wider">Across all track logs</p>
                        </div>

                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                            <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest font-mono">Monthly Listeners</span>
                            <h3 className="text-emerald-500 text-3xl font-black tracking-tight mt-1">
                                {Math.round(totalStreams * 0.42).toLocaleString()}
                            </h3>
                            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-wider">Active unique listeners</p>
                        </div>

                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                            <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest font-mono">Saves & Hearts</span>
                            <h3 className="text-white text-3xl font-black tracking-tight mt-1">{totalSaves.toLocaleString()}</h3>
                            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-wider">Direct user library saves</p>
                        </div>

                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                            <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest font-mono">Playlist Placements</span>
                            <h3 className="text-white text-3xl font-black tracking-tight mt-1">{totalPlaylistAdds.toLocaleString()}</h3>
                            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-wider">Tastemaker list inclusions</p>
                        </div>
                    </div>

                    {/* Chart panel */}
                    <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-emerald-500/5 rounded-full blur-[180px] pointer-events-none" />
                        
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-white font-black text-xl uppercase tracking-tight">Streams Velocity Trajectory</h3>
                                <p className="text-zinc-500 text-xs mt-1">
                                    Displaying streams count and catalog library saves over a 14-day post-launch timeline.
                                </p>
                            </div>

                            {releases.length > 1 && (
                                <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-1.5">
                                    <span className="text-zinc-500 text-[9px] font-mono uppercase font-black">Active Context:</span>
                                    <select
                                        value={selectedReleaseId}
                                        onChange={(e) => setSelectedReleaseId(e.target.value)}
                                        className="bg-transparent border-none text-white text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer"
                                    >
                                        {releases.map(r => (
                                            <option key={r.id} value={r.id} className="bg-zinc-900 text-white uppercase">{r.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={analyticsChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="streamsColor" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#1db954" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#1db954" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="savesColor" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                                    <XAxis dataKey="name" stroke="#52525b" fontSize={10} fontFamily="monospace" tickLine={false} />
                                    <YAxis stroke="#52525b" fontSize={10} fontFamily="monospace" tickLine={false} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: "12px" }} 
                                        labelStyle={{ color: "#ffffff", fontFamily: "monospace", fontSize: "10px" }}
                                        itemStyle={{ fontSize: "11px", fontWeight: "bold" }}
                                    />
                                    <Area type="monotone" dataKey="Streams" stroke="#1db954" strokeWidth={3} fillOpacity={1} fill="url(#streamsColor)" />
                                    <Area type="monotone" dataKey="Saves" stroke="#ffffff" strokeWidth={2} fillOpacity={1} fill="url(#savesColor)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="flex items-center gap-6 border-t border-zinc-900 pt-6">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-emerald-500 rounded-full" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total Streams</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-white rounded-full" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Track Saves</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 3. MARKETING PLANNER */}
            {activeTab === "planner" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Active releases and status picker */}
                    <div className="space-y-4 lg:col-span-1">
                        <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
                            <h3 className="text-white font-black text-sm uppercase tracking-tight">Plan Context Release</h3>
                            <p className="text-zinc-500 text-xs">
                                Select a track to align and trigger pre-release marketing campaigns.
                            </p>

                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {releases.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => setSelectedReleaseId(r.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                                            r.id === selectedReleaseId
                                                ? "bg-zinc-900 border-emerald-500/30 text-white"
                                                : "bg-zinc-950 border-zinc-900 hover:border-zinc-800 text-zinc-400"
                                        }`}
                                    >
                                        <img src={r.imageUrl} className="w-10 h-10 rounded-lg object-cover" alt="" referrerPolicy="no-referrer" />
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-xs text-white truncate">{r.name}</h4>
                                            <span className="text-[8px] font-mono text-zinc-500 uppercase font-black">{r.status}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeRelease && (
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
                                <h3 className="text-white font-black text-sm uppercase tracking-tight">Campaign Metadata</h3>
                                <div className="space-y-3 font-mono text-[10px]">
                                    <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                                        <span className="text-zinc-500 text-[8px] uppercase tracking-wider block font-bold">Release Date Target</span>
                                        <span className="text-white font-bold mt-1 block">{activeRelease.releaseDate}</span>
                                    </div>
                                    <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                                        <span className="text-zinc-500 text-[8px] uppercase tracking-wider block font-bold">UPC Master Key</span>
                                        <span className="text-white font-bold mt-1 block">{activeRelease.upc}</span>
                                    </div>
                                    <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                                        <span className="text-zinc-500 text-[8px] uppercase tracking-wider block font-bold">ISRC Ingest Code</span>
                                        <span className="text-white font-bold mt-1 block">{activeRelease.isrc}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Timeline road map */}
                    <div className="lg:col-span-2 space-y-6">
                        {activeRelease ? (
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-8 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
                                
                                <div>
                                    <h3 className="text-white font-black text-xl uppercase tracking-tight leading-none">
                                        Marketing Roadmap: {activeRelease.name}
                                    </h3>
                                    <p className="text-zinc-500 text-xs mt-1.5">
                                        Complete the milestone checklist below. Keep your status aligned to maximize algorithm indexing.
                                    </p>
                                </div>

                                <div className="relative border-l border-zinc-900 ml-4 pl-8 space-y-8">
                                    {marketingMilestones.map((m, idx) => {
                                        // Check if this milestone or a later milestone is active
                                        const milestoneIndex = marketingMilestones.findIndex(x => x.stage === activeRelease.marketingStage);
                                        const isCompleted = idx < milestoneIndex || activeRelease.status === "Released";
                                        const isActive = idx === milestoneIndex && activeRelease.status !== "Released";

                                        return (
                                            <div key={m.stage} className="relative group">
                                                {/* Dot index icon */}
                                                <div className={`absolute -left-[41px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center border font-mono text-[9px] font-black transition-all ${
                                                    isCompleted 
                                                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-md shadow-emerald-500/15" 
                                                        : isActive 
                                                            ? "bg-blue-500/10 border-blue-500 text-blue-500" 
                                                            : "bg-zinc-950 border-zinc-900 text-zinc-600"
                                                }`}>
                                                    {isCompleted ? "✓" : idx + 1}
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className={`font-bold text-sm uppercase tracking-tight ${
                                                            isCompleted ? "text-zinc-400 line-through" : isActive ? "text-white" : "text-zinc-500"
                                                        }`}>
                                                            {m.label}
                                                        </h4>
                                                        <span className="text-[9px] font-mono text-zinc-600 uppercase font-bold">{m.leadTime}</span>
                                                    </div>
                                                    <p className={`text-xs max-w-xl leading-normal ${
                                                        isCompleted ? "text-zinc-600" : isActive ? "text-zinc-400" : "text-zinc-600"
                                                    }`}>
                                                        {m.desc}
                                                    </p>

                                                    {/* Toggle Milestone execution state */}
                                                    <button
                                                        onClick={() => {
                                                            if (isCompleted || isActive) {
                                                                handleUpdateRelease(activeRelease.id, { marketingStage: m.stage });
                                                            } else {
                                                                handleUpdateRelease(activeRelease.id, { marketingStage: m.stage });
                                                            }
                                                        }}
                                                        className={`mt-2 px-3 py-1 border rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer ${
                                                            isActive 
                                                                ? "bg-blue-950/40 border-blue-500/30 text-blue-400 hover:bg-blue-950" 
                                                                : isCompleted 
                                                                    ? "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-400" 
                                                                    : "bg-zinc-950 border-zinc-900 hover:border-zinc-800 text-zinc-500 hover:text-white"
                                                        }`}
                                                    >
                                                        {isCompleted ? "Redo Stage" : isActive ? "Active Phase" : "Set Active"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-12 text-center text-zinc-500 text-xs">
                                Create or select a release tracker first to plan marketing schedules.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 4. SPOTIFY SEARCH UTILITY */}
            {activeTab === "catalog" && (
                <div className="space-y-6">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-white font-black text-sm uppercase tracking-tight">Spotify Catalog Database Query</h3>
                                <p className="text-zinc-500 text-xs mt-1">
                                    Query Spotify's live database for existing tracks, albums, or artists to link real metadata to your portal trackers.
                                </p>
                            </div>

                            {selectedReleaseForLink && (
                                <div className="bg-emerald-950/20 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-3">
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                    <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                                        Linking Track: {releases.find(r => r.id === selectedReleaseForLink)?.name}
                                    </span>
                                    <button 
                                        onClick={() => setSelectedReleaseForLink(null)} 
                                        className="text-zinc-400 hover:text-white text-xs font-bold"
                                    >
                                        [Cancel]
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Search input bar */}
                        <form onSubmit={handleSpotifySearch} className="flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                <input
                                    type="text"
                                    placeholder="Search song titles, album tags, or artist names..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-900 hover:bg-zinc-850 focus:bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-xl pl-12 pr-4 py-3.5 text-xs text-white placeholder-zinc-600 outline-none transition-all"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSearching}
                                className="px-6 py-3.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-white font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                            >
                                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 text-emerald-500" />}
                                Search Spotify
                            </button>
                        </form>
                    </div>

                    {/* Catalog results grid */}
                    {searchResults.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {searchResults.map(t => (
                                <div 
                                    key={t.id} 
                                    className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-zinc-800 transition-all"
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <img 
                                            src={t.imageUrl} 
                                            className="w-12 h-12 rounded-lg object-cover border border-zinc-800 shrink-0" 
                                            alt={t.name} 
                                            referrerPolicy="no-referrer"
                                        />
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-xs text-white truncate">{t.name}</h4>
                                            <p className="text-zinc-500 text-[10px] font-semibold truncate mt-0.5">{t.artist}</p>
                                            <p className="text-[9px] font-mono text-zinc-600 truncate mt-1">{t.albumName}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right font-mono text-[9px] text-zinc-500">
                                            <span>Popularity</span>
                                            <span className="text-emerald-500 font-bold block">{t.popularity}%</span>
                                        </div>

                                        {selectedReleaseForLink ? (
                                            <button
                                                onClick={() => linkSpotifyTrackToRelease(t.id, t.spotifyUrl, t.imageUrl, t.popularity)}
                                                className="px-3 py-2 bg-emerald-500 hover:bg-emerald-450 text-black font-black uppercase text-[8px] tracking-widest rounded-lg cursor-pointer"
                                            >
                                                Link Track
                                            </button>
                                        ) : (
                                            <div className="flex gap-2">
                                                <a
                                                    href={t.spotifyUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors"
                                                    title="Listen on Spotify"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                                <button
                                                    onClick={() => {
                                                        // Auto initialize a new release tracker from this search item
                                                        setNewReleaseName(t.name);
                                                        setNewReleaseArtist(t.artist);
                                                        setNewReleaseAlbum(t.albumName);
                                                        setNewReleaseStatus("Released");
                                                        setNewReleaseImage(t.imageUrl);
                                                        setShowAddModal(true);
                                                    }}
                                                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-white font-black uppercase text-[8px] tracking-widest rounded-lg cursor-pointer"
                                                >
                                                    Track Release
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : searchQuery && !isSearching ? (
                        <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-12 text-center text-zinc-500 text-xs">
                            No matching tracks found on Spotify database. Use another query or double check spelling filters.
                        </div>
                    ) : (
                        <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-12 text-center">
                            <Disc className="w-10 h-10 text-zinc-700 mx-auto mb-3 animate-spin" style={{ animationDuration: '12s' }} />
                            <p className="text-zinc-500 text-xs uppercase font-bold tracking-wider">Catalog Ready</p>
                            <p className="text-zinc-600 text-[10px] mt-1 max-w-sm mx-auto">
                                Search for any live song on Spotify to import metadata or preview embed players instantly.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* POPUP MODAL: CREATE NEW TRACK TRACKER */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        {/* Backdrop overlay */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowAddModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        />

                        {/* Modal window container */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 max-w-lg w-full relative z-10 space-y-6 shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />

                            <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                                <h3 className="text-white font-black text-lg uppercase tracking-tight">Create Release Tracker</h3>
                                <button 
                                    onClick={() => setShowAddModal(false)}
                                    className="text-zinc-500 hover:text-white text-xs uppercase font-bold"
                                >
                                    [Close]
                                </button>
                            </div>

                            <form onSubmit={handleAddRelease} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">Track Release Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Keep Em' Thirsty (Remix)"
                                        value={newReleaseName}
                                        onChange={(e) => setNewReleaseName(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">Artist / Producer</label>
                                        <input
                                            type="text"
                                            value={newReleaseArtist}
                                            onChange={(e) => setNewReleaseArtist(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">Album / Single Name</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Single"
                                            value={newReleaseAlbum}
                                            onChange={(e) => setNewReleaseAlbum(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">Release Status</label>
                                        <select
                                            value={newReleaseStatus}
                                            onChange={(e) => setNewReleaseStatus(e.target.value as any)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors uppercase font-bold tracking-wider"
                                        >
                                            <option value="In Production">In Production</option>
                                            <option value="Distributed">Distributed</option>
                                            <option value="Scheduled">Scheduled</option>
                                            <option value="Released">Released</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">Target Date</label>
                                        <input
                                            type="date"
                                            value={newReleaseDate}
                                            onChange={(e) => setNewReleaseDate(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">UPC Code (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="Auto-generated if blank"
                                            value={newReleaseUPC}
                                            onChange={(e) => setNewReleaseUPC(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">ISRC Code (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="Auto-generated if blank"
                                            value={newReleaseISRC}
                                            onChange={(e) => setNewReleaseISRC(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-zinc-500 text-[9px] font-black uppercase tracking-widest block font-mono">Artwork Image URL</label>
                                    <input
                                        type="text"
                                        value={newReleaseImage}
                                        onChange={(e) => setNewReleaseImage(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-zinc-700 transition-colors font-mono"
                                    />
                                </div>

                                <div className="border-t border-zinc-900 pt-5 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
                                        className="px-5 py-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white font-bold uppercase text-[10px] tracking-wider rounded-xl cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-450 text-black font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer"
                                    >
                                        Initialize Tracker
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

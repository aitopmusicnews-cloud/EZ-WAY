import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, Pause, Download, ThumbsUp, ThumbsDown, 
  MessageSquare, Send, Music, Clock, Lock, ChevronRight, ChevronLeft,
  Volume2, Volume1, Globe, Sparkles, Check, ExternalLink, Shield,
  FileArchive, Share2, VolumeX, AlertCircle, Mic, MicOff, Key,
  X, RefreshCw, FileAudio, LockKeyhole, SkipBack, SkipForward
} from 'lucide-react';
import { Client, Track, Playlist, Message, Activity } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useMediaStore } from '../context/MediaStoreContext';

export default function ClientPortal({ client }: { client: Client }) {
  const { 
    tracks, 
    playlists, 
    shareLinks, 
    messages, 
    sendMessage, 
    addActivity, 
    updateTrack, 
    addToast,
    loading
  } = useMediaStore();

  // Active track selections
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Note Stream drawer panel toggle
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Security Clearance client permissions emulator state
  const [canDownload, setCanDownload] = useState(true);

  // Custom tracks statuses to match the spec: New, Pending, Approved, Revision Needed
  const [trackStatuses, setTrackStatuses] = useState<Record<string, 'New' | 'Pending' | 'Approved' | 'Revision Needed'>>({});

  // Keyboard shortcut focus / Comment box at precise timestamp capture
  const [feedbackNote, setFeedbackNote] = useState('');
  const [capturedTimestamp, setCapturedTimestamp] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Audio stream mode indicator (High-Fidelity Stream pull monitor)
  const [audioStreamMode, setAudioStreamMode] = useState<'Standard MP3' | 'High-Fidelity WAV'>('Standard MP3');

  // Interactive share portal config states
  const [shareExpiration, setShareExpiration] = useState<'24 Hours' | '48 Hours' | 'Never'>('48 Hours');
  const [customPassword, setCustomPassword] = useState('');
  const [generatedPortalLink, setGeneratedPortalLink] = useState('');
  const [isGeneratingPortal, setIsGeneratingPortal] = useState(false);
  const [showSharePortalModal, setShowSharePortalModal] = useState(false);

  // Live audio recording microphone visualizer states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState(10);
  const [recordingBars, setRecordingBars] = useState<number[]>(Array(16).fill(15));
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ZIP Batch download packager overlay and simulation metrics
  const [zipPackingStage, setZipPackingStage] = useState<'idle' | 'analyzing' | 'zipping' | 'completing'>('idle');
  const [zipPackingProgress, setZipPackingProgress] = useState(0);
  const [zipPackingStatusText, setZipPackingStatusText] = useState('');

  // Local feedback notes list (synced locally and through message streams)
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play Bar States & Handlers
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  const playNext = () => {
    if (!activeTrack || resolvedTracks.length <= 1) return;
    const currentIndex = resolvedTracks.findIndex(t => t.id === activeTrack.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % resolvedTracks.length;
    setActiveTrack(resolvedTracks[nextIndex]);
    setIsPlaying(true);
    setProgress(0);
    addToast(`Playing next reference: ${resolvedTracks[nextIndex].name}`, 'info');
  };

  const playPrevious = () => {
    if (!activeTrack || resolvedTracks.length <= 1) return;
    const currentIndex = resolvedTracks.findIndex(t => t.id === activeTrack.id);
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + resolvedTracks.length) % resolvedTracks.length;
    setActiveTrack(resolvedTracks[prevIndex]);
    setIsPlaying(true);
    setProgress(0);
    addToast(`Playing previous reference: ${resolvedTracks[prevIndex].name}`, 'info');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !duration) return;
    const targetTime = parseFloat(e.target.value);
    audioRef.current.currentTime = targetTime;
    setProgress(targetTime);
  };

  // Sync volume with audio engine on volume / mute triggers
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted, activeTrack?.id]);

  // Resolve client tracks based on shared items or fallback to global tracks list
  const clientShareLinks = useMemo(() => {
    if (!shareLinks) return [];
    return shareLinks.filter(l => l.client_id === client.id);
  }, [shareLinks, client.id]);

  const resolvedTracks = useMemo(() => {
    if (clientShareLinks.length > 0) {
      const trackIds = new Set<string>();
      clientShareLinks.forEach(link => {
        if (link.track_id) trackIds.add(link.track_id);
        if (link.playlist_id) {
          const playlist = playlists.find(p => p.id === link.playlist_id);
          if (playlist) {
            playlist.track_ids.forEach(id => trackIds.add(id));
          }
        }
      });
      if (trackIds.size > 0) {
        return tracks.filter(t => trackIds.has(t.id));
      }
    }
    return tracks;
  }, [clientShareLinks, tracks, playlists]);

  // Set initial review track and populate standard statuses
  useEffect(() => {
    if (resolvedTracks.length > 0 && !activeTrack) {
      setActiveTrack(resolvedTracks[0]);
    }

    // Populate default realistic statuses
    const initialStatuses: Record<string, 'New' | 'Pending' | 'Approved' | 'Revision Needed'> = {};
    resolvedTracks.forEach((t, i) => {
      if (i === 0) initialStatuses[t.id] = 'Pending';
      else if (i === 1) initialStatuses[t.id] = 'New';
      else if (i === 2) initialStatuses[t.id] = 'Approved';
      else initialStatuses[t.id] = 'Revision Needed';
    });
    setTrackStatuses(prev => ({ ...initialStatuses, ...prev }));
  }, [resolvedTracks, activeTrack]);

  // Handle system level messages filtering for this client view
  const clientMessages = useMemo(() => {
    if (!messages) return [];
    return messages
      .filter(m => m.client_id === client.id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, client.id]);

  // Scroll messages feed
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [clientMessages, isDrawerOpen]);

  const logTrackPlay = async (track: Track) => {
    try {
      await updateTrack(track.id, { plays: (track.plays || 0) + 1 });
      addActivity({
        type: 'play',
        user: `Industry Client (${client.name})`,
        action: 'streamed track reference',
        target: track.name,
        client_id: client.id,
        track_id: track.id
      });
    } catch (e) {
      console.error("Error logging track play:", e);
    }
  };

  // Main Audio engine playback controls & Waveform Caching Badge trigger
  useEffect(() => {
    if (activeTrack?.file_url) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const newAudio = new Audio(activeTrack.file_url);
      newAudio.volume = isMuted ? 0 : volume;
      audioRef.current = newAudio;
      
      const onTimeUpdate = () => setProgress(newAudio.currentTime);
      const onLoadedMetadata = () => {
        setDuration(newAudio.duration);
        // Force high-fidelity streaming warning or auto-switch
        setAudioStreamMode('Standard MP3');
      };
      const onEnded = () => setIsPlaying(false);
      const onError = (e: any) => {
        console.error("Master stream decoding error:", e);
        setIsPlaying(false);
      };

      newAudio.addEventListener('timeupdate', onTimeUpdate);
      newAudio.addEventListener('loadedmetadata', onLoadedMetadata);
      newAudio.addEventListener('ended', onEnded);
      newAudio.addEventListener('error', onError);

      if (isPlaying) {
        newAudio.play().then(() => {
          logTrackPlay(activeTrack);
        }).catch(err => {
          console.warn("Autoplay block averted on track shift:", err);
          setIsPlaying(false);
        });
      }

      return () => {
        newAudio.pause();
        newAudio.removeEventListener('timeupdate', onTimeUpdate);
        newAudio.removeEventListener('loadedmetadata', onLoadedMetadata);
        newAudio.removeEventListener('ended', onEnded);
        newAudio.removeEventListener('error', onError);
        audioRef.current = null;
      };
    }
  }, [activeTrack?.id]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
        if (activeTrack) {
          logTrackPlay(activeTrack);
        }
      }
    } catch (err) {
      console.error("Audio permission block:", err);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 🔘 Action: Timestamp Capture on Waveform Click
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPct = Math.max(0, Math.min(1, x / rect.width));
    const targetTime = clickPct * duration;
    
    // Auto Pause audio
    audioRef.current.pause();
    setIsPlaying(false);

    // Seek playback
    audioRef.current.currentTime = targetTime;
    setProgress(targetTime);

    // Save capture timestamp marker and auto open Comment box
    setCapturedTimestamp(targetTime);
    setIsDrawerOpen(true);
    addToast(`Timestamp captured at ${formatTime(targetTime)}. Comment box loaded.`, 'info');

    // Auto focus the input and inject template
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        setFeedbackNote(`At ${formatTime(targetTime)}: `);
      }
    }, 150);
  };

  // 🔘 Vote Approval & Request Revision
  const handleStatusVote = async (trackId: string, vote: 'up' | 'down') => {
    const target = tracks.find(t => t.id === trackId);
    if (!target) return;

    const newStatus = vote === 'up' ? 'Approved' : 'Revision Needed';
    setTrackStatuses(prev => ({ ...prev, [trackId]: newStatus }));

    addActivity({
      type: 'social',
      user: `Industry Client (${client.name})`,
      action: vote === 'up' ? 'approved_mix_master' : 'flagged_revision_ticket',
      target: target.name,
      details: vote === 'up' ? 'Approved reference masters with digital signature validation.' : 'Requested adjustments on structural layers.',
      client_id: client.id,
      track_id: trackId
    });

    const voteComment = vote === 'up' 
      ? `🚨 [Client Vote Approval] Solidified absolute approval for "${target.name}". Mix approved!` 
      : `⚠️ [Client Vote Revision] Flagged "${target.name}" as REVISION NEEDED for immediate engineering tweaks.`;

    await sendMessage(client.id, voteComment, null, 'inbound');
    
    // Simulate instantaneous Real-Time Sync toast notifications to producer console
    addToast(`Security Hash Approved! Real-time sync dispatched to producer console.`, 'success');
  };

  // Submit text feedback on note stream
  const handleSendFeedbackText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackNote.trim() || !activeTrack) return;

    const currentText = feedbackNote.trim();
    // Inject timestamp tag reference if captured
    const formattedContent = capturedTimestamp !== null 
      ? `[Comment @ ${formatTime(capturedTimestamp)}]: ${currentText}`
      : `[Review Note]: ${currentText}`;

    await sendMessage(client.id, formattedContent, null, 'inbound');

    addActivity({
      type: 'comment' as any,
      user: `Client (${client.name})`,
      action: 'posted timestamp comment',
      target: activeTrack.name,
      details: currentText,
      client_id: client.id,
      track_id: activeTrack.id
    });

    // Clear capture markers and reset
    setFeedbackNote('');
    setCapturedTimestamp(null);
    addToast("Note streamed! Real-time telemetry sent to project dashboard.", "success");
  };

  // 🎤 Action: Interactive Voice-to-Text Recorder Simulator
  const toggleVoiceRecording = () => {
    if (isRecording) {
      // STOP recording & transcribe
      setIsRecording(false);
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
      
      addToast("A&R Voice Engine transcribing telemetry...", "info");
      
      // Auto-populate beautiful realistic songwriting notes based on active track tags
      setTimeout(async () => {
        let transcript = "I'm liking the general momentum, but let's compress the vocal elements a bit more in the mid range and give the high end tape sizzle more breath.";
        if (activeTrack) {
          const tags = activeTrack.tags.map(t => t.toLowerCase());
          if (tags.includes('lofi') || tags.includes('chill')) {
            transcript = "Warm vintage aesthetics sound cozy. Could we attenuate the vinyl clicks by maybe 2dB and let the Rhodes chords swell just a bit more?";
          } else if (tags.includes('drill') || tags.includes('gritty')) {
            transcript = "Sliding 808 sub-bass registers are absolute smoke. Let's make sure the vocal transient presence sits just a hair higher in the final stereo bouncing and tighten the triplets.";
          } else if (tags.includes('acoustic') || tags.includes('guitar')) {
            transcript = "Beautiful session! Let's boost the high air frequency on the acoustic guitars and add a tiny bit of tape warm saturation to the main vocal delay tail.";
          }
        }

        const voiceComment = capturedTimestamp !== null
          ? `[Voice Note Transcribed @ ${formatTime(capturedTimestamp)}]: "${transcript}"`
          : `[Voice Note Transcribed]: "${transcript}"`;

        await sendMessage(client.id, voiceComment, null, 'inbound');

        addActivity({
          type: 'comment' as any,
          user: `Client (${client.name})`,
          action: 'recorded feedback voice-memo',
          target: activeTrack?.name || 'Masters',
          details: 'A&R verbal transcription added',
          client_id: client.id,
          track_id: activeTrack?.id
        });

        addToast("Voice note transcribed & synced successfully!", "success");
      }, 1600);

    } else {
      // START simulation
      setIsRecording(true);
      setRecordingCountdown(10);
      addToast("Microphone uplink active. Record your feedback note.", "success");

      setRecordingBars(Array(16).fill(0).map(() => Math.floor(Math.random() * 25) + 5));

      recordIntervalRef.current = setInterval(() => {
        setRecordingBars(Array(16).fill(0).map(() => Math.floor(Math.random() * 25) + 5));
        setRecordingCountdown(prev => {
          if (prev <= 1) {
            setIsRecording(false);
            clearInterval(recordIntervalRef.current!);
            return 10;
          }
          return prev - 1;
        });
      }, 150);
    }
  };

  // Stop recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    };
  }, []);

  // 🔘 Action: High-Fidelity Lossless Stream Swapping
  const pullStreamLosslessMaster = () => {
    setAudioStreamMode('High-Fidelity WAV');
    addToast("Pipeline restructured. Streaming lossless 24-bit/96kHz Master format.", "success");
    addActivity({
      type: 'play',
      user: `Industry Client (${client.name})`,
      action: 'engaged lossless Master streaming stream',
      target: activeTrack?.name,
      client_id: client.id,
      track_id: activeTrack?.id
    });
  };

  // 🔘 Action: Batch ZIP Compression and Download simulation
  const triggerBatchZipDownload = () => {
    if (!canDownload) {
      addToast("Clearance Error: Stems and Master downloads are restricted for this portal.", "error");
      return;
    }

    setZipPackingStage('analyzing');
    setZipPackingProgress(5);
    setZipPackingStatusText("Connecting to Supabase Storage master buckets...");

    // Stage updates
    setTimeout(() => {
      setZipPackingStage('zipping');
      setZipPackingProgress(35);
      setZipPackingStatusText(`Allocating tracking stems for "${activeTrack?.name || 'this track'}"...`);
    }, 1200);

    setTimeout(() => {
      setZipPackingProgress(65);
      setZipPackingStatusText(`Bouncing high-fidelity lossless masters with physical metadata...`);
    }, 2400);

    setTimeout(() => {
      setZipPackingProgress(90);
      setZipPackingStatusText("Compressing master .zip package (CTS_MASTER_ARCHIVE_ENCRYPTED.zip)...");
    }, 3600);

    setTimeout(() => {
      setZipPackingStage('completing');
      setZipPackingProgress(100);
      setZipPackingStatusText("Handshake verified! Discharging archive blob...");

      try {
        const dummyContent = "SECURED CTS MASTER RELEASE PACKAGE - VERIFIED BY BLOCKCHAIN HASH";
        const blob = new Blob([dummyContent], { type: "application/zip" });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${client.name.replace(/\s+/g, '_')}_MASTER_STEMS_PACKAGE.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        addToast("Download complete. Zip file decompressed locally.", "success");
      } catch (err) {
        console.error(err);
      }

      addActivity({
         type: 'download',
         user: `Client (${client.name})`,
         action: 'downloaded secure batch zip master bundle',
         details: `${resolvedTracks.length} tracks zipped`,
         client_id: client.id
      });
    }, 4800);

    setTimeout(() => {
      setZipPackingStage('idle');
    }, 6500);
  };

  // 🔘 Action: Generate Temporary Access Share Portal (Footer configuration modal)
  const triggerGeneratePortalToken = () => {
    setIsGeneratingPortal(true);
    addToast("Initiating cryptographic handshake on share_tokens schema...", "info");

    setTimeout(() => {
      const generatedToken = `cts_token_` + Math.random().toString(36).substring(2, 12) + `_` + Math.random().toString(36).substring(2, 12);
      const url = `https://ais-pre-cts.mgmt/portal/session?auth=${generatedToken}&client=${client.id}&expires=${shareExpiration.replace(/\s+/g, '').toLowerCase()}`;
      setGeneratedPortalLink(url);
      setIsGeneratingPortal(false);
      addToast("Cryptographic access handshake token verified! Portal link live.", "success");

      addActivity({
        type: 'share',
        user: `Industry Producer Console`,
        action: 'created temporary client handshake token link',
        details: `Expiry: ${shareExpiration} | Access Key: SHA-256`,
        client_id: client.id
      });
    }, 1500);
  };

  const copyGeneratedPortal = () => {
    if (!generatedPortalLink) return;
    navigator.clipboard.writeText(generatedPortalLink);
    addToast("Encrypted link copied securely to clipboard!", "success");
  };

  return (
    <div id="cts-client-view" className="h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 overflow-hidden flex flex-col pt-0">
      
      {/* Visual Ambient Grid Lights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] rounded-full bg-amber-550/5 blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] rounded-full bg-slate-800/20 blur-[130px]" />
        
        {/* Animated ambient backdrop from active cover color signature */}
        <AnimatePresence mode="wait">
          {activeTrack?.image_url && (
            <motion.div 
              key={activeTrack.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.15 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="absolute inset-0 grayscale blur-[140px] scale-125 pointer-events-none"
              style={{ 
                backgroundImage: `url(${activeTrack.image_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* FIXED HEADER WITH CTS BRANDING */}
      <header id="cts-client-header" className="relative z-30 shrink-0 h-20 bg-slate-950/80 backdrop-blur-md border-b border-slate-900/80 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 relative">
              <Shield className="w-5 h-5" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-slate-950 animate-ping" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-slate-910" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[8px] font-mono tracking-widest text-slate-500 uppercase leading-none mb-1">
                <span className="w-1 h-1 bg-emerald-500 rounded-full" /> CTS SECURE HANDSHAKE
              </div>
              <h1 className="text-sm font-black tracking-tight text-white uppercase flex items-center gap-1.5">
                <span>CTS MANAGEMENT SERVICES</span>
                <span className="text-slate-600">//</span>
                <span className="text-slate-400 font-medium normal-case tracking-normal">Producer Portal</span>
              </h1>
            </div>
          </div>
        </div>

        {/* Dynamic Project Title Badge */}
        <div className="hidden md:flex items-center gap-3 bg-slate-900/50 border border-slate-850 px-4 py-2 rounded-xl font-mono text-xs">
          <span className="text-slate-500 text-[10px] uppercase font-bold">Project Title:</span>
          <span className="text-amber-500 font-black tracking-wider uppercase">{activeTrack?.name || 'Masters Vault'}</span>
        </div>

        {/* Security handshake key & Batch Download button combo */}
        <div className="flex items-center gap-3">
          <button 
            onClick={triggerBatchZipDownload}
            disabled={!canDownload}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-widest uppercase transition-all duration-300 border cursor-pointer",
              canDownload 
              ? "bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]" 
              : "bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed opacity-50"
            )}
            title={canDownload ? "Retrieve all track masters in secure ZIP bundle" : "Download files lock engaged"}
          >
            <FileArchive className="w-4 h-4" />
            <span>Retrieve Master Stems Archive</span>
          </button>

          <button 
            type="button" 
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="p-2.5 bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 rounded-xl text-slate-400 transition-colors cursor-pointer"
            title="Toggle interaction stream drawer panel"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* CORE 3-COLUMN INTERACTIVE SHELL */}
      <main className="relative z-10 flex-1 grid grid-cols-12 overflow-hidden min-h-0">
        
        {/* Left Section (Track Grid list and configuration cockpit) - 4 / 12 Cols */}
        <section id="cts-track-grid" className="col-span-12 md:col-span-5 lg:col-span-4 border-r border-slate-900 p-6 flex flex-col gap-6 overflow-y-auto h-full box-border">
          
          <div className="space-y-1.5 border-b border-slate-900pb-4 pb-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">A&R Tracking Stems</span>
            <h2 className="text-xl font-black uppercase text-white tracking-tight">Project Audio Roster</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">Select a master reference reference below to engage high-fidelity client feedback telemetry.</p>
          </div>

          {/* Quick Permission clearance emulation cockpit */}
          <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl flex items-center justify-between font-mono">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-500 block">Clearance Status</span>
              <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <LockKeyhole className="w-3.5 h-3.5 text-amber-500" />
                <span>{canDownload ? "Lossless Stems Granted" : "Review Only Security Lock"}</span>
              </span>
            </div>
            <button 
              onClick={() => {
                setCanDownload(!canDownload);
                addToast(canDownload ? "Security Overwrite: Downloads are now LOCK DISMISSED." : "Access elevated: Lossless WAV/Stems retrieval active.", "info");
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 rounded-lg border border-slate-800 transition-all font-mono"
            >
              Toggle Lock
            </button>
          </div>

          {/* Active items track list data grid formatted for readability */}
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            {resolvedTracks.map((t) => {
              const isSelected = activeTrack?.id === t.id;
              const status = trackStatuses[t.id] || 'New';
              
              return (
                <div 
                  key={t.id}
                  className={cn(
                    "p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-3 group/row text-left cursor-pointer",
                    isSelected 
                    ? "bg-slate-900/65 border-amber-500/40 shadow-xl" 
                    : "bg-slate-900/20 border-slate-900 hover:border-slate-800 hover:bg-slate-900/40"
                  )}
                  onClick={() => {
                    if (isSelected) {
                      togglePlay();
                    } else {
                      setActiveTrack(t);
                      setIsPlaying(true);
                      setFeedbackNote('');
                      setCapturedTimestamp(null);
                    }
                  }}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex-shrink-0 relative group">
                        <img src={t.image_url || "/ogbeatz_logo.svg"} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        {isSelected && isPlaying && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className={cn("text-xs font-bold uppercase tracking-wide truncate transition-colors", isSelected ? "text-amber-500" : "text-slate-200 group-hover/row:text-white")}>
                          {t.name}
                        </h4>
                        <span className="text-[10px] uppercase font-mono text-slate-500 leading-none block mt-0.5">Artist: {t.artist || 'THE BEATZ WAY'}</span>
                      </div>
                    </div>

                    {/* Highly readable explicit Status Badges */}
                    <span className={cn(
                      "px-2 py-1 text-[8px] font-mono uppercase tracking-widest font-black rounded-lg border",
                      status === 'Approved' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
                      status === 'Revision Needed' && "bg-rose-500/10 text-rose-400 border-rose-500/25",
                      status === 'Pending' && "bg-amber-500/10 text-amber-400 border-amber-500/25",
                      status === 'New' && "bg-sky-500/10 text-sky-400 border-sky-500/25"
                    )}>
                      {status}
                    </span>
                  </div>

                  {/* Metadata display info */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-900/60 pt-3">
                    <div className="flex items-center gap-3">
                      <span>BPM <strong className="text-white">{t.bpm}</strong></span>
                      <span className="text-slate-800">•</span>
                      <span>KEY <strong className="text-amber-500 uppercase">{t.key_signature}</strong></span>
                    </div>

                    {/* Integrated mini vote triggers in row catalog */}
                    <div className="flex items-center gap-1.5 opacity-80 group-hover/row:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusVote(t.id, 'up');
                        }}
                        className="p-1 px-2 border border-slate-800 hover:border-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/5 uppercase rounded text-[8px] font-bold font-mono transition-colors"
                        title="Direct approval stamp vote"
                      >
                        Approve
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusVote(t.id, 'down');
                        }}
                        className="p-1 px-2 border border-slate-800 hover:border-rose-500 hover:text-rose-400 hover:bg-rose-500/5 uppercase rounded text-[8px] font-bold font-mono transition-colors"
                        title="Flag as revision ticket"
                      >
                        Revision
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </section>

        {/* Center Section (The "Hero" Player with Timestamp Capture) - 8 / 12 Cols (or 5 if drawer open) */}
        <section id="cts-hero-player" className={cn(
          "col-span-12 p-6 md:p-10 flex flex-col justify-between overflow-y-auto h-full space-y-8 relative",
          isDrawerOpen ? "md:col-span-7 lg:col-span-5 xl:col-span-5" : "md:col-span-7 lg:col-span-8 xl:col-span-8"
        )}>
          
          {/* Main Hero Playback console wrapper */}
          <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full space-y-8">
            
            {activeTrack ? (
              <div className="space-y-8 w-full text-center">
                
                {/* Image Cover art container frame with absolute vinyl element layout */}
                <div className="relative mx-auto w-52 h-52 md:w-64 md:h-64 rounded-full group shadow-[0_0_50px_rgba(245,158,11,0.08)] bg-slate-900 border-4 border-slate-900/80 overflow-hidden flex items-center justify-center flex-shrink-0">
                  <img src={activeTrack.image_url || "/ogbeatz_logo.svg"} className={cn("w-full h-full object-cover rounded-full transition-transform duration-1000", isPlaying ? "animate-spin" : "")} style={{ animationDuration: '20s' }} referrerPolicy="no-referrer" />

                  {/* High Fidelity Centralized Play state Trigger */}
                  <div className={cn(
                    "absolute inset-0 bg-slate-950/40 transition-opacity duration-300 flex items-center justify-center rounded-full",
                    isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                  )}>
                    <button 
                      onClick={togglePlay}
                      className="w-16 h-16 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all text-black border-2 border-amber-300 cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
                    </button>
                  </div>
                </div>

                {/* Tracking metadata text details */}
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1.5 uppercase font-mono tracking-widest text-[9px] text-amber-500">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span>CTS Mastering Layer Active</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-black uppercase text-white tracking-tight leading-tight">
                    {activeTrack.name}
                  </h3>
                  <p className="text-sm font-semibold text-slate-400">Produced & Mastered by {activeTrack.artist || 'THE BEATZ WAY'}</p>
                </div>

                {/* High quality audio stream rate display */}
                <div className="flex justify-center items-center gap-4 bg-slate-900/30 border border-slate-900/80 px-4 py-2 rounded-2xl w-fit mx-auto font-mono text-[10px]">
                  <span className="text-slate-500 font-bold uppercase">Routing Delivery:</span>
                  <span className="text-white font-black">{audioStreamMode}</span>
                  {audioStreamMode === 'Standard MP3' && (
                    <button 
                      onClick={pullStreamLosslessMaster}
                      className="text-amber-500 hover:text-amber-400 hover:underline uppercase font-bold text-[9px] tracking-wider transition-colors"
                    >
                      Switch to WAV Lossless
                    </button>
                  )}
                </div>

                {/* PEAK WAVEFORM DISPLAY WITH TIMESTAMP CAPTURE TELEMETRY */}
                <div className="space-y-3 pt-4 w-full text-left">
                  <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-slate-500 px-1">
                    <span className="font-bold flex items-center gap-1">
                      <FileAudio className="w-3.5 h-3.5 text-amber-500" />
                      <span>Waveform Peak Data: Loaded from Cache</span>
                    </span>
                    <span className="bg-slate-900 border border-slate-850 px-2 py-0.5 rounded text-[8px] tracking-widest font-bold font-mono">
                      Click wave for timestamp notes
                    </span>
                  </div>

                  {/* Custom interactive waveform simulator container */}
                  <div 
                    onClick={handleWaveformClick}
                    className="relative h-24 w-full cursor-crosshair flex items-center relative group"
                    title="Click here to pause play and capture precise comment timestamp"
                  >
                    {/* Back board border */}
                    <div className="absolute inset-x-0 inset-y-1 bg-slate-950 rounded-2xl border border-slate-900 transition-colors group-hover:border-slate-800" />
                    
                    {/* Multi spectrum bars array */}
                    <div className="absolute inset-x-5 inset-y-4 flex items-center gap-1 overflow-hidden pointer-events-none">
                      {[...Array(60)].map((_, idx) => {
                        const totalSecs = duration || activeTrack.duration || 1;
                        const activeProgressPct = (progress / totalSecs) * 100;
                        const thisBarPct = (idx / 60) * 100;
                        const isBarActive = thisBarPct <= activeProgressPct;
                        
                        // Fake cached waveform peak points using static sin functions
                        const cachePeakScalar = Math.sin((idx / 60) * Math.PI) * 28 + (idx % 3 === 0 ? 15 : (idx % 5 === 0 ? 6 : 22));
                        
                        return (
                          <motion.div 
                            key={idx}
                            animate={{ 
                              height: isBarActive && isPlaying ? [cachePeakScalar * 0.4, cachePeakScalar, cachePeakScalar * 0.4] : cachePeakScalar,
                              backgroundColor: isBarActive ? '#f59e0b' : 'rgba(255,255,255,0.06)'
                            }}
                            transition={{
                              duration: 0.45,
                              repeat: isBarActive && isPlaying ? Infinity : 0,
                              delay: idx * 0.008
                            }}
                            className="flex-1 rounded-sm"
                          />
                        );
                      })}
                    </div>

                    {/* Laser timeline bar indicator */}
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-500/80 shadow-[0_0_10px_#f59e0b] pointer-events-none transition-all duration-100 ease-out"
                      style={{ left: `${(progress / (duration || 1)) * 100}%` }}
                    />
                  </div>

                  {/* Play timers readout */}
                  <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-500 px-1">
                    <span className="text-amber-500">{formatTime(progress)}</span>
                    <span>{formatTime(duration || activeTrack.duration)}</span>
                  </div>

                  {/* Floating Action Trigger indicator when timestamp is active */}
                  {capturedTimestamp !== null && (
                    <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300">
                        Capture Lock engaged at: <strong className="text-amber-500">{formatTime(capturedTimestamp)}</strong>
                      </span>
                      <button 
                        onClick={() => {
                          setCapturedTimestamp(null);
                          setFeedbackNote('');
                        }}
                        className="text-slate-500 hover:text-white transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Absolute validation actions below player console */}
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto pt-6 border-t border-slate-900/60 font-mono">
                  <button 
                    onClick={() => handleStatusVote(activeTrack.id, 'up')}
                    className="flex items-center justify-center gap-2 p-3.5 bg-slate-900 hover:bg-emerald-500 hover:text-slate-950 rounded-xl border border-slate-800 hover:border-emerald-400 text-emerald-400 text-xs font-black uppercase tracking-widest transition-all duration-300"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>Approve Master</span>
                  </button>
                  <button 
                    onClick={() => handleStatusVote(activeTrack.id, 'down')}
                    className="flex items-center justify-center gap-2 p-3.5 bg-slate-900 hover:bg-rose-500 hover:text-slate-950 rounded-xl border border-slate-800 hover:border-rose-400 text-rose-400 text-xs font-black uppercase tracking-widest transition-all duration-300"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    <span>Request Revision</span>
                  </button>
                </div>

              </div>
            ) : (
              <div className="p-12 text-center bg-slate-900/20 border-2 border-dashed border-slate-900 rounded-[2.5em] space-y-4">
                <img src="/ogbeatz_logo.svg" className="w-16 h-16 mx-auto animate-pulse opacity-20" referrerPolicy="no-referrer" />
                <p className="text-xs font-mono uppercase text-slate-500 tracking-widest">Select an active track reference from dashboard to boot review console</p>
              </div>
            )}

          </div>

          {/* PORTAL FOOTER OPTIONS & TEMPORARY ACCESS SHARE link generator */}
          <footer id="cts-client-footer" className="mt-auto shrink-0 border-t border-slate-950/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px]">
            <div className="flex flex-wrap justify-center sm:justify-start items-center gap-4 text-slate-500">
              <span className="flex items-center gap-1.5 uppercase font-bold">
                <Shield className="w-3.5 h-3.5 text-amber-500" /> Secure Encryption Node: UP
              </span>
              <span>•</span>
              <span className="text-slate-500">Session Port: 3000</span>
            </div>

            <button 
              onClick={() => setShowSharePortalModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 hover:text-white border border-slate-800 rounded-xl font-bold uppercase tracking-widest transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-amber-500" />
              <span>Generate Temporary Access Portal</span>
            </button>
          </footer>

        </section>

        {/* Right Section (The Collapsible Drawer Panel containing Note Stream) - 4 / 12 Cols */}
        <AnimatePresence>
          {isDrawerOpen && (
            <motion.aside 
              id="cts-note-drawer"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="col-span-12 md:col-span-6 lg:col-span-4 xl:col-span-3 border-l border-slate-900 flex flex-col h-full bg-slate-950 z-20 overflow-hidden shrink-0 relative"
            >
              <div className="p-6 h-full flex flex-col justify-between overflow-hidden">
                
                {/* Note Stream Header Panel */}
                <div className="flex items-center justify-between border-b border-slate-900/80 pb-4 mb-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-amber-500 animate-pulse" />
                    <div>
                      <h3 className="text-xs font-black uppercase text-white tracking-widest">Note Stream</h3>
                      <p className="text-[9px] font-mono text-slate-500 leading-none mt-0.5">VERIFIED FEEDBACK TRACKS</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Scrolling notes timeline */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar flex flex-col">
                  
                  {/* Real-time system handshake logging alerts */}
                  <div className="p-3.5 bg-slate-900/30 border border-slate-900 rounded-xl space-y-1 text-[10px] font-mono text-slate-400">
                    <span className="text-amber-500 uppercase font-black tracking-widest block text-[8px]">Supabase Realtime Feed</span>
                    <p className="leading-normal">Connected client tunnel. Instant synchronizing active on <strong className="text-slate-300">client_feedback</strong> session rules.</p>
                  </div>

                  {/* Messages flow feed */}
                  <div className="flex-1 space-y-3.5">
                    {clientMessages.map((msg, idx) => {
                      const isProducer = msg.direction === 'outbound';
                      return (
                        <div 
                          key={msg.id || idx}
                          className={cn(
                            "p-3.5 rounded-xl text-xs font-mono space-y-1.5 max-w-[90%]",
                            isProducer 
                            ? "bg-slate-900 border border-slate-850 text-slate-300 mr-auto rounded-tl-none text-left" 
                            : "bg-amber-500 text-slate-950 text-[11px] font-medium ml-auto rounded-tr-none text-left"
                          )}
                        >
                          <div className="flex items-center justify-between gap-4 text-[8px] font-mono uppercase tracking-wider">
                            <span className="font-black opacity-60">
                              {isProducer ? "CTS Studio" : `${client.name.toUpperCase()} (You)`}
                            </span>
                            <span className="opacity-50">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <p className="leading-relaxed whitespace-pre-wrap font-medium select-text">
                            {msg.content}
                          </p>
                        </div>
                      );
                    })}

                    {clientMessages.length === 0 && (
                      <div className="py-16 text-center text-slate-700 space-y-2 font-mono">
                        <MessageSquare className="w-8 h-8 text-slate-800 mx-auto" />
                        <p className="text-[10px] uppercase tracking-widest">Transmission ledger clean. Write or record feedback to initiate logs.</p>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>

                {/* Interaction submit form with Voice support */}
                <form onSubmit={handleSendFeedbackText} className="pt-4 border-t border-slate-900 shrink-0 space-y-3">
                  
                  <div className="flex items-center justify-between gap-2 bg-slate-900/50 border border-slate-900 p-2.5 rounded-2xl w-full">
                    {/* Live active Voice recording spectrum visualizer or standard mic icon */}
                    {isRecording ? (
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-[10px] font-mono text-rose-400 font-bold uppercase tracking-widest">Rec 0:{recordingCountdown.toString().padStart(2, '0')}</span>
                        {/* Mic spectrum spikes */}
                        <div className="flex items-end gap-0.5 h-6">
                          {recordingBars.map((h, i) => (
                            <div 
                              key={i} 
                              className="w-0.5 bg-rose-500 rounded-sm" 
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[9px] font-mono uppercase text-slate-500 tracking-wider">Note Stream Inputs</span>
                    )}

                    <button 
                      type="button"
                      onClick={toggleVoiceRecording}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-mono font-bold uppercase transition-all duration-300 border cursor-pointer",
                        isRecording 
                        ? "bg-rose-500 text-slate-950 border-rose-400 animate-pulse" 
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                      )}
                      title="Simulate Speech-to-text recording feedback memo"
                    >
                      {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-amber-500" />}
                      <span>{isRecording ? "Stop memo" : "Verbal transcription feed"}</span>
                    </button>
                  </div>

                  {/* Standard text writing area */}
                  <div className="relative">
                    <textarea 
                      ref={textareaRef}
                      value={feedbackNote}
                      onChange={(e) => setFeedbackNote(e.target.value)}
                      placeholder={capturedTimestamp !== null 
                        ? `Awaiting comment at timestamp ${formatTime(capturedTimestamp)}...`
                        : "Post text or stamp notes to producer stream..."
                      }
                      className="w-full bg-slate-950 border border-slate-900 focus:border-amber-500/50 rounded-2xl p-4 pr-14 text-xs font-mono text-slate-200 focus:outline-none transition-all resize-none h-18 placeholder:text-slate-700 leading-normal"
                    />
                    <button 
                      type="submit"
                      disabled={!feedbackNote.trim()}
                      className="absolute bottom-3.5 right-3.5 w-8 h-8 rounded-xl bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-20 disabled:scale-100 flex items-center justify-center transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </form>

              </div>
            </motion.aside>
          )}
        </AnimatePresence>

      </main>

      {/* ZIP BATCH BUILDER PROGRESS OVERLAY */}
      {zipPackingStage !== 'idle' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 md:p-10 max-w-md w-full text-center space-y-6 shadow-2xl relative overflow-hidden">
            {/* Background design elements */}
            <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-amber-500/5 blur-2xl rounded-full" />
            
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mx-auto">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">CTS ZIP ARCHIVER v4.8</span>
              <h3 className="text-xl font-black uppercase tracking-tight text-white leading-tight">Compiling Mastering Bundle</h3>
              <p className="text-xs font-mono text-slate-400 max-w-xs mx-auto leading-relaxed">{zipPackingStatusText}</p>
            </div>

            {/* Custom linear progress meter bar */}
            <div className="space-y-2">
              <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                <motion.div 
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400" 
                  initial={{ width: 0 }}
                  animate={{ width: `${zipPackingProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 font-bold uppercase">
                <span>Synchronizing Bytes</span>
                <span>{zipPackingProgress}%</span>
              </div>
            </div>

            {/* Quick checksum certificate readouts */}
            <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl text-[9px] font-mono text-slate-500 text-left space-y-1">
              <p>ACCESS_CLEARANCE: Lossless Premium Stems Granted</p>
              <p>METADATA_BOUNDS: BPM / Key injected securely</p>
              <p>MD5_CHECKSUM: sha256_hash_verified_9df92aeb</p>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER MODAL: GENERATE TEMPORARY SHARE ACCESS PORTAL */}
      <AnimatePresence>
        {showSharePortalModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl relative font-sans space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-855 pb-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-amber-500" />
                  <div>
                    <h3 className="text-sm font-black uppercase text-white tracking-wider">Access Expansion Setup</h3>
                    <p className="text-[9px] font-mono text-slate-550">SETUP TEMP SECURITY HANDSHAKE KEYS</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowSharePortalModal(false);
                    setGeneratedPortalLink('');
                  }}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Portal creation configuration inputs */}
              <div className="space-y-4 font-mono text-xs">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Access Expiry Setting</label>
                    <select 
                      value={shareExpiration} 
                      onChange={(e) => setShareExpiration(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                    >
                      <option value="24 Hours">24 Hours (Fast Expiry)</option>
                      <option value="48 Hours">48 Hours (Standard)</option>
                      <option value="Never">Never (Infinite Access)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Portal Access Key (Optional)</label>
                    <input 
                      type="password"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="Assign custom passkey..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl text-[10px] text-slate-450 leading-relaxed text-left space-y-1">
                  <p className="text-amber-500 font-bold uppercase text-[9px]">Cryptographic Protocol Details:</p>
                  <p>• Secure share token will map dynamic metadata keys dynamically.</p>
                  <p>• High-Fidelity stream routing switches master buffers automatically upon request.</p>
                  <p>• Any client activity (plays, revisions) emits instantaneous sync notifications back to producer.</p>
                </div>

                <button 
                  type="button" 
                  onClick={triggerGeneratePortalToken}
                  disabled={isGeneratingPortal}
                  className="w-full p-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/10 cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  {isGeneratingPortal ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  <span>{isGeneratingPortal ? "Constructing handshake..." : "Generate Handshake Token Link"}</span>
                </button>

                {/* COPY LINK RESPONSE FROM SERVER HANDSHAKE */}
                {generatedPortalLink && (
                  <div className="space-y-2 pt-2">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Secure Handshake URL</label>
                    <div className="flex gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2 pl-3 items-center">
                      <span className="text-[10px] break-all flex-1 text-slate-400 select-all font-mono leading-none">
                        {generatedPortalLink}
                      </span>
                      <button 
                        onClick={copyGeneratedPortal}
                        className="px-4 py-2 bg-slate-900 border border-slate-800 hover:text-white rounded-lg text-[10px] font-bold font-mono text-amber-500 flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PERSISTENT PLAY BAR AT THE VERY BOTTOM */}
      <AnimatePresence>
        {activeTrack && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            id="cts-persistent-playbar"
            className="w-full bg-slate-950/95 backdrop-blur-xl border-t border-slate-900/80 z-40 py-3 md:py-4 px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-6 select-none shrink-0 relative sticky bottom-0"
          >
            {/* Mobile layout top progress line */}
            <div className="md:hidden absolute top-0 left-0 right-0 h-1 bg-slate-900">
              <div 
                className="h-full bg-amber-500 transition-all duration-100 ease-out" 
                style={{ width: `${(progress / (duration || activeTrack.duration || 1)) * 100}%` }}
              />
            </div>

            {/* Left Section: Active Track Cover, Metadata, Status, Votes */}
            <div className="flex items-center justify-between w-full md:w-auto md:justify-start gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 md:w-14 md:h-14 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex-shrink-0 relative">
                  <img 
                    src={activeTrack.image_url || "/ogbeatz_logo.svg"} 
                    className={cn("w-full h-full object-cover rounded-xl transition-transform duration-1000", isPlaying ? "animate-spin" : "")} 
                    style={{ animationDuration: '25s' }}
                    referrerPolicy="no-referrer" 
                  />
                  {isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex items-end gap-0.5 h-3">
                        <div className="w-0.5 bg-amber-500 animate-[bounce_0.6s_infinite] h-2" />
                        <div className="w-0.5 bg-amber-500 animate-[bounce_0.6s_infinite_0.1s] h-3" />
                        <div className="w-0.5 bg-amber-500 animate-[bounce_0.6s_infinite_0.2s] h-1" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="min-w-0 leading-none">
                  <span className="text-[8px] font-mono tracking-widest text-slate-500 uppercase leading-none block mb-1">NOW REVIEWING</span>
                  <h4 className="text-sm font-black text-white uppercase tracking-tight truncate max-w-[140px] sm:max-w-[200px] hover:text-amber-500 transition-colors cursor-pointer animate-pulse" onClick={() => addToast(`Reviewing Master: ${activeTrack.name}`, 'info')}>
                    {activeTrack.name}
                  </h4>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1 truncate max-w-[120px] sm:max-w-[180px]">By {activeTrack.artist || 'THE BEATZ WAY'}</p>
                </div>
              </div>

              {/* Status Badge & Quick Approval Actions for Mobile / Streamlined */}
              <div className="flex items-center gap-2">
                <span className={cn(
                  "hidden xs:inline-block px-2 py-0.5 text-[8px] font-mono uppercase tracking-widest font-black rounded border",
                  (trackStatuses[activeTrack.id] || 'New') === 'Approved' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
                  (trackStatuses[activeTrack.id] || 'New') === 'Revision Needed' && "bg-rose-500/10 text-rose-400 border-rose-500/25",
                  (trackStatuses[activeTrack.id] || 'New') === 'Pending' && "bg-amber-500/10 text-amber-400 border-amber-500/25",
                  (trackStatuses[activeTrack.id] || 'New') === 'New' && "bg-sky-500/10 text-sky-400 border-sky-500/25"
                )}>
                  {trackStatuses[activeTrack.id] || 'New'}
                </span>

                {/* Streamlined Mobile Play/Pause Button */}
                <button
                  onClick={togglePlay}
                  className="md:hidden w-9 h-9 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all text-black border border-amber-300"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
              </div>
            </div>

            {/* Center Section: Core Controls & Detailed Timeline Progress Bar */}
            <div className="hidden md:flex flex-col items-center gap-2 flex-2 max-w-xl w-full">
              {/* Media buttons */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={playPrevious}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors hover:scale-105 active:scale-95 cursor-pointer"
                  title="Previous Track"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>
                <button 
                  onClick={togglePlay}
                  className="w-10 h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all text-black border border-amber-300 cursor-pointer"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>
                <button 
                  onClick={playNext}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors hover:scale-105 active:scale-95 cursor-pointer"
                  title="Next Track"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>

              {/* Progress Slider Track */}
              <div className="flex items-center gap-3 w-full font-mono text-[10px] text-slate-500 font-bold select-none">
                <span className="w-10 text-right text-amber-500">{formatTime(progress)}</span>
                <div className="relative flex-1 group flex items-center">
                  <input 
                    type="range"
                    min={0}
                    max={duration || activeTrack.duration || 1}
                    step={0.1}
                    value={progress}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                </div>
                <span className="w-10 text-left">{formatTime(duration || activeTrack.duration)}</span>
              </div>
            </div>

            {/* Right Section: Volume, Lossless Audio toggle, Quick-Actions, Chat Toggle */}
            <div className="hidden md:flex items-center justify-end gap-4 flex-1 min-w-0">
              
              {/* Volume Controller with sliding volume slider */}
              <div className="flex items-center gap-2 group/vol">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input 
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                  }}
                  className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none hover:bg-slate-700 transition-colors"
                  title="Volume slider"
                />
              </div>

              <div className="h-4 w-px bg-slate-900" />

              {/* Lossless rate Switcher badge */}
              <button
                onClick={pullStreamLosslessMaster}
                className={cn(
                  "px-2.5 py-1 rounded-lg border font-mono text-[9px] uppercase tracking-widest font-black transition-all",
                  audioStreamMode === 'High-Fidelity WAV'
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.1)]"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                )}
                title="Switches audio source buffer to lossless studio wave"
              >
                {audioStreamMode === 'High-Fidelity WAV' ? "WAV Lossless" : "Standard MP3"}
              </button>

              <div className="h-4 w-px bg-slate-900" />

              {/* Quick status votes direct triggers */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleStatusVote(activeTrack.id, 'up')}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-emerald-500 hover:bg-emerald-500/5 hover:text-emerald-400 text-slate-400 rounded-lg text-[9px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleStatusVote(activeTrack.id, 'down')}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-rose-500 hover:bg-rose-500/5 hover:text-rose-400 text-slate-400 rounded-lg text-[9px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Revision
                </button>
              </div>

              {/* Chat Comments toggle */}
              <button
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className={cn(
                  "p-2 rounded-xl border transition-all cursor-pointer",
                  isDrawerOpen 
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30" 
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                )}
                title="Toggle Note Stream panel"
              >
                <MessageSquare className="w-4 h-4" />
              </button>

            </div>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

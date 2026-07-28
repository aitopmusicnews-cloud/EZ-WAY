import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, Pause, Download, ThumbsUp, ThumbsDown, 
  MessageSquare, Send, Music, Clock, Lock, ChevronRight,
  Share2, Volume2, Globe, Sparkles
} from 'lucide-react';
import { Track, ShareLink, Playlist } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useMediaStore } from '../context/MediaStoreContext';

interface SharePortalProps {
  track?: Track;
  playlist?: Playlist;
  shareLink: ShareLink;
}

export default function SharePortal({ track: initialTrack, playlist, shareLink }: SharePortalProps) {
  const { tracks: allTracks, addActivity, sendMessage, messages, updateTrack, addToast } = useMediaStore();
  const [activeTrack, setActiveTrack] = useState<Track | null>(initialTrack || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playlistTracks = useMemo(() => {
    if (!playlist) return [];
    return allTracks.filter(t => playlist.track_ids.includes(t.id));
  }, [playlist, allTracks]);

  useEffect(() => {
    if (playlistTracks.length > 0 && !activeTrack) {
        setActiveTrack(playlistTracks[0]);
    }
  }, [playlistTracks, activeTrack]);

  useEffect(() => {
    if (activeTrack?.file_url) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(activeTrack.file_url);
      audioRef.current.addEventListener('timeupdate', () => {
        setProgress(audioRef.current?.currentTime || 0);
      });
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current?.duration || 0);
      });
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
      });
      audioRef.current.addEventListener('error', (e) => {
        console.error("Share portal audio error:", e);
        setIsPlaying(false);
      });
    }

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [activeTrack?.file_url]);

  const logTrackPlay = async (track: Track) => {
    try {
      await updateTrack(track.id, { plays: (track.plays || 0) + 1 });
      addActivity({
        type: 'play' as any,
        user: 'Industry Client' + (shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''),
        action: 'streamed track reference' as any,
        target: track.name,
        client_id: shareLink.client_id,
        track_id: track.id,
        playlist_id: playlist?.id
      });
    } catch (e) {
      console.error("Error logging track play in SharePortal:", e);
    }
  };

  const togglePlay = async () => {
    if (audioRef.current) {
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
      } catch (error) {
        console.error("Share portal playback failed:", error);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    if (audioRef.current) {
      audioRef.current.currentTime = pct * duration;
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRating = async (type: 'up' | 'down') => {
    if (rating === type) {
      setRating(null);
      return;
    }
    setRating(type);
    
    addActivity({
      type: type === 'up' ? 'social' as any : 'system' as any,
      user: 'Industry Client' + (shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''),
      action: type === 'up' ? 'thumbs_up' as any : 'thumbs_down' as any,
      target: activeTrack?.name || playlist?.name || 'Asset',
      details: type === 'up' ? 'High-priority approval.' : 'Requested revision cycle.',
      client_id: shareLink.client_id,
      track_id: activeTrack?.id,
      playlist_id: playlist?.id
    });

    if (shareLink.client_id) {
       const ratingMessage = type === 'up' 
         ? `[Mix Approval]: Approved the mix for reference "${activeTrack?.name || 'Asset'}"!` 
         : `[Revision Request]: Flagged "${activeTrack?.name || 'Asset'}" for revision adjustments.`;
       await sendMessage(shareLink.client_id, ratingMessage, null, 'inbound');
    }

    if (type === 'up' && activeTrack) {
       // Gracefully update likes/approval metrics
       await updateTrack(activeTrack.id, { likes: (activeTrack.likes || 0) + 1 });
       addToast("Mix approval synced to live dashboard!", 'success');
    } else if (type === 'down' && activeTrack) {
       addToast("Revision request logged. Our studio team has been notified.", 'success');
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    
    const newComment = { id: Date.now().toString(), user: 'Industry Client', text: comment, time: 'Just now' };
    setComments(prev => [newComment, ...prev]);
    
    addActivity({
      type: 'comment' as any,
      user: 'Industry Client' + (shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''),
      action: 'commented on',
      target: activeTrack?.name || playlist?.name || 'Asset',
      details: comment,
      client_id: shareLink.client_id,
      track_id: activeTrack?.id,
      playlist_id: playlist?.id
    });

    if (shareLink.client_id) {
       await sendMessage(shareLink.client_id, `[Feedback on ${activeTrack?.name || 'Asset'}]: ${comment}`, null, 'inbound');
    }

    setComment('');
  };

  // Synchronized historical comments from the database messages table
  const dbComments = useMemo(() => {
    if (!messages) return [];
    
    return messages
      .filter(m => {
        const matchClient = shareLink.client_id ? m.client_id === shareLink.client_id : true;
        const matchTrackName = activeTrack ? m.content.includes(activeTrack.name) : true;
        return m.direction === 'inbound' && matchClient && matchTrackName;
      })
      .map(m => {
        let cleanText = m.content;
        cleanText = cleanText.replace(/^\[Feedback on [^\]]+\]:\s*/i, "");
        cleanText = cleanText.replace(/^\[Industry Feedback on [^\]]+\]:\s*/i, "");
        cleanText = cleanText.replace(/^\[Mix Approval\]:\s*/i, "👍 ");
        cleanText = cleanText.replace(/^\[Revision Request\]:\s*/i, "👎 ");

        return {
          id: m.id,
          user: 'Industry Client',
          text: cleanText,
          time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
      });
  }, [messages, shareLink.client_id, activeTrack]);

  const displayedComments = useMemo(() => {
    const merged = [...comments];
    dbComments.forEach(dc => {
      if (!merged.some(mc => mc.id === dc.id)) {
        merged.push(dc);
      }
    });
    return merged;
  }, [comments, dbComments]);

  // Read rating status dynamically from the database feedback history
  const currentTrackRating = useMemo(() => {
     if (!messages || !activeTrack || !shareLink.client_id) return rating;
     const lastRatingMsg = messages
       .filter(m => m.client_id === shareLink.client_id && m.content.includes(activeTrack.name))
       .filter(m => m.content.includes('[Mix Approval]') || m.content.includes('[Revision Request]'))
       .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
     
     if (lastRatingMsg) {
        return lastRatingMsg.content.includes('[Mix Approval]') ? 'up' : 'down';
     }
     return rating;
  }, [messages, activeTrack, shareLink.client_id, rating]);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-orange-500 selection:text-black overflow-x-hidden font-sans">
      {/* Dynamic Blurred Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
         <AnimatePresence mode="wait">
            <motion.div 
               key={activeTrack?.image_url}
               initial={{ opacity: 0 }}
               animate={{ opacity: 0.3 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 1 }}
               className="absolute inset-0 grayscale blur-[120px] scale-150"
               style={{ 
                  backgroundImage: `url(${activeTrack?.image_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
               }}
            />
         </AnimatePresence>
         <div className="absolute inset-0 bg-black/60" />
      </div>

      <div className="relative z-10 p-6 md:p-12 lg:p-20">
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8 mb-20">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-3xl">
              <Sparkles className="w-8 h-8 text-orange-500" />
            </div>
            <div>
              <div className="text-[10px] font-black tracking-[0.4em] text-orange-500 uppercase leading-none mb-1">Authenticated Delivery</div>
              <h1 className="text-3xl font-black tracking-tighter uppercase italic flex items-center gap-2">
                THE BEATZ WAY <span className="text-zinc-600 font-medium">HUB</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-12">
            <div className="hidden md:flex flex-col items-end">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  <Globe className="w-3 h-3" /> Encrypted Endpoint
               </div>
               <span className="text-[10px] text-zinc-700 font-mono mt-1">SESSION_TOKEN: {shareLink.token.slice(0, 12)}</span>
            </div>
            {shareLink.expires_at && (
              <div className="px-5 py-2 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-xl flex items-center gap-3">
                <Clock className="w-4 h-4 text-orange-500" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Portal Access Expiry</span>
                  <span className="text-[10px] font-bold">{new Date(shareLink.expires_at).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16">
          
          {/* Left: Player & Visuals (8 Cols) */}
          <div className="lg:col-span-12 xl:col-span-7 space-y-12">
            <div className="flex flex-col md:flex-row gap-12 items-center md:items-start group">
               <motion.div 
                 initial={{ scale: 0.9, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 className="relative w-full max-w-[400px] aspect-square rounded-[4rem] overflow-hidden shadow-[0_0_120px_rgba(249,115,22,0.15)] border-2 border-white/5 bg-zinc-900 group"
               >
                  <img src={activeTrack?.image_url || "/ogbeatz_logo.svg"} className="w-full h-full object-cover transition-transform duration-[20s] group-hover:scale-110" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 backdrop-blur-sm">
                    <button 
                      onClick={togglePlay}
                      className="w-28 h-28 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-2xl"
                    >
                      {isPlaying ? <Pause className="w-12 h-12 fill-current" /> : <Play className="w-12 h-12 fill-current ml-2" />}
                    </button>
                  </div>
               </motion.div>

               <div className="flex-1 space-y-8 text-center md:text-left py-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-center md:justify-start gap-4">
                       <div className="px-3 py-1 bg-orange-500 text-black text-[9px] font-black uppercase tracking-[0.2em] rounded-md">MASTER</div>
                       <div className="text-zinc-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                          <Volume2 className="w-3.5 h-3.5" /> Reference Mix V2.4
                       </div>
                    </div>
                    <h2 className="text-5xl md:text-8xl font-black tracking-tighter leading-none italic uppercase">{activeTrack?.name || 'Untitled'}</h2>
                    <p className="text-2xl text-zinc-400 font-medium tracking-tight">{activeTrack?.artist || 'Unknown Artist'}</p>
                  </div>

                  {/* Metadata Indicators */}
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-6">
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-2">Tempo</span>
                        <span className="text-xl font-mono font-bold">{activeTrack?.bpm || '--'} BPM</span>
                     </div>
                     <div className="w-px h-8 bg-white/5" />
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-2">Tonal Key</span>
                        <span className="text-xl font-mono font-bold uppercase">{activeTrack?.key_signature || '--'}</span>
                     </div>
                     <div className="w-px h-8 bg-white/5" />
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-2">Duration</span>
                        <span className="text-xl font-mono font-bold">{formatTime(duration || activeTrack?.duration || 0)}</span>
                     </div>
                  </div>
               </div>
            </div>

            {/* Custom Pro Waveform / Progress Bar */}
            <div className="space-y-6">
               <div 
                 onClick={handleSeek}
                 className="h-20 w-full group relative cursor-pointer flex items-center"
               >
                  <div className="absolute inset-0 bg-white/5 rounded-3xl backdrop-blur-sm border border-white/5" />
                  <div className="absolute inset-x-8 inset-y-6 flex items-center justify-between gap-1 overflow-hidden pointer-events-none">
                     {[...Array(60)].map((_, i) => {
                        const progressPct = (progress / (duration || 1)) * 100;
                        const barPct = (i / 60) * 100;
                        const active = barPct <= progressPct;
                        return (
                          <motion.div 
                            key={i}
                            animate={{ 
                              height: active && isPlaying ? [20, 40, 20] : 10,
                              backgroundColor: active ? '#f97316' : 'rgba(255,255,255,0.1)'
                            }}
                            transition={{ 
                              duration: 0.5, 
                              repeat: active && isPlaying ? Infinity : 0, 
                              delay: i * 0.02 
                            }}
                            className="flex-1 rounded-full"
                          />
                        );
                     })}
                  </div>
                  {/* Invisible Seek Overlay */}
                  <div className="absolute inset-0 z-10" />
               </div>
               
               <div className="flex justify-between text-[10px] font-mono text-zinc-600 uppercase tracking-widest px-4">
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-orange-500" />
                     <span>{formatTime(progress)}</span>
                  </div>
                  <span>{formatTime(duration || activeTrack?.duration || 0)}</span>
               </div>
            </div>
          </div>

          {/* Right: Interaction Panel (4 Cols) */}
          <div className="lg:col-span-12 xl:col-span-5 space-y-12">
            <div className="bg-zinc-950/40 border border-white/5 backdrop-blur-3xl p-10 md:p-12 rounded-[4rem] shadow-2xl space-y-12">
               
               <div className="space-y-8">
                  <div className="flex items-center justify-between">
                     <h3 className="text-xl font-black uppercase tracking-tight">Review Protocol</h3>
                     {shareLink.download_enabled && (
                        <button 
                          onClick={async () => {
                             if (activeTrack?.file_url) {
                                try {
                                  addToast("Initializing secure high-fidelity download stream...", "info");
                                  const response = await fetch(activeTrack.file_url);
                                  const blob = await response.blob();
                                  const blobUrl = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = blobUrl;
                                  a.download = `${activeTrack.name}_MASTER_24BIT.wav`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  window.URL.revokeObjectURL(blobUrl);
                                  addToast("Master reference successfully downloaded!", "success");
                                  
                                  addActivity({
                                    type: 'download',
                                    user: 'Industry Client' + (shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''),
                                    action: 'downloaded master',
                                    target: activeTrack.name,
                                    client_id: shareLink.client_id,
                                    track_id: activeTrack.id
                                  });
                                } catch (err) {
                                  console.warn("Direct blob download error, running fallback link redirect:", err);
                                  const a = document.createElement('a');
                                  a.href = activeTrack.file_url;
                                  a.download = `${activeTrack.name}_MASTER.mp3`;
                                  a.click();
                                }
                             }
                          }}
                          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-white transition-colors animate-pulse"
                        >
                           <Download className="w-4 h-4" /> Download WAV
                        </button>
                     )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <button 
                       onClick={() => handleRating('up')}
                       className={cn(
                         "flex flex-col items-center justify-center gap-5 p-10 rounded-[2.5rem] border transition-all duration-500",
                         currentTrackRating === 'up' 
                         ? "bg-emerald-500 border-emerald-400 text-black shadow-[0_0_50px_rgba(16,185,129,0.2)]" 
                         : "bg-white/5 border-white/5 text-emerald-500/50 hover:border-emerald-500/30 hover:bg-emerald-500/5"
                       )}
                     >
                        <ThumbsUp className={cn("w-10 h-10", currentTrackRating === 'up' && "fill-current")} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Approve Mix</span>
                     </button>
                     <button 
                       onClick={() => handleRating('down')}
                       className={cn(
                         "flex flex-col items-center justify-center gap-5 p-10 rounded-[2.5rem] border transition-all duration-500",
                         currentTrackRating === 'down' 
                         ? "bg-red-500 border-red-400 text-black shadow-[0_0_50px_rgba(239,68,68,0.2)]" 
                         : "bg-white/5 border-white/5 text-red-500/50 hover:border-red-500/30 hover:bg-red-500/5"
                       )}
                     >
                        <ThumbsDown className={cn("w-10 h-10", currentTrackRating === 'down' && "fill-current")} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Revisions</span>
                     </button>
                  </div>
               </div>

               <div className="space-y-6">
                  <div className="flex items-center gap-3 text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em]">
                     <MessageSquare className="w-4 h-4 text-orange-500" /> Professional Feedback
                  </div>

                  {playlist && (
                    <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                       {playlistTracks.map((t, idx) => (
                         <button 
                           key={t.id}
                           onClick={() => setActiveTrack(t)}
                           className={cn(
                             "w-full flex items-center justify-between p-4 rounded-[1.2rem] border transition-all group text-left",
                             activeTrack?.id === t.id 
                             ? "bg-white border-white text-black font-black" 
                             : "bg-white/5 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/10"
                           )}
                         >
                           <div className="flex items-center gap-4 overflow-hidden min-w-0">
                              <span className={cn("text-[9px] font-mono shrink-0", activeTrack?.id === t.id ? "text-zinc-600" : "text-zinc-800")}>{(idx + 1).toString().padStart(2, '0')}</span>
                              <span className="text-[10px] uppercase tracking-tight truncate">{t.name}</span>
                           </div>
                           {activeTrack?.id === t.id ? <Play className="w-3.5 h-3.5 fill-current shrink-0" /> : <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                         </button>
                       ))}
                    </div>
                  )}

                  <form onSubmit={handleComment} className="space-y-4">
                     <div className="relative">
                       <textarea 
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder={`Submit timestamps or vocal revision notes for ${activeTrack?.name || 'active master'}...`}
                          className="w-full h-36 bg-white/5 border border-white/5 rounded-[2rem] p-6 pr-16 text-xs focus:outline-none focus:border-orange-500 transition-all resize-none placeholder:text-zinc-700 leading-relaxed"
                       />
                       <button 
                         type="submit"
                         disabled={!comment.trim()}
                         className="absolute bottom-5 right-5 w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl disabled:opacity-50 disabled:scale-100"
                       >
                          <Send className="w-4 h-4" />
                       </button>
                     </div>
                  </form>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    <AnimatePresence initial={false}>
                      {displayedComments.map(c => (
                        <motion.div 
                          key={c.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-zinc-900 border border-white/5 p-5 rounded-[2rem] space-y-3"
                        >
                          <div className="flex items-center justify-between">
                             <span className="text-[9px] font-black uppercase text-orange-500 tracking-widest">{c.user}</span>
                             <span className="text-[8px] text-zinc-700 uppercase font-mono">{c.time}</span>
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed italic">"{c.text}"</p>
                        </motion.div>
                      ))}
                      {displayedComments.length === 0 && (
                        <div className="text-center py-10 bg-white/[0.01] border border-dashed border-white/5 rounded-[1.5rem]">
                           <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">No feedback threads logged for this reference.</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
               </div>
            </div>
          </div>
        </main>

        <footer className="mt-32 pb-20 max-w-7xl mx-auto border-t border-white/5 pt-16 flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="flex flex-col items-center md:items-start gap-4">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-2xl overflow-hidden bg-orange-500 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-black" />
                 </div>
                 <span className="text-2xl font-black tracking-tighter uppercase italic">THE BEATZ WAY</span>
               </div>
               <p className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-700 pl-1">Unified Artist Distribution Engine</p>
            </div>

            <div className="flex items-center gap-12 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                <div className="flex flex-col items-end">
                   <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Secured by</span>
                   <span className="text-[10px] font-black text-white italic">CRYPTO_GATE</span>
                </div>
                <div className="flex gap-1">
                   <div className="w-1 h-8 bg-zinc-800" />
                   <div className="w-1 h-12 bg-zinc-700" />
                   <div className="w-1 h-6 bg-zinc-800" />
                </div>
            </div>
        </footer>
      </div>
    </div>
  );
}

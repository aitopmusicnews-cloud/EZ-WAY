import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Play, Pause, Download, Video, Share2, Music, Calendar, 
  HardDrive, Info, Hash, Clock, Gauge, Award, FileText, 
  Sparkles, Quote, Edit
} from 'lucide-react';
import { Track } from '../types';
import { getTrackInfoFromTags } from '../App';
import { useAudio } from '../context/AudioContext';
import { parseLrc, isLrcFormat } from '../utils/lrcParser';

interface TrackDetailsModalProps {
  key?: string;
  track: Track;
  onClose: () => void;
  onDownload: (track: Track) => void;
  onShare: (track: Track) => void;
  onCreateVideo: (track: Track) => void;
  onEdit: (track: Track) => void;
  playlistTracks?: Track[];
}

export default function TrackDetailsModal({
  track,
  onClose,
  onDownload,
  onShare,
  onCreateVideo,
  onEdit,
  playlistTracks = []
}: TrackDetailsModalProps) {
  const { activeTrack, isPlaying, playTrack, pause, resume, progress, seek } = useAudio();

  const isCurrentTrack = activeTrack?.id === track.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;

  const hasLrc = isLrcFormat(track.lyrics || '');
  const [lyricViewMode, setLyricViewMode] = useState<'synced' | 'static'>(hasLrc ? 'synced' : 'static');
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const parsedLyrics = parseLrc(track.lyrics || '');

  // Reset tab when lyrics change
  useEffect(() => {
    setLyricViewMode(isLrcFormat(track.lyrics || '') ? 'synced' : 'static');
  }, [track.lyrics]);

  // Sync active line based on song play progress
  useEffect(() => {
    if (!hasLrc || !isCurrentTrack) return;
    
    let activeIdx = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (parsedLyrics[i].time <= progress) {
        activeIdx = i;
      } else {
        break;
      }
    }
    setActiveLineIndex(activeIdx);
  }, [progress, parsedLyrics, hasLrc, isCurrentTrack]);

  // Scroll active lyric line to the center smoothly
  useEffect(() => {
    if (activeLineIndex !== -1 && containerRef.current && lyricViewMode === 'synced') {
      const activeEl = containerRef.current.querySelector(`#lyric-line-${activeLineIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [activeLineIndex, lyricViewMode]);

  const info = getTrackInfoFromTags(track.tags);

  const formatDuration = (secs: number) => {
    if (!secs) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "N/A";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const handlePlaybackToggle = () => {
    if (isCurrentTrack) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      playTrack(track, playlistTracks.length > 0 ? playlistTracks : [track]);
    }
  };

  return (
    <div id="track-details-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-900 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl shadow-black/90 text-white"
      >
        {/* Background glow decor */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-500/5 blur-[120px] rounded-full pointer-events-none" />

        {/* Header toolbar */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-900/80 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-orange-500 tracking-[0.2em] bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
              Asset Metadata Console
            </span>
            <span className="text-zinc-600 font-mono text-xs">ID: {track.id.substring(0, 8)}...</span>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-zinc-900 rounded-full text-zinc-500 hover:text-white transition-all bg-zinc-950/80 border border-zinc-900 duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          
          {/* Main Hero block */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Cover with vinyl disc styling */}
            <div className="md:col-span-4 flex flex-col items-center">
              <div className="relative group w-full max-w-[240px] aspect-square rounded-[2rem] overflow-hidden border border-zinc-900 shadow-2xl bg-zinc-900 flex items-center justify-center">
                <img 
                  src={track.image_url || "/ogbeatz_logo.svg"} 
                  alt={track.name}
                  className={`w-full h-full object-cover transition-transform duration-[10s] ease-linear ${
                    isCurrentlyPlaying ? 'rotate-[360deg] duration-[25s] ease-linear repeat-infinite' : 'group-hover:scale-105'
                  }`}
                  referrerPolicy="no-referrer"
                />
                
                {/* Vinyl overlay details */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-60" />
                
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/40 backdrop-blur-xs">
                  <button 
                    onClick={handlePlaybackToggle}
                    className="w-14 h-14 bg-orange-500 text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform"
                  >
                    {isCurrentlyPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                  </button>
                </div>
              </div>

              {/* Instant Controls */}
              <div className="w-full max-w-[240px] mt-6 flex gap-2">
                <button 
                  onClick={handlePlaybackToggle}
                  className={`flex-1 py-3 px-4 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    isCurrentlyPlaying 
                      ? 'bg-zinc-900 text-orange-500 border border-orange-500/20' 
                      : 'bg-orange-500 text-black hover:bg-orange-400'
                  }`}
                >
                  {isCurrentlyPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" /> Stop Player
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current ml-0.5" /> Play Master
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Key details */}
            <div className="md:col-span-8 space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                     {track.type.split('/')[1] || 'AUDIO'} • {formatSize(track.size)}
                  </span>
                  <div className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                    track.status === 'ready' 
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                      : track.status === 'processing' 
                        ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' 
                        : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                  }`}>
                    {track.status}
                  </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white uppercase italic">{track.name}</h1>
                <p className="text-zinc-400 text-md font-bold mt-1">Uploaded by: {track.artist || 'OGBEATZ MASTER'}</p>
              </div>

              {/* Pitch Context (AI Generated Quote block) */}
              {info.pitch && (
                <div className="relative bg-zinc-950 border border-zinc-900 rounded-3xl p-5 shadow-inner">
                  <Quote className="absolute right-4 top-4 w-12 h-12 text-zinc-900 pointer-events-none" />
                  <p className="text-zinc-300 font-mono text-xs italic leading-relaxed select-all">
                    "{info.pitch}"
                  </p>
                </div>
              )}

              {/* Key Technical Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-zinc-950/40 border border-zinc-900/65 rounded-[2rem] p-6 text-center">
                <div className="space-y-1">
                  <div className="flex justify-center text-orange-500/80 mb-1"><Gauge className="w-4 h-4" /></div>
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">TEMPO</span>
                  <p className="text-xl font-black font-mono text-zinc-200">{track.bpm} <span className="text-[9px] text-zinc-500">BPM</span></p>
                </div>
                <div className="space-y-1 border-l border-zinc-900/60">
                  <div className="flex justify-center text-orange-500/80 mb-1"><Music className="w-4 h-4" /></div>
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">HARMONIC KEY</span>
                  <p className="text-xl font-black font-mono text-zinc-200">{track.key_signature || "N/A"}</p>
                </div>
                <div className="space-y-1 border-l border-zinc-900/60">
                  <div className="flex justify-center text-orange-500/80 mb-1"><Clock className="w-4 h-4" /></div>
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">RUNTIME</span>
                  <p className="text-xl font-black font-mono text-zinc-200">{formatDuration(track.duration)}</p>
                </div>
                <div className="space-y-1 border-l border-zinc-900/60">
                  <div className="flex justify-center text-orange-500/80 mb-1"><Award className="w-4 h-4" /></div>
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">PLAYBACKS</span>
                  <p className="text-xl font-black font-mono text-zinc-200">{(track.plays || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            
            {/* Left: AI A&R Insights Console */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">AI A&R Report & Categorization</h3>
              </div>
              
              <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-6 space-y-4 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                  <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Primary Genre:</span>
                  <span className="text-zinc-200 font-bold uppercase">{info.genreCategory || 'UNCLASSIFIED'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                  <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Acoustic Mood:</span>
                  <span className="text-zinc-200 font-bold uppercase">{info.mood || 'NOT DECIDED'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                  <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Aesthetic Vibe:</span>
                  <span className="text-orange-400 font-bold uppercase">{info.vibe || 'DYNAMIC'}</span>
                </div>
                <div className="flex flex-col gap-1.5 border-b border-zinc-900 pb-3">
                  <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Suggested Gear / Instruments:</span>
                  <span className="text-zinc-400 leading-normal">{info.instruments || 'Analog synthesizers, Drum machines, Digital FX'}</span>
                </div>
                <div className="flex justify-between items-center pb-1">
                  <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Camelot Harmonic Class:</span>
                  <span className="text-zinc-300 font-bold">{info.camelotKey || 'N/A'}</span>
                </div>
              </div>

              {track.tags && track.tags.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block">Metadata Tags</span>
                  <div className="flex flex-wrap gap-2">
                    {track.tags.map(tag => {
                      // Don't show raw categorization tags here if they look redundant
                      if (tag.includes(':')) {
                        const [key, val] = tag.split(':');
                        return (
                          <span key={tag} className="px-3 py-1 rounded-xl bg-orange-500/5 border border-orange-500/10 text-[9px] font-mono uppercase text-orange-400">
                            {key}: <span className="font-bold text-white">{val}</span>
                          </span>
                        );
                      }
                      return (
                        <span key={tag} className="px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-[9px] font-mono uppercase text-zinc-400">
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Lyrics Projection Panel */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Lyric Sheet & Teleprompt</h3>
                </div>
                {hasLrc && (
                  <div className="flex bg-zinc-950 p-0.5 border border-zinc-900 rounded-lg">
                    <button
                      onClick={() => setLyricViewMode('synced')}
                      className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                        lyricViewMode === 'synced'
                          ? "bg-zinc-850 text-orange-400"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      ⏱️ Synced
                    </button>
                    <button
                      onClick={() => setLyricViewMode('static')}
                      className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                        lyricViewMode === 'static'
                          ? "bg-zinc-850 text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      📄 Sheet
                    </button>
                  </div>
                )}
              </div>

              <div 
                ref={containerRef}
                className="bg-zinc-950 border border-zinc-900 rounded-3xl p-6 h-[260px] overflow-y-auto relative flex flex-col scroll-smooth"
              >
                {track.lyrics ? (
                  lyricViewMode === 'synced' && hasLrc ? (
                    <div className="space-y-6 py-28">
                      {!isCurrentTrack && (
                        <div className="absolute top-3 left-3 right-3 z-10 bg-orange-500/10 border border-orange-500/20 rounded-xl p-2 text-center">
                          <p className="text-[9px] font-black uppercase text-orange-400 tracking-wider">Audition Mode Offline</p>
                          <p className="text-[7.5px] text-zinc-400 uppercase tracking-widest mt-0.5">Click Play Master to enable active auto-scroll</p>
                        </div>
                      )}
                      {parsedLyrics.map((line, idx) => {
                        const isActive = activeLineIndex === idx;
                        return (
                          <div
                            key={idx}
                            id={`lyric-line-${idx}`}
                            onClick={() => {
                              if (isCurrentTrack && seek) {
                                seek(line.time);
                              }
                            }}
                            className={`transition-all duration-300 text-center cursor-pointer py-1.5 px-3 rounded-xl ${
                              isActive
                                ? "text-orange-400 text-[14px] font-black tracking-tight scale-105 bg-orange-500/5 border border-orange-500/10"
                                : "text-zinc-600 text-xs hover:text-zinc-400"
                            }`}
                          >
                            {line.text}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="font-mono text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap select-all focus:outline-none">
                      {hasLrc 
                        ? parsedLyrics.map(l => l.text).join('\n') 
                        : track.lyrics
                      }
                    </div>
                  )
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-600">
                    <Music className="w-8 h-8 mb-3 opacity-30" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No lyrics loaded for this track</p>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-700 mt-1">Open track editor to paste lyrics manually</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Institutional File Data Console */}
          <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-zinc-500" />
              <div className="leading-tight">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">File Allocation Reference</p>
                <a 
                  href={track.file_url || '#'} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[9px] font-mono text-orange-400 hover:underline hover:text-orange-300 break-all max-w-lg mt-0.5 block"
                >
                  {track.file_url || 'Local Cache Blob'}
                </a>
              </div>
            </div>
            
            <div className="flex items-center gap-1 text-[9px] font-black text-zinc-500 uppercase tracking-widest bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-1.5 font-mono">
              <Calendar className="w-3.5 h-3.5 mr-1" />
              COMMITTED: {new Date(track.created_at).toLocaleDateString()}
            </div>
          </div>

        </div>

        {/* Footer Actions Panel */}
        <div className="px-8 py-6 border-t border-zinc-900 bg-zinc-950/90 flex flex-wrap gap-3 shrink-0 items-center justify-between z-10">
          <div className="flex gap-2">
            <button 
              onClick={() => onEdit(track)}
              className="py-3 px-5 border border-zinc-900 hover:border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-white rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300"
            >
              <Edit className="w-4 h-4" /> Edit Master
            </button>
            <button 
              onClick={() => onDownload(track)}
              className="py-3 px-5 border border-zinc-900 hover:border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-white rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300"
            >
              <Download className="w-4 h-4" /> Download WAV
            </button>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => onCreateVideo(track)}
              className="py-3 px-5 border border-orange-500/10 hover:border-orange-500/30 bg-orange-500/5 text-orange-400 hover:text-orange-300 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300"
            >
              <Video className="w-4 h-4 animate-pulse" /> Promo Video
            </button>
            <button 
              onClick={() => onShare(track)}
              className="py-3 px-6 bg-white text-black hover:bg-zinc-200 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300"
            >
              <Share2 className="w-4 h-4" /> Secure Share
            </button>
          </div>
        </div>

      </motion.div>
    </div>
  );
}

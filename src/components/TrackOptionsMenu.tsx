import React, { useState } from 'react';
import { MoreVertical, Edit3, Share2, Download, Trash2, Video, Plus, Check, Sparkles, Info } from 'lucide-react';
import { Track, Playlist } from '../types';
import { cn } from '../lib/utils';

interface TrackOptionsMenuProps {
  track: Track;
  onEdit: () => void;
  onShare: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onCreatePromo: () => void;
  onCreateVideo: () => void;
  onAddToPlaylist: (id: string) => void;
  playlists: Playlist[];
  onAnalyze?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

export default function TrackOptionsMenu({ 
  track, onEdit, onShare, onDownload, onDelete, onCreatePromo, onCreateVideo, onAddToPlaylist, playlists, onAnalyze, onViewDetails, className 
}: TrackOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-zinc-400 hover:text-white transition-colors"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-12 w-56 bg-zinc-950 border border-zinc-900 rounded-2xl p-2 shadow-2xl z-50 space-y-1">
            {onViewDetails && (
              <button onClick={() => { onViewDetails(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:bg-zinc-900 rounded-xl transition-colors">
                <Info className="w-3.5 h-3.5 text-orange-500" /> Track Details
              </button>
            )}
            <button onClick={() => { onEdit(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Edit metadata
            </button>
            <button onClick={() => { onShare(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Share2 className="w-3.5 h-3.5 text-orange-500" /> Generate Link
            </button>
            <button onClick={() => { onCreatePromo(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Plus className="w-3.5 h-3.5" /> Marketing Pack
            </button>
            <button onClick={() => { onCreateVideo(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Video className="w-3.5 h-3.5" /> Generate Video
            </button>
            {onAnalyze && (
              <button onClick={() => { onAnalyze(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/10 rounded-xl transition-colors">
                <Sparkles className="w-3.5 h-3.5 text-orange-500" /> AI Diagnostics
              </button>
            )}
            <div className="h-px bg-zinc-900 mx-2 my-1" />
            <div className="px-4 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-zinc-600">Quick Add to:</div>
            {playlists.slice(0, 3).map(pl => (
               <button 
                key={pl.id}
                onClick={() => { onAddToPlaylist(pl.id); setIsOpen(false); }} 
                className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors"
               >
                 <span className="truncate">{pl.name}</span>
                 {pl.track_ids.includes(track.id) && <Check className="w-3 h-3 text-emerald-500" />}
               </button>
            ))}
            <div className="h-px bg-zinc-900 mx-2 my-1" />
            <button onClick={() => { onDownload(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> Download Source
            </button>
            <button onClick={() => { onDelete(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Final Purge
            </button>
          </div>
        </>
      )}
    </div>
  );
}

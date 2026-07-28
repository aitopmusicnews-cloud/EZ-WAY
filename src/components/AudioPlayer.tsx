import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize2, Music } from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import { cn } from '../lib/utils';

import { Track } from '../types';

interface AudioPlayerProps {
  onEdit?: (track: Track) => void;
}

export default function AudioPlayer({ onEdit }: AudioPlayerProps) {
  const { activeTrack, isPlaying, progress, duration, resume, pause, seek, volume, setVolume } = useAudio();

  if (!activeTrack) return null;

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 bg-black/80 backdrop-blur-2xl border-t border-zinc-900 px-8 flex items-center justify-between z-50">
      {/* Track Info */}
      <div className="flex items-center gap-4 w-1/3">
        <div className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center">
          <img 
            src={activeTrack.image_url || "/ogbeatz_logo.svg"} 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-black uppercase tracking-tight truncate">{activeTrack.name}</h4>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest truncate">{activeTrack.artist}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2 w-1/3">
        <div className="flex items-center gap-6">
          <button className="text-zinc-500 hover:text-white transition-colors"><SkipBack /></button>
          <button 
            onClick={isPlaying ? pause : resume}
            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform"
          >
            {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
          </button>
          <button className="text-zinc-500 hover:text-white transition-colors"><SkipForward /></button>
        </div>
        <div className="flex items-center gap-3 w-full max-w-md">
          <span className="text-[9px] font-mono text-zinc-500">{formatTime(progress)}</span>
          <div className="flex-1 h-1 bg-zinc-900 rounded-full relative group cursor-pointer overflow-hidden">
            <div 
              className="absolute left-0 top-0 h-full bg-orange-500 rounded-full"
              style={{ width: `${(progress / duration) * 100}%` }}
            />
            <input 
              type="range"
              min={0}
              max={duration || 100}
              value={progress}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-[9px] font-mono text-zinc-500">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume & Extras */}
      <div className="flex items-center justify-end gap-6 w-1/3">
        <div className="flex items-center gap-3 w-32">
          <Volume2 className="w-4 h-4 text-zinc-500" />
          <div className="flex-1 h-1 bg-zinc-900 rounded-full relative">
            <div 
              className="absolute left-0 top-0 h-full bg-white rounded-full"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
        <button className="text-zinc-500 hover:text-white transition-colors"><Maximize2 className="w-4 h-4"/></button>
      </div>
    </div>
  );
}

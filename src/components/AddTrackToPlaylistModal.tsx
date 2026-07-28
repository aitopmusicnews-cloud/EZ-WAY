import React from 'react';
import { X, Plus, Check } from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import { Playlist } from '../types';

export default function AddTrackToPlaylistModal({ playlist, onClose }: { playlist: Playlist; onClose: () => void; key?: string | number }) {
  const { tracks, addTrackToPlaylist } = useMediaStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-zinc-900 flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-tight">Expand Collection</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full transition-colors"><X/></button>
        </div>
        <div className="p-8 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-1 gap-4">
            {tracks.map(track => (
              <div key={track.id} className="flex items-center justify-between p-4 bg-zinc-900 rounded-2xl border border-zinc-800">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-black border border-zinc-800 overflow-hidden text-zinc-500 flex items-center justify-center">
                    <img src={track.image_url || ''} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight">{track.name}</h4>
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{track.artist}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

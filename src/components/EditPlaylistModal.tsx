import React, { useState, useRef } from 'react';
import { 
  X, 
  Save, 
  Image as ImageIcon, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  Plus, 
  Check, 
  Music, 
  Sparkles, 
  Loader2,
  Edit3
} from 'lucide-react';
import { Playlist, Track } from '../types';
import { useMediaStore } from '../context/MediaStoreContext';
import EditTrackModal from './EditTrackModal';

const PRESET_GRADIENTS = [
  { name: 'Orange Flare', start: '#f97316', end: '#ea580c' },
  { name: 'Midnight Royal', start: '#1d4ed8', end: '#1e1b4b' },
  { name: 'Neon Sunset', start: '#ec4899', end: '#701a75' },
  { name: 'Emerald Cyber', start: '#10b981', end: '#064e3b' },
  { name: 'Phonic Lilac', start: '#8b5cf6', end: '#4c1d95' },
  { name: 'Rogue Crimson', start: '#ef4444', end: '#7f1d1d' }
];

export default function EditPlaylistModal({ playlist, onClose, onSave, onDelete, isNew }: { 
  playlist: Partial<Playlist>; 
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => void;
  isNew?: boolean;
  key?: string | number;
}) {
  const { tracks, uploadFile, updateTrack, deleteTrack } = useMediaStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: playlist?.name || '',
    description: playlist?.description || '',
    image_url: playlist?.image_url || '',
    start_color: playlist?.start_color || '#f97316',
    end_color: playlist?.end_color || '#ea580c',
    track_ids: playlist?.track_ids || [] as string[],
    ...playlist
  });

  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [localEditingTrack, setLocalEditingTrack] = useState<Track | null>(null);

  // Find tracks currently in this playlist
  const playlistTracks = formData.track_ids
    .map(id => tracks.find(t => t.id === id))
    .filter((t): t is Track => !!t);

  // Find tracks not yet in this playlist
  const availableTracks = tracks.filter(t => !formData.track_ids.includes(t.id));

  // Filter available tracks by search query
  const filteredAvailableTracks = availableTracks.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Please specify a name for the collection.');
      return;
    }
    await onSave(formData);
    onClose();
  };

  const handleDelete = () => {
    if (onDelete && playlist.id && confirm('Are you sure you want to delete this collection? This action is permanent.')) {
      onDelete(playlist.id);
      onClose();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Fast local state update for instant preview
    const localUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, image_url: localUrl }));
    setUploading(true);

    try {
      const publicUrl = await uploadFile('playlist_packs', file);
      if (publicUrl) {
        setFormData(prev => ({ ...prev, image_url: publicUrl }));
      }
    } catch (err) {
      console.error('Error uploading cover:', err);
    } finally {
      setUploading(false);
    }
  };

  const selectPresetGradient = (start: string, end: string) => {
    setFormData(prev => ({
      ...prev,
      start_color: start,
      end_color: end
    }));
  };

  const moveTrack = (index: number, direction: 'up' | 'down') => {
    const updatedIds = [...formData.track_ids];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= updatedIds.length) return;
    
    // Swap tracks
    const temp = updatedIds[index];
    updatedIds[index] = updatedIds[targetIndex];
    updatedIds[targetIndex] = temp;
    
    setFormData(prev => ({ ...prev, track_ids: updatedIds }));
  };

  const removeTrack = (trackId: string) => {
    setFormData(prev => ({
      ...prev,
      track_ids: prev.track_ids.filter(id => id !== trackId)
    }));
  };

  const addTrackToCollection = (trackId: string) => {
    if (formData.track_ids.includes(trackId)) return;
    setFormData(prev => ({
      ...prev,
      track_ids: [...prev.track_ids, trackId]
    }));
  };

  return (
    <div id="edit-playlist-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] w-full max-w-4xl my-8 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-zinc-900 flex items-center justify-between shrink-0 bg-zinc-950">
          <div>
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Reference Inscription Portal</span>
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white mt-1">
              {isNew ? 'Create New Collection' : 'Configure Collection Catalog'}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-zinc-900/50 hover:bg-zinc-900 rounded-full text-zinc-400 hover:text-white transition-all cursor-pointer border border-zinc-800/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 bg-zinc-950/80">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Visual Styles & Cover Image */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Cover Art Preview Block */}
              <div className="space-y-3">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block font-black">Visual Art Cover</span>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: formData.image_url 
                      ? 'none' 
                      : `linear-gradient(135deg, ${formData.start_color}, ${formData.end_color})`
                  }}
                  className="aspect-square w-full rounded-[2rem] border border-zinc-900 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 group overflow-hidden relative shadow-inner shadow-black/80"
                >
                  {formData.image_url ? (
                    <>
                      <img src={formData.image_url} className="w-full h-full object-cover" alt="Playlist preview" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-300">
                        <ImageIcon className="text-white w-10 h-10 mb-2 transform scale-75 group-hover:scale-100 transition-transform" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">Replace Image Cover</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center text-white space-y-3">
                      <ImageIcon className="text-white/80 w-12 h-12 mx-auto group-hover:scale-110 transition-transform" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider">Generate artwork pack</p>
                        <p className="text-[9px] text-white/50 uppercase tracking-widest mt-1">Tap to select local file</p>
                      </div>
                    </div>
                  )}

                  {uploading && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
                      <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-2" />
                      <span className="text-[8px] font-mono text-zinc-400 uppercase tracking-widest">Inscribing cover package...</span>
                    </div>
                  )}
                </div>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                />
              </div>

              {/* Direct Image URL input */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block font-black">Or Use External Cover URL</span>
                <input 
                  type="text" 
                  placeholder="https://example.com/artwork.jpg"
                  value={formData.image_url} 
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 outline-none text-xs text-zinc-300 font-mono focus:border-orange-500/80 transition-colors"
                />
              </div>

              {/* Gradient Styling */}
              <div className="space-y-4 pt-4 border-t border-zinc-900">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-black">Background Gradient Fallbacks</span>
                </div>

                {/* Preset circles */}
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_GRADIENTS.map((p) => {
                    const isSelected = formData.start_color === p.start && formData.end_color === p.end;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => selectPresetGradient(p.start, p.end)}
                        className={`p-2 rounded-xl border text-[9px] font-semibold text-left transition-all flex flex-col gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'border-orange-500/80 bg-zinc-900 text-white'
                            : 'border-zinc-900 bg-zinc-900/20 text-zinc-500 hover:border-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        <div 
                          className="w-full h-3.5 rounded-md"
                          style={{ background: `linear-gradient(135deg, ${p.start}, ${p.end})` }}
                        />
                        <span className="truncate block font-mono text-[8px] uppercase">{p.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Hex Custom Color Pickers */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <span className="text-[8px] font-mono uppercase text-zinc-500 block mb-1">Start Tone</span>
                    <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-2">
                      <input 
                        type="color" 
                        value={formData.start_color} 
                        onChange={(e) => setFormData({ ...formData, start_color: e.target.value })}
                        className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer outline-none"
                      />
                      <span className="text-[10px] font-mono uppercase text-zinc-400">{formData.start_color}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[8px] font-mono uppercase text-zinc-500 block mb-1">End Tone</span>
                    <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-2">
                      <input 
                        type="color" 
                        value={formData.end_color} 
                        onChange={(e) => setFormData({ ...formData, end_color: e.target.value })}
                        className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer outline-none"
                      />
                      <span className="text-[10px] font-mono uppercase text-zinc-400">{formData.end_color}</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* RIGHT COLUMN: Descriptive Meta & Tracks Management */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Core Attributes */}
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-2">Playlist Name</span>
                  <input 
                    type="text" 
                    placeholder="Enter collection name..."
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-zinc-900/80 border border-zinc-800/80 rounded-2xl px-5 py-3.5 text-sm outline-none text-white focus:border-orange-500 transition-all font-bold"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-2">Curator Description</span>
                  <textarea 
                    placeholder="Write a high-concept summary of this collection for prospective buyers, labels, and clients..."
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-zinc-900/80 border border-zinc-800/80 rounded-2xl px-5 py-3.5 text-sm outline-none text-zinc-300 focus:border-orange-500 min-h-[100px] leading-relaxed transition-all"
                  />
                </label>
              </div>

              {/* Tracks Currently in Collection */}
              <div className="space-y-3 pt-4 border-t border-zinc-900/80">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">
                    Tracks in Collection ({playlistTracks.length})
                  </span>
                  {playlistTracks.length > 0 && (
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Order catalog below</span>
                  )}
                </div>

                {playlistTracks.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-900/20 border border-dashed border-zinc-900 rounded-2xl flex flex-col items-center justify-center space-y-2">
                    <Music className="w-8 h-8 text-zinc-700" />
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-wide">No Tracks Associated</p>
                    <p className="text-[10px] text-zinc-650 leading-relaxed uppercase tracking-wider">Use the fast adder below to inject reference pieces</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                    {playlistTracks.map((track, idx) => (
                      <div 
                        key={`${track.id}-${idx}`} 
                        className="bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-850 rounded-xl p-3 flex items-center justify-between gap-3 group/track text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Image indicator */}
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-700/40">
                            {track.image_url ? (
                              <img src={track.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <Music className="w-4 h-4 text-zinc-600" />
                            )}
                          </div>
                          <div className="truncate">
                            <p className="font-bold text-white truncate">{track.name}</p>
                            <p className="text-[9px] font-mono text-zinc-500 tracking-wider font-semibold uppercase truncate">
                              {track.artist} | {track.bpm} BPM | {track.key_signature || 'Flat'}
                            </p>
                          </div>
                        </div>

                        {/* Order & Remove Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveTrack(idx, 'up')}
                            className="p-1.5 bg-zinc-950 hover:bg-zinc-800 hover:text-white rounded-lg border border-zinc-900 text-zinc-500 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            type="button"
                            disabled={idx === playlistTracks.length - 1}
                            onClick={() => moveTrack(idx, 'down')}
                            className="p-1.5 bg-zinc-950 hover:bg-zinc-800 hover:text-white rounded-lg border border-zinc-900 text-zinc-500 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setLocalEditingTrack(track)}
                            className="p-1.5 bg-zinc-950 hover:bg-zinc-800 hover:text-white rounded-lg border border-zinc-900 text-zinc-500 transition-all cursor-pointer"
                            title="Edit Track Metadata"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => removeTrack(track.id)}
                            className="p-1.5 bg-zinc-950 hover:bg-rose-500/10 hover:text-rose-400 rounded-lg border border-zinc-900 text-zinc-500 hover:border-rose-500/30 transition-all cursor-pointer"
                            title="Remove Track"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fast Library Adder / Selector */}
              <div className="space-y-3 pt-5 border-t border-zinc-900/80">
                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">
                  Add Catalog Tracks
                </span>

                {/* Inline track search */}
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Search master library..."
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-900/60 border border-zinc-850 rounded-xl pl-9 pr-4 py-2.5 outline-none text-xs text-zinc-300 focus:border-zinc-750 font-medium transition-colors"
                  />
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3.5" />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2.5 p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg text-[9px] font-mono tracking-widest uppercase cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {filteredAvailableTracks.length === 0 ? (
                  <p className="text-[10px] text-zinc-600 font-mono italic uppercase py-2">
                    {searchQuery ? "No matching reference pieces available." : "All library tracks are already inscribed in this collection."}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                    {filteredAvailableTracks.map(track => (
                      <div 
                        key={track.id} 
                        className="bg-zinc-950 border border-zinc-900 rounded-xl p-2.5 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-md bg-zinc-900 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-800">
                            {track.image_url ? (
                              <img src={track.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <Music className="w-3 h-3 text-zinc-600" />
                            )}
                          </div>
                          <div className="truncate text-[11px]">
                            <p className="font-bold text-zinc-300 truncate leading-tight">{track.name}</p>
                            <p className="text-[8px] font-mono text-zinc-600 truncate uppercase mt-0.5">{track.artist}</p>
                          </div>
                        </div>

                        <button 
                          type="button"
                          onClick={() => addTrackToCollection(track.id)}
                          className="p-1 px-2.5 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 text-orange-400 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5 inline-block -mt-0.5 mr-0.5" /> Inject
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

        {/* Action Bar Footer */}
        <div className="p-6 sm:p-8 border-t border-zinc-900 flex flex-col sm:flex-row-reverse gap-4 bg-zinc-950/90 shrink-0">
          <button 
            type="button"
            onClick={handleSave}
            className="flex-1 sm:flex-none py-4 px-8 bg-white hover:bg-zinc-100 text-black text-[10px] font-black uppercase tracking-widest rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.98]"
          >
            <Save className="w-3.5 h-3.5" /> 
            {isNew ? 'Create Collection' : 'Save Configurations'}
          </button>
          
          {!isNew && onDelete && (
            <button 
              type="button"
              onClick={handleDelete}
              className="py-4 px-6 border border-zinc-900 text-rose-500 hover:bg-rose-500/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:border-rose-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Collection
            </button>
          )}

          <button 
            type="button"
            onClick={onClose}
            className="py-4 px-6 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center cursor-pointer"
          >
            Abort
          </button>
        </div>

      </div>
      {localEditingTrack && (
        <EditTrackModal 
          track={localEditingTrack}
          onClose={() => setLocalEditingTrack(null)}
          onSave={updateTrack}
          onDelete={deleteTrack}
        />
      )}
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { X, Save, Image as ImageIcon, Trash2, Loader2, Sparkles, Download, Play, Pause, Clock } from 'lucide-react';
import { Track } from '../types';
import { useMediaStore } from '../context/MediaStoreContext';
import { useAudio } from '../context/AudioContext';
import { formatLrcTime, parseLrc, convertJsonToLrc } from '../utils/lrcParser';
import { runManualTrackAnalysis } from '../services/musicIntelligence';
import { profileToLegacyTrackUpdates } from '../services/musicIntelligenceCore';
import { runLocalAudioTool } from '../services/browserAudioTools';

export default function EditTrackModal({ track, onClose, onSave, onDelete }: { 
  track: Track; 
  onClose: () => void;
  onSave?: (id: string, updates: Partial<Track>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  key?: string | number;
}) {
  const { uploadFile, updateTrack, addToast } = useMediaStore();
  const [formData, setFormData] = useState({ ...track });
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDraggingLyrics, setIsDraggingLyrics] = useState(false);
  const [lyricsFilename, setLyricsFilename] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lyricsInputRef = useRef<HTMLInputElement>(null);

  // Synced Lyrics Audio & Sync States
  const { activeTrack, isPlaying, progress, playTrack, pause, resume } = useAudio();
  const [lyricTab, setLyricTab] = useState<'editor' | 'sync'>('editor');
  const [syncIndex, setSyncIndex] = useState<number>(0);

  // Parse lyrics lines dynamically
  const getParsedLyricsLines = () => {
    const rawLines = (formData.lyrics || '').split('\n');
    return rawLines.map(line => {
      const match = line.match(/^\[(\d+):(\d+)(?:[.:](\d+))?\]\s*(.*)$/);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const fractionStr = match[3] || '0';
        const fraction = parseInt(fractionStr, 10) / Math.pow(10, fractionStr.length);
        const time = min * 60 + sec + fraction;
        return {
          timestamp: time,
          text: match[4]
        };
      }
      return {
        timestamp: undefined,
        text: line
      };
    });
  };

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>('');

  const handleTranscribeWithWhisper = async () => {
    setIsTranscribing(true);
    setTranscriptionStatus("Loading audio locally...");
    addToast?.("Starting private browser-local transcription...", "info");

    try {
      const result = await runLocalAudioTool(formData, 'lyrics', undefined, setTranscriptionStatus);
      if (!result.lyrics?.trim()) throw new Error("No reliable lyrics were returned.");
      setFormData(prev => ({ ...prev, lyrics: result.lyrics! }));
      setTranscriptionStatus("");
      addToast?.("Private browser-local lyric transcription complete!", "success");
      if (result.warning) addToast?.(result.warning, "info");
    } catch (err: any) {
      console.error(err);
      addToast?.(`Local transcription failed: ${err.message || err}`, "error");
      setTranscriptionStatus("");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleUpdateLineTimestamp = (index: number, timestamp: number | undefined) => {
    const lines = getParsedLyricsLines();
    if (index >= 0 && index < lines.length) {
      lines[index].timestamp = timestamp;
      const updatedText = lines.map(l => {
        if (l.timestamp !== undefined) {
          return `${formatLrcTime(l.timestamp)} ${l.text}`;
        }
        return l.text;
      }).join('\n');
      setFormData(prev => ({ ...prev, lyrics: updatedText }));
    }
  };

  const handleResetAllTimestamps = () => {
    if (confirm("Are you sure you want to strip all timestamps from these lyrics?")) {
      const lines = getParsedLyricsLines();
      const strippedText = lines.map(l => l.text).join('\n');
      setFormData(prev => ({ ...prev, lyrics: strippedText }));
      setSyncIndex(0);
      addToast("All timestamps cleared!", "info");
    }
  };

  const handleStampCurrentLine = () => {
    if (activeTrack?.id !== track.id) {
      addToast("Please load and play the track to stamp lyrics", "error");
      return;
    }
    const lines = getParsedLyricsLines();
    if (syncIndex >= 0 && syncIndex < lines.length) {
      handleUpdateLineTimestamp(syncIndex, progress);
      // Advance to next non-empty line
      let nextIndex = syncIndex + 1;
      while (nextIndex < lines.length && !lines[nextIndex].text.trim()) {
        nextIndex++;
      }
      if (nextIndex < lines.length) {
        setSyncIndex(nextIndex);
      }
    }
  };

  const handleDownloadArtwork = async () => {
    if (!formData.image_url) return;
    try {
      addToast("Preparing download...", "info");
      const res = await fetch(formData.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${formData.name || 'track'}_artwork.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Artwork downloaded successfully!", "success");
    } catch (err) {
      console.error("Download failed:", err);
      window.open(formData.image_url, '_blank');
    }
  };

  const handleSave = async () => {
    if (onSave) {
      await onSave(track.id, formData);
    }
    onClose();
  };

  const handleLyricsFile = (f: File) => {
    if (!f) return;
    if (f.name.endsWith('.txt') || f.name.endsWith('.lrc') || f.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          setFormData(prev => ({ ...prev, lyrics: text }));
          setLyricsFilename(f.name);
          addToast(`Loaded plain text / LRC lyrics: ${f.name}`, "success");
        }
      };
      reader.readAsText(f);
    } else if (f.name.endsWith('.json') || f.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          try {
            const convertedLrc = convertJsonToLrc(text);
            setFormData(prev => ({ ...prev, lyrics: convertedLrc }));
            setLyricsFilename(f.name);
            addToast(`Successfully imported and converted timestamped JSON lyrics: ${f.name}`, "success");
          } catch (err: any) {
            console.error(err);
            addToast(err.message || "Failed to parse JSON lyrics", "error");
          }
        }
      };
      reader.readAsText(f);
    } else {
      addToast("Unsupported file format. Please upload .txt, .lrc, or .json files.", "error");
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const localUrl = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, image_url: localUrl }));
      setUploading(true);

      try {
        const publicUrl = await uploadFile('artwork', file);
        if (publicUrl) {
          setFormData(prev => ({ ...prev, image_url: publicUrl }));
        }
      } catch (err) {
        console.error('Error uploading track artwork:', err);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleDelete = async () => {
    if (onDelete && confirm('Are you sure you want to delete this track?')) {
      await onDelete(track.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div 
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingLyrics(true);
        }}
        onDragLeave={() => setIsDraggingLyrics(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingLyrics(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleLyricsFile(file);
        }}
        className={`bg-zinc-950 border rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl transition-all duration-300 ${
          isDraggingLyrics ? 'border-orange-500 bg-zinc-950/90 scale-[1.01]' : 'border-zinc-900'
        }`}
      >
        <div className="p-8 border-b border-zinc-900 flex items-center justify-between sticky top-0 bg-zinc-950 z-10">
          <h2 className="text-xl font-black uppercase tracking-tight">Edit Metadata</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full transition-colors"><X/></button>
        </div>
        <div className="p-8 flex flex-col md:flex-row gap-8">
          {/* Artwork Upload Column */}
          <div className="w-full md:w-80 space-y-5 shrink-0">
            <div 
              onClick={() => imageInputRef.current?.click()}
              className="bg-zinc-90 w-full rounded-2xl border border-zinc-800 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 group overflow-hidden relative shadow-inner shadow-black/60 min-h-[200px] transition-all bg-zinc-900/50 aspect-square"
            >
              {formData.image_url ? (
                <>
                  <img src={formData.image_url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-300 gap-1.5">
                    <ImageIcon className="text-white w-7 h-7" />
                    <span className="text-[7px] font-black uppercase tracking-widest text-zinc-300">Replace Image</span>
                  </div>
                </>
              ) : (
                <>
                  <ImageIcon className="text-zinc-500 w-10 h-10 group-hover:text-orange-500 transition-colors" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mt-2">ADD ARTWORK</span>
                </>
              )}

              {uploading && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin mb-1" />
                  <span className="text-[7px] font-mono text-zinc-400 uppercase tracking-widest text-center px-2">Uploading art...</span>
                </div>
              )}
            </div>
            
            {formData.image_url && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadArtwork}
                  className="flex-1 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                >
                  <Download className="w-3 h-3 text-orange-500" /> Download Art
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, image_url: "" }))}
                  className="py-1.5 px-3 bg-zinc-950 hover:bg-rose-950/20 border border-zinc-900 hover:border-rose-900/35 text-zinc-550 hover:text-rose-400 rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 text-zinc-500"
                >
                  Clear
                </button>
              </div>
            )}

            <input 
              type="file" 
              ref={imageInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageChange} 
            />
            <p className="text-[9px] text-zinc-500 text-center font-medium leading-relaxed uppercase tracking-widest px-2">
              Recommended Square aspect ratio for streaming portals
            </p>

          </div>

          {/* Form Fields */}
          <div className="flex-1 space-y-6">
            <div className="space-y-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Track Name</span>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">BPM</span>
                  <input 
                    type="number" 
                    value={formData.bpm} 
                    onChange={(e) => setFormData({ ...formData, bpm: parseInt(e.target.value) || 0 })}
                    className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500"
                  />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Key</span>
                  <input 
                    type="text" 
                    value={formData.key_signature} 
                    onChange={(e) => setFormData({ ...formData, key_signature: e.target.value })}
                    className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500"
                  />
                </label>
              </div>

              {/* Dynamic Reanalyze Track Button */}
              <button
                type="button"
                disabled={analyzing}
                onClick={async () => {
                  setAnalyzing(true);
                  addToast(`Starting AWS Music Intelligence for "${formData.name}"...`, "info");
                  try {
                    const analysisTrack = { ...track, ...formData } as Track;
                    const profile = await runManualTrackAnalysis(analysisTrack, updateTrack);
                    const legacyUpdates = profileToLegacyTrackUpdates(profile, formData.tags || []);
                    setFormData(prev => ({ ...prev, ...legacyUpdates, status: 'ready' }));
                    addToast("AWS Music Intelligence succeeded. Metadata fields updated.", "success");
                  } catch (err: any) {
                    console.error("AWS Music Intelligence failed:", err);
                    addToast(`Analysis failed: ${err.message || err}`, "error");
                  } finally {
                    setAnalyzing(false);
                  }
                }}
                className={`w-full py-2.5 border rounded-xl font-black uppercase tracking-widest text-[9px] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  analyzing 
                  ? 'bg-zinc-900/50 text-zinc-500 border-zinc-800 cursor-not-allowed' 
                  : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/25 active:scale-95'
                }`}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Running High-Precision Diagnostics...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                    Re-Analyze with AWS Music Intelligence
                  </>
                )}
              </button>

              {/* Lyrics Editing & Drop zone inside form */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest flex items-center gap-1.5">
                      📝 Lyrics Studio
                    </span>
                    <div className="flex bg-zinc-950 p-0.5 border border-zinc-900 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setLyricTab('editor')}
                        className={`px-3 py-1 text-[8px] font-black uppercase tracking-wider rounded-md transition-all ${
                          lyricTab === 'editor'
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-550 hover:text-zinc-300 text-zinc-500"
                        }`}
                      >
                        ✍️ Text Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLyricTab('sync');
                          // Initialize sync index to first non-empty line
                          const lines = getParsedLyricsLines();
                          const idx = lines.findIndex(l => l.text.trim() !== '');
                          setSyncIndex(idx !== -1 ? idx : 0);
                        }}
                        className={`px-3 py-1 text-[8px] font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-1 ${
                          lyricTab === 'sync'
                            ? "bg-zinc-800 text-orange-400"
                            : "text-zinc-550 hover:text-zinc-300 text-zinc-500"
                        }`}
                      >
                        ⏱️ Lyric Sync Studio
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {lyricsFilename && (
                      <span className="text-[8px] font-mono bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded border border-zinc-800 uppercase max-w-[120px] truncate" title={lyricsFilename}>
                        File: {lyricsFilename}
                      </span>
                    )}
                    <button 
                      type="button"
                      onClick={() => lyricsInputRef.current?.click()}
                      className="text-[9px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                    >
                      Browse TXT / LRC / JSON
                    </button>
                    <button
                      type="button"
                      onClick={handleTranscribeWithWhisper}
                      disabled={isTranscribing}
                      className="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors disabled:text-zinc-600 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
                      title="Transcribe track audio using Whisper AI"
                    >
                      {isTranscribing ? "Transcribing..." : "🎙️ Whisper STT"}
                    </button>
                    {formData.lyrics && (
                      <button 
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, lyrics: '' }));
                          setLyricsFilename(null);
                        }}
                        className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {lyricTab === 'editor' ? (
                  <div className="space-y-2">
                    <textarea
                      value={formData.lyrics || ''}
                      onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
                      placeholder="Drop a lyric sheet (.txt, .lrc, .json) anywhere here, or click Browse to load..."
                      className="w-full h-44 bg-zinc-900 border border-zinc-800 rounded-xl p-3 outline-none focus:border-orange-500 text-[11px] font-mono leading-relaxed resize-none text-zinc-300 placeholder:text-zinc-600"
                    />
                    <p className="text-[8.5px] font-mono text-zinc-600 uppercase tracking-wider leading-relaxed">
                      💡 Standard format: paste lyrics here line by line, then click ⏱️ Lyric Sync Studio to sync timestamps real-time! Or import a timestamped <code className="text-zinc-400">.json</code> file directly!
                    </p>
                  </div>
                ) : (
                  <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 space-y-4">
                    {/* Sync Studio Player Panel */}
                    {activeTrack?.id !== track.id ? (
                      <div className="flex flex-col items-center justify-center text-center p-6 bg-zinc-900/30 border border-dashed border-zinc-850 rounded-xl">
                        <Clock className="w-8 h-8 text-zinc-600 mb-2 animate-pulse" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Audio Not Loaded</h4>
                        <p className="text-[8px] uppercase tracking-wider text-zinc-500 mt-1 max-w-sm">
                          To record time-stamps in real-time, the active playback engine must be playing this exact track.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            playTrack(track);
                            addToast("Loading track into studio playhead...", "info");
                          }}
                          className="mt-4 px-5 py-2 bg-orange-500 hover:bg-orange-400 text-black text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5 transition-all"
                        >
                          <Play className="w-3 h-3 fill-current" /> Load & Play Master
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Interactive Playback HUD */}
                        <div className="flex items-center justify-between p-3 bg-zinc-900/40 border border-zinc-900 rounded-xl">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={isPlaying ? pause : resume}
                              className="w-8 h-8 rounded-full bg-orange-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            >
                              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                            </button>
                            <div>
                              <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Studio Playhead</span>
                              <span className="text-[11px] font-mono text-zinc-300 font-bold">
                                {Math.floor(progress / 60)}:{(Math.floor(progress % 60)).toString().padStart(2, '0')}.{Math.floor((progress % 1) * 100).toString().padStart(2, '0')}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleResetAllTimestamps}
                              className="py-1.5 px-3 border border-zinc-800 hover:border-zinc-700 text-[8px] font-black uppercase tracking-wider text-zinc-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                            >
                              Strip All Stamps
                            </button>
                          </div>
                        </div>

                        {/* Interactive lines list */}
                        <div className="max-h-52 overflow-y-auto border border-zinc-900 rounded-xl divide-y divide-zinc-900 bg-zinc-950/80 pr-1">
                          {getParsedLyricsLines().map((line, idx) => {
                            const isCurrent = syncIndex === idx;
                            const hasStamp = line.timestamp !== undefined;

                            return (
                              <div
                                key={idx}
                                onClick={() => setSyncIndex(idx)}
                                className={`p-2.5 flex items-center justify-between cursor-pointer transition-all select-none text-left ${
                                  isCurrent 
                                    ? "bg-orange-500/10 border-l-2 border-orange-500" 
                                    : "hover:bg-zinc-900/50"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-[8px] font-mono font-bold shrink-0 px-2 py-0.5 rounded ${
                                    hasStamp 
                                      ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" 
                                      : "bg-zinc-900 text-zinc-600"
                                  }`}>
                                    {hasStamp ? formatLrcTime(line.timestamp!) : "--:--"}
                                  </span>
                                  <span className={`text-[10px] truncate ${
                                    isCurrent 
                                      ? "text-orange-400 font-bold" 
                                      : line.text.trim() === '' 
                                        ? "text-zinc-800 italic text-[8px] uppercase tracking-widest"
                                        : "text-zinc-350"
                                  }`}>
                                    {line.text.trim() === '' ? "[BLANK LINE]" : line.text}
                                  </span>
                                </div>

                                <div className="flex gap-1">
                                  {hasStamp && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateLineTimestamp(idx, undefined);
                                      }}
                                      className="text-[7.5px] font-black uppercase text-zinc-600 hover:text-rose-400 px-1 py-0.5 transition-colors cursor-pointer"
                                    >
                                      Clear
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSyncIndex(idx);
                                      handleUpdateLineTimestamp(idx, progress);
                                    }}
                                    className="text-[7.5px] font-black uppercase text-orange-500 hover:text-orange-300 px-1 py-0.5 transition-colors cursor-pointer font-mono"
                                  >
                                    Stamp Now
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Stamping Action triggers */}
                        <div className="flex gap-3 pt-1">
                          <button
                            type="button"
                            onClick={handleStampCurrentLine}
                            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-black font-black uppercase tracking-widest text-[9.5px] rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/15 active:scale-95 transition-transform cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5 fill-current" />
                            <span>Stamp Current Line & Next</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              const lines = getParsedLyricsLines();
                              let next = syncIndex + 1;
                              while (next < lines.length && !lines[next].text.trim()) next++;
                              if (next < lines.length) setSyncIndex(next);
                            }}
                            className="py-3 px-4 border border-zinc-800 hover:border-zinc-700 text-[8.5px] text-zinc-400 hover:text-white font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer"
                          >
                            Skip Line
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <input 
                  type="file" 
                  ref={lyricsInputRef} 
                  accept=".txt,.lrc,.json,text/plain,application/json" 
                  className="hidden" 
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) handleLyricsFile(selectedFile);
                  }} 
                />
              </div>
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={handleDelete}
                className="flex-1 py-4 border border-zinc-900 text-rose-500 rounded-full font-black uppercase tracking-widest text-[10px] hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Purge
              </button>
              <button 
                onClick={handleSave}
                className="flex-[2] py-4 bg-white text-black rounded-full font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:scale-105 transition-transform"
              >
                <Save className="w-4 h-4" /> Commit Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

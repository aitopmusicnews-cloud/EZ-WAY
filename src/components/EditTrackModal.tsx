import React, { useState, useRef } from 'react';
import { X, Save, Image as ImageIcon, Trash2, Loader2, Sparkles, Key, LogIn, LogOut, Shuffle, Lock, Download, Play, Pause, Clock } from 'lucide-react';
import { Track } from '../types';
import { useMediaStore } from '../context/MediaStoreContext';
import { useAudio } from '../context/AudioContext';
import { formatLrcTime, parseLrc, convertJsonToLrc } from '../utils/lrcParser';

export default function EditTrackModal({ track, onClose, onSave, onDelete }: { 
  track: Track; 
  onClose: () => void;
  onSave?: (id: string, updates: Partial<Track>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  key?: string | number;
}) {
  const { uploadFile, analyzeTrack, addToast } = useMediaStore();
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
    setTranscriptionStatus("Extracting audio...");
    addToast?.("Extracting audio for Whisper Transcription...", "info");
    
    let audioData: string | null = null;
    let audioMimeType = "audio/mpeg";

    try {
      let blob: Blob | null = null;
      if (formData.file_data) {
        blob = formData.file_data;
      } else if (formData.file_url) {
        const response = await fetch(formData.file_url);
        blob = await response.blob();
      }

      if (!blob) {
        throw new Error("No audio source available for transcription. Please upload a track audio file first.");
      }

      audioMimeType = blob.type || "audio/mpeg";
      
      audioData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      setTranscriptionStatus("Transcribing...");
      addToast?.("Transcribing with Whisper voice API...", "info");

      const res = await fetch("/api/transcribe-lyrics-pollinations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackInfo: formData,
          audioData,
          audioMimeType,
          pollinationsUserKey: localStorage.getItem("POLLINATIONS_USER_KEY") || ""
        }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Server returned error status");
      }
      
      if (data.lyrics) {
        setFormData(prev => ({ ...prev, lyrics: data.lyrics }));
        setTranscriptionStatus("");
        if (data.isFallback) {
          addToast?.("Demo Mode: No active API key found. Synthesized custom-themed track lyrics instead! To transcribe real audio, set your Gemini API key in Settings > Secrets.", "warning");
        } else {
          addToast?.("Whisper lyric transcription complete!", "success");
        }
      } else {
        throw new Error("No lyrics returned in Whisper response");
      }
    } catch (err: any) {
      console.error(err);
      addToast?.(`Whisper transcription failed: ${err.message || err}`, "error");
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

  // Cover Gen States
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingArt, setGeneratingArt] = useState(false);
  const [pollinationsKeyConnected, setPollinationsKeyConnected] = useState(() => !!localStorage.getItem("POLLINATIONS_USER_KEY"));
  
  // Advanced features state
  const [aiModel, setAiModel] = useState<"flux" | "flux-realism" | "flux-anime" | "any-dark" | "turbo">("flux");
  const [aiAspect, setAiAspect] = useState<"1:1" | "9:16" | "16:9">("1:1");
  const [aiSeed, setAiSeed] = useState<"random" | "locked">("random");
  const [lockedSeedValue, setLockedSeedValue] = useState<number>(0);
  const [artStyle, setArtStyle] = useState<"none" | "cyberpunk" | "highfashion" | "vintage" | "brutalist" | "lofi">("highfashion");
  const [addParentalLabel, setAddParentalLabel] = useState(false);
  const [addTypographyOverlay, setAddTypographyOverlay] = useState(false);

  const connectPollinations = () => {
    // Generate simple redirect URI back to the application parent window route or custom callback on render
    const origin = window.location.origin;
    const isRender = origin.includes("onrender.com") || origin.includes("ogbeatzplaylistmanager");
    const targetUrl = isRender ? "https://ogbeatzplaylistmanager.onrender.com/auth/callback" : window.location.href;
    const redirectUrl = encodeURIComponent(targetUrl);
    const clientId = (import.meta as any).env.VITE_POLLINATIONS_CLIENT_ID || "pk_UkifqMuyjH77QPxB";
    const authUrl = `https://enter.pollinations.ai/authorize?redirect_uri=${redirectUrl}&client_id=${clientId}`;
    
    addToast("Redirecting to Pollinations for secure login...", "info");
    setTimeout(() => {
      window.location.href = authUrl;
    }, 1200);
  };

  const disconnectPollinations = () => {
    localStorage.removeItem("POLLINATIONS_USER_KEY");
    setPollinationsKeyConnected(false);
    addToast("Disconnected your Pollinations account.", "info");
  };

  const handleSuggestPrompt = () => {
    const name = formData.name || 'Electronic Beat';
    const artist = formData.artist || 'OG Beatz';
    const bpm = formData.bpm ? `${formData.bpm} BPM` : '';
    const key = formData.key_signature ? `Key signature of ${formData.key_signature}` : '';
    
    // Check tags for automatic layout matching
    const tagsArr = formData.tags || [];
    const tagsStr = tagsArr.length > 0 ? `vibe matching ${tagsArr.join(', ')}` : '';
    
    let genreDescriptor = "tech-forward electronic beat style";
    if (tagsArr.some(t => ['lofi', 'chill', 'relaxed'].includes(t.toLowerCase()))) {
      genreDescriptor = "mellow cozy lofi bedroom vibe";
    } else if (tagsArr.some(t => ['drill', 'gritty', 'aggressive'].includes(t.toLowerCase()))) {
      genreDescriptor = "dark aggressive UK Drill aesthetic";
    } else if (tagsArr.some(t => ['trap', 'rap', 'hip hop'].includes(t.toLowerCase()))) {
      genreDescriptor = "high-energy trap style with booming atmospheric visualizer energy";
    }

    setAiPrompt(`Professional album cover art, premium layout for "${name}" by ${artist}. Visual theme: ${genreDescriptor}. ${bpm ? `${bpm} dynamic drive.` : ''} ${key ? `harmonic theme based on ${key}.` : ''} ${tagsStr ? `Aesthetics: ${tagsStr}.` : ''} Premium 8k resolution, custom organic cinematic lighting, deep immersive shadows, ultra detailed composition.`);
  };

  const handleGenerateAiArt = async () => {
    if (!aiPrompt.trim()) {
      addToast("Please enter a visual design prompt first", "error");
      return;
    }
    
    setGeneratingArt(true);
    addToast("Generating premium artwork with Pollinations Flux AI...", "info");
    
    try {
      const userKey = localStorage.getItem("POLLINATIONS_USER_KEY") || "";
      const seed = aiSeed === "locked" && lockedSeedValue > 0 
        ? lockedSeedValue 
        : Math.floor(Math.random() * 1000000);
      
      if (aiSeed === "random" || lockedSeedValue === 0) {
        setLockedSeedValue(seed);
      }

      let finalPrompt = aiPrompt.trim();
      
      // Append style profile overrides
      if (artStyle === "cyberpunk") {
        finalPrompt += ", dark cyberpunk visual aesthetic, intense amber and fire accents, neon obsidian chrome detailing";
      } else if (artStyle === "highfashion") {
        finalPrompt += ", high-fashion editorial studio album cover art, stark metallic silver, ultra-clean minimalism, high contrast, deep shadows, 8k";
      } else if (artStyle === "vintage") {
        finalPrompt += ", rustic 70s vintage vinyl cover art style, analog film grain, highly saturated classic tones, warm nostalgic glow";
      } else if (artStyle === "brutalist") {
        finalPrompt += ", brutalist poster style, holographic chrome spikes, loud metallic distortion, technical high-contrast elements, cyber-gothic";
      } else if (artStyle === "lofi") {
        finalPrompt += ", cozy lofi watercolor illustration, soft pastel colors, hand-painted organic details, relaxed dreamy vibe";
      }

      // Append parental explicit label
      if (addParentalLabel) {
        finalPrompt += ', with a small official black and white "PARENTAL ADVISORY EXPLICIT CONTENT" logo rendered neatly in the bottom corner of the sleeve';
      }

      // Append typography overlay
      if (addTypographyOverlay) {
        const trackTitle = formData.name || 'Untitled';
        const trackArtist = formData.artist || 'OG Beatz';
        finalPrompt += `, featuring the track title "${trackTitle.toUpperCase()}" by artist "${trackArtist.toUpperCase()}" rendered as sleek modern ambient typographic text overlay in clean minimalist layout on the artwork`;
      }

      let width = 1024;
      let height = 1024;
      if (aiAspect === "9:16") {
        width = 576;
        height = 1024;
      } else if (aiAspect === "16:9") {
        width = 1024;
        height = 576;
      }

      let url = `https://gen.pollinations.ai/image/${encodeURIComponent(finalPrompt)}?model=${aiModel}&width=${width}&height=${height}&seed=${seed}`;
      if (userKey) {
        url += `&key=${encodeURIComponent(userKey)}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Aesthetic engine unresponsive or rate limited");
      
      const blob = await response.blob();
      const file = new File([blob], `ai_art_${Date.now()}.png`, { type: 'image/png' });
      
      setUploading(true);
      const publicUrl = await uploadFile('artwork', file);
      if (publicUrl) {
        setFormData(prev => ({ ...prev, image_url: publicUrl }));
        addToast("AI Cover Art generated and uploaded successfully!", "success");
      } else {
        throw new Error("Local upload failed");
      }
    } catch (err: any) {
      console.error("AI Art generation failed:", err);
      addToast(`Artwork generation failed: ${err.message || err}`, "error");
    } finally {
      setGeneratingArt(false);
      setUploading(false);
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
          <h2 className="text-xl font-black uppercase tracking-tight">Edit Metadata & Cover Studio</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full transition-colors"><X/></button>
        </div>
        <div className="p-8 flex flex-col md:flex-row gap-8">
          {/* Artwork Upload & AI Cover Studio Column */}
          <div className="w-full md:w-80 space-y-5 shrink-0">
            <div 
              onClick={() => imageInputRef.current?.click()}
              className={`bg-zinc-90 w-full rounded-2xl border border-zinc-800 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 group overflow-hidden relative shadow-inner shadow-black/60 min-h-[200px] transition-all bg-zinc-900/50 ${
                aiAspect === "9:16" ? "aspect-[9/16]" : aiAspect === "16:9" ? "aspect-[16/9]" : "aspect-square"
              }`}
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

            {/* AI Cover Art Generator Widget */}
            <div className="p-4 bg-zinc-900/45 border border-zinc-900 rounded-2xl space-y-3.5">
              <div className="flex items-center gap-1.5 justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-orange-500 animate-pulse" /> AI Cover Studio
                </span>
                <span className="text-[7px] font-mono bg-orange-500/10 border border-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">
                  Flux-2026
                </span>
              </div>

              {/* Pollinations BYOP Authentication section */}
              <div className="flex items-center justify-between bg-zinc-950/60 p-2 border border-zinc-850 rounded-xl text-[9px]">
                <div className="flex items-center gap-1">
                  <Key className={`w-3 h-3 ${pollinationsKeyConnected ? 'text-green-400' : 'text-zinc-500'}`} />
                  <span className="font-mono text-[8px] text-zinc-400">
                    {pollinationsKeyConnected ? "Pollinations Sync'd" : "No Account Linked"}
                  </span>
                </div>
                {pollinationsKeyConnected ? (
                  <button
                    type="button"
                    onClick={disconnectPollinations}
                    className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-2.5 h-2.5" /> Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectPollinations}
                    className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                  >
                    <LogIn className="w-2.5 h-2.5" /> Login / BYOP
                  </button>
                )}
              </div>

              {/* Options Panel */}
              <div className="space-y-3 pt-1">
                {/* Model Selector */}
                <div className="space-y-1 text-left">
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block">
                    AI Generation Model
                  </label>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-lg px-2 py-1.5 focus:border-orange-500 text-[9px] font-mono text-zinc-300 outline-none cursor-pointer"
                  >
                    <option value="flux">⚡ Flux Schnell (Authentic Detail)</option>
                    <option value="flux-realism">📸 Flux Realism (Photorealistic)</option>
                    <option value="flux-anime">🎨 Flux Anime (Illustration/Arts)</option>
                    <option value="any-dark">🌌 Any Dark (Immersive Cosmic)</option>
                    <option value="turbo">🚀 Turbo Speed (Fast Render)</option>
                  </select>
                </div>

                {/* Aspect Ratio Selector */}
                <div className="space-y-1 text-left">
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block">
                    Aspect Ratio / Size
                  </label>
                  <div className="flex bg-zinc-950 rounded-xl p-0.5 border border-zinc-855">
                    {(["1:1", "9:16", "16:9"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setAiAspect(r)}
                        className={`flex-1 py-1 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
                          aiAspect === r
                            ? "bg-zinc-805 text-white bg-zinc-800"
                            : "text-zinc-550 hover:text-zinc-300 text-zinc-500"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Seed Control */}
                <div className="space-y-1 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block">
                      Seed Randomization
                    </label>
                    <span className="text-[7.5px] font-mono text-zinc-400">
                      {aiSeed === "locked" ? `Seed: ${lockedSeedValue}` : "Random"}
                    </span>
                  </div>
                  <div className="flex bg-zinc-950 rounded-xl p-0.5 border border-zinc-850">
                    <button
                      type="button"
                      onClick={() => setAiSeed("random")}
                      className={`flex-1 py-1 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 ${
                        aiSeed === "random"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-550 hover:text-zinc-300 text-zinc-500"
                      }`}
                    >
                      <Shuffle className="w-2.5 h-2.5" /> Random
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiSeed("locked");
                        if (lockedSeedValue === 0) {
                          setLockedSeedValue(Math.floor(Math.random() * 1000000));
                        }
                      }}
                      className={`flex-1 py-1 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 ${
                        aiSeed === "locked"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-550 hover:text-zinc-300 text-zinc-500"
                      }`}
                    >
                      <Lock className="w-2.5 h-2.5" /> Lock Seed
                    </button>
                  </div>
                </div>

                {/* Aesthetic presets */}
                <div className="space-y-1 text-left">
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block">
                    Aesthetic Profile Style
                  </label>
                  <select
                    value={artStyle}
                    onChange={(e) => setArtStyle(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-lg px-2 py-1.5 focus:border-orange-500 text-[9px] font-mono text-zinc-350 outline-none cursor-pointer"
                  >
                    <option value="none">No Preset Overrides</option>
                    <option value="highfashion">🕶️ High-Fashion Editorial</option>
                    <option value="cyberpunk">🔥 Cyberpunk Obsidian</option>
                    <option value="vintage">📼 Vintage Vinyl (Nostalgia)</option>
                    <option value="brutalist">💿 Brutalist Chrome Noise</option>
                    <option value="lofi">☕ Mellow Lofi Watercolor</option>
                  </select>
                </div>

                {/* Overlays */}
                <div className="flex gap-2 pt-1">
                  <label className="flex-1 select-none flex items-center gap-1.5 bg-zinc-950/40 p-2 border border-zinc-900 rounded-xl cursor-pointer hover:border-zinc-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={addParentalLabel}
                      onChange={(e) => setAddParentalLabel(e.target.checked)}
                      className="w-3 h-3 text-orange-500 rounded border-zinc-800 bg-transparent accent-orange-500 cursor-pointer"
                    />
                    <div className="text-left leading-none">
                      <p className="text-[7.5px] font-bold text-zinc-300 uppercase">Parental</p>
                      <p className="text-[6px] text-zinc-500 tracking-wider font-mono">Explicit</p>
                    </div>
                  </label>

                  <label className="flex-1 select-none flex items-center gap-1.5 bg-zinc-950/40 p-2 border border-zinc-900 rounded-xl cursor-pointer hover:border-zinc-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={addTypographyOverlay}
                      onChange={(e) => setAddTypographyOverlay(e.target.checked)}
                      className="w-3 h-3 text-orange-500 rounded border-zinc-800 bg-transparent accent-orange-500 cursor-pointer"
                    />
                    <div className="text-left leading-none">
                      <p className="text-[7.5px] font-bold text-zinc-300 uppercase">Text Burn</p>
                      <p className="text-[6px] text-zinc-500 tracking-wider font-mono">Title Overlay</p>
                    </div>
                  </label>
                </div>
              </div>

              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe your design concept (e.g., Cybernetic mixer board in obsidian smoke with safety orange cords...)"
                className="w-full h-16 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 outline-none focus:border-orange-500 text-[10px] font-mono leading-relaxed resize-none text-zinc-300 placeholder:text-zinc-650"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSuggestPrompt}
                  className="flex-1 py-1.5 px-1 border border-zinc-850 hover:border-zinc-700 text-[8px] font-black uppercase tracking-wider text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer active:scale-95"
                >
                  Suggest Vibe
                </button>
                <button
                  type="button"
                  disabled={generatingArt || uploading}
                  onClick={handleGenerateAiArt}
                  className="flex-1 py-1.5 px-1 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-900 text-black disabled:text-zinc-500 text-[8px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 disabled:scale-100"
                >
                  {generatingArt ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>}
                  {generatingArt ? "Designing..." : "Generate"}
                </button>
              </div>
            </div>
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
                  addToast(`Initiating high-precision AI diagnostics for "${formData.name}"...`, "info");
                  try {
                    const result = await analyzeTrack(formData.name, formData.duration);
                    if (result) {
                      setFormData(prev => ({
                        ...prev,
                        bpm: result.bpm,
                        key_signature: result.key,
                        tags: result.tags || prev.tags
                      }));
                      addToast("AI Analysis succeeded! Fields updated.", "success");
                    }
                  } catch (err: any) {
                    console.error("AI Analysis failed:", err);
                    addToast(`Diagnostics failed: ${err.message || err}`, "error");
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
                    Reanalyze Track with Gemini AI
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

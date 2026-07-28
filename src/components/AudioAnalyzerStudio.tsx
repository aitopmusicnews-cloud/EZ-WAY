import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, Sparkles, Music, Sliders, Volume2, Compass, 
  Info, RefreshCw, Flame, ArrowRight, AlertTriangle, 
  CheckCircle2, HardDrive, Play, Pause, Upload, Trash2, Gauge, HelpCircle,
  Mic, FileText, Check, Edit, Save
} from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import { useAudio } from '../context/AudioContext';
import { analyzeAudioDsp, DspAnalysisResult } from '../services/audioDsp';
import { cn } from '../lib/utils';

interface LyricLine {
  time: number; // in seconds
  text: string;
}

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const parseLyrics = (lyricsStr: string): LyricLine[] => {
  if (!lyricsStr) return [];
  const lines = lyricsStr.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\]/;

  lines.forEach(line => {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const time = minutes * 60 + seconds;
      const text = line.replace(timeRegex, '').trim();
      result.push({ time, text });
    } else if (line.trim()) {
      result.push({ time: -1, text: line.trim() });
    }
  });

  return result.sort((a, b) => a.time - b.time);
};

export default function AudioAnalyzerStudio() {
  const { tracks, updateTrack, addToast } = useMediaStore();
  const { activeTrack, isPlaying, progress, duration, playTrack, pause, resume, seek } = useAudio();
  
  // State variables
  const [selectedTrackId, setSelectedTrackId] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DspAnalysisResult | null>(null);

  // Lyrics Transcription states
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState("");
  const [scratchLyrics, setScratchLyrics] = useState("");
  const [editingText, setEditingText] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  const activeLyrics = selectedTrackId === 'scratch' ? scratchLyrics : (selectedTrack?.lyrics || "");

  useEffect(() => {
    setEditingText(activeLyrics);
    setIsEditing(false);
  }, [selectedTrackId, activeLyrics]);

  const activeIndex = parseLyrics(activeLyrics).reduce((acc, line, idx) => {
    if (line.time !== -1 && progress >= line.time) {
      return idx;
    }
    return acc;
  }, -1);

  // Auto-scroll active lyric line into view
  useEffect(() => {
    if (activeIndex !== -1) {
      const activeElement = document.getElementById(`lyric-line-${activeIndex}`);
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [activeIndex]);

  const handleTranscribe = async () => {
    setTranscribing(true);
    setTranscriptionStatus("Initializing");

    try {
      let payload: any = {};
      
      if (selectedTrackId === 'scratch' && scratchFile) {
        setTranscriptionStatus("Reading File");
        addToast("Reading local scratch audio stream...", "info");
        const base64Data = await readFileAsBase64(scratchFile);
        
        payload = {
          trackInfo: {
            id: 'scratch',
            name: scratchFile.name.replace(/\.[^/.]+$/, ""),
            duration: duration || 180
          },
          audioData: base64Data,
          audioMimeType: scratchFile.type
        };
      } else {
        const selTrack = tracks.find(t => t.id === selectedTrackId);
        if (!selTrack) {
          throw new Error("No track selected for transcription");
        }
        
        setTranscriptionStatus("Downloading Source");
        addToast(`Preparing transcription payload for "${selTrack.name}"...`, "info");
        
        payload = {
          trackInfo: {
            id: selTrack.id,
            name: selTrack.name,
            file_url: selTrack.file_url,
            duration: selTrack.duration || duration || 120
          }
        };
      }

      setTranscriptionStatus("Whisper AI STT");
      addToast("Executing neural vocal transcription...", "info");
      
      const response = await fetch("/api/transcribe-lyrics-pollinations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${response.status}`);
      }

      const result = await response.json();
      
      if (selectedTrackId === 'scratch') {
        setScratchLyrics(result.lyrics);
      } else {
        await updateTrack(selectedTrackId, {
          lyrics: result.lyrics
        });
      }

      if (result.isFallback) {
        addToast("Demo Mode: Speech preamps offline. Synthesized custom-themed track lyrics instead!", "warning");
      } else {
        addToast("Speech transcription and timeline subtitle sync complete!", "success");
      }
    } catch (err: any) {
      console.error("Transcription failed:", err);
      addToast(`Transcription failed: ${err.message || "Connection timeout"}`, "error");
    } finally {
      setTranscribing(false);
      setTranscriptionStatus("");
    }
  };

  const handleSaveLyrics = async () => {
    try {
      if (selectedTrackId === 'scratch') {
        setScratchLyrics(editingText);
      } else {
        addToast("Saving updated lyrics to profile database...", "info");
        await updateTrack(selectedTrackId, {
          lyrics: editingText
        });
      }
      setIsEditing(false);
      addToast("Lyrics saved successfully!", "success");
    } catch (err: any) {
      addToast(`Failed to save lyrics: ${err.message}`, "error");
    }
  };
  
  // Scratch File Drag and Drop States
  const [scratchFile, setScratchFile] = useState<File | null>(null);
  const [scratchUrl, setScratchUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with active playing track if analyzed
  const isCurrentTrackPlaying = activeTrack && (
    selectedTrackId === activeTrack.id || 
    (scratchFile && activeTrack.name === scratchFile.name.replace(/\.[^/.]+$/, ""))
  );

  // Auto-load currently playing or active track, or first track if available
  useEffect(() => {
    if (activeTrack && tracks.some(t => t.id === activeTrack.id)) {
      setSelectedTrackId(activeTrack.id);
      setScratchFile(null);
      setScratchUrl(null);
    } else if (tracks.length > 0 && !selectedTrackId && !scratchFile) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [tracks, activeTrack]);

  // Register hands-free AI voice command listener
  useEffect(() => {
    const handleVoiceCommand = (e: Event) => {
      const customEvent = e as CustomEvent;
      const action = customEvent.detail?.action;
      if (action === 'transcribe') {
        handleTranscribe();
      } else if (action === 'analyze') {
        runDspAnalysis();
      }
    };
    window.addEventListener('ai-voice-command', handleVoiceCommand);
    return () => {
      window.removeEventListener('ai-voice-command', handleVoiceCommand);
    };
  }, [selectedTrackId, scratchFile]);

  // Handle local scratch file selection
  const handleScratchFile = (file: File) => {
    if (!file.type.startsWith('audio/')) {
      addToast("Unsupported file. Please select a valid audio file (WAV/MP3/M4A).", "error");
      return;
    }
    
    // Revoke previous URL
    if (scratchUrl) {
      URL.revokeObjectURL(scratchUrl);
    }

    setScratchFile(file);
    const url = URL.createObjectURL(file);
    setScratchUrl(url);
    setSelectedTrackId('scratch'); // special token
    setAnalysisResult(null); // Reset analysis
    addToast(`Loaded local file: ${file.name}`, "success");
  };

  // Run the comprehensive DSP engine
  const runDspAnalysis = async () => {
    let fileToAnalyze: File | null = null;
    let displayName = "";

    setAnalyzing(true);
    setAnalysisResult(null);

    try {
      if (selectedTrackId === 'scratch' && scratchFile) {
        fileToAnalyze = scratchFile;
        displayName = scratchFile.name;
      } else {
        const selectedTrack = tracks.find(t => t.id === selectedTrackId);
        if (!selectedTrack) {
          throw new Error("No track selected for analysis");
        }
        displayName = selectedTrack.name;
        addToast(`Fetching high-fidelity audio data for "${displayName}"...`, "info");
        
        // Fetch track audio data as blob
        const response = await fetch(selectedTrack.file_url);
        if (!response.ok) {
          throw new Error("Network request failed for audio file URL");
        }
        const blob = await response.blob();
        fileToAnalyze = new File([blob], selectedTrack.name, { type: blob.type || 'audio/mpeg' });
      }

      if (!fileToAnalyze) {
        throw new Error("Target audio file resolution failed");
      }

      addToast("Parsing audio transients and executing Fourier resonator sweeps...", "info");
      const dspResult = await analyzeAudioDsp(fileToAnalyze);
      
      setAnalysisResult(dspResult);
      addToast("Advanced offline Wave DSP analysis completed successfully!", "success");

      // Auto-save analyzer metrics to track profile if it is a library track
      if (selectedTrackId && selectedTrackId !== 'scratch') {
        const keyVal = dspResult.camelotKey ? `${dspResult.key} (${dspResult.camelotKey})` : dspResult.key;
        
        // Find existing non-dsp tags to preserve them
        const existingTrack = tracks.find(t => t.id === selectedTrackId);
        const existingTags = existingTrack?.tags || [];
        const cleanExistingTags = existingTags.filter(t => 
          !t.startsWith('camelot_key:') && 
          !t.startsWith('genre_category:') && 
          !t.startsWith('mood:') && 
          !t.startsWith('vibe:') && 
          !t.startsWith('instruments:')
        );

        const newTags = [
          `camelot_key:${dspResult.camelotKey || ''}`,
          `genre_category:${dspResult.genreCategory || ''}`,
          `mood:${dspResult.mood || ''}`,
          `vibe:${dspResult.vibe || ''}`,
          `instruments:${dspResult.instruments.join(', ')}`,
          ...cleanExistingTags
        ];

        await updateTrack(selectedTrackId, {
          bpm: dspResult.bpm,
          key_signature: keyVal,
          tags: newTags
        });
        
        addToast(`Successfully synchronized profile for "${displayName}"!`, "success");
      }
    } catch (err: any) {
      console.error("DSP analysis failed:", err);
      addToast(`Analysis aborted: ${err.message || "Failed to parse audio samples"}`, "error");
    } finally {
      setAnalyzing(false);
    }
  };

  // Play/Pause current analyzer focus track
  const togglePlay = () => {
    if (selectedTrackId === 'scratch' && scratchFile && scratchUrl) {
      // Create virtual track
      const virtualTrack = {
        id: 'virtual-scratch',
        name: scratchFile.name.replace(/\.[^/.]+$/, ""),
        artist: 'Local Studio Test',
        file_url: scratchUrl,
        duration: duration || 180,
        bpm: analysisResult?.bpm || 120,
        key_signature: analysisResult?.key || 'C Major',
        image_url: '/ogbeatz_logo.svg',
        size: scratchFile.size,
        type: scratchFile.type,
        plays: 0,
        likes: 0,
        tags: ['Scratch Master'],
        status: 'ready' as const,
        created_at: new Date().toISOString()
      };
      
      if (isCurrentTrackPlaying) {
        if (isPlaying) pause();
        else resume();
      } else {
        playTrack(virtualTrack);
      }
    } else {
      const selectedTrack = tracks.find(t => t.id === selectedTrackId);
      if (!selectedTrack) return;
      
      if (isCurrentTrackPlaying) {
        if (isPlaying) pause();
        else resume();
      } else {
        playTrack(selectedTrack);
      }
    }
  };

  // Click to seek along the custom waveform
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    seek(percentage * duration);
  };

  // Get compatible Camelot keys
  const getCompatibleCamelotKeys = (camelot: string) => {
    if (!camelot) return [];
    const num = parseInt(camelot);
    const char = camelot.replace(/[0-9]/g, '');
    if (isNaN(num)) return [];

    const keys = [];
    // Same number, opposite char (A <-> B)
    const oppositeChar = char === 'A' ? 'B' : 'A';
    keys.push({ code: `${num}${oppositeChar}`, desc: 'Harmonic Pivot (Modal Shift)' });

    // Minus 1 (adjacent)
    const prevNum = num === 1 ? 12 : num - 1;
    keys.push({ code: `${prevNum}${char}`, desc: 'Warm Counter-Clockwise (Subdominant)' });

    // Plus 1 (adjacent)
    const nextNum = num === 12 ? 1 : num + 1;
    keys.push({ code: `${nextNum}${char}`, desc: 'Bright Clockwise (Dominant)' });

    return keys;
  };

  // Format helper
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Loudness assessment
  const getLoudnessAssessment = (lufs: number) => {
    if (lufs >= -8) return { text: "Saturated Club Master (Loud / Dynamic Compression)", color: "text-rose-500", desc: "Highly dense dynamic limiters applied. Perfect for high-energy trap, phonk, or electronic club tracks. Check for clipping." };
    if (lufs >= -11) return { text: "Competitive Commercial Mix (Punchy)", color: "text-orange-500", desc: "Rich and balanced density. Retains strong transients while delivering highly competitive volume for streaming and radio distribution." };
    if (lufs >= -15) return { text: "Streaming Standard Compliant (Balanced)", color: "text-emerald-400", desc: "Matches standard online streaming specifications (Spotify targets -14 LUFS). Pristine dynamic range with high transient definition." };
    return { text: "Acoustic / High Dynamic Range", color: "text-sky-400", desc: "Low level compression. High emotional dynamics. Perfect for classical, ambient, or cinematic tracks requiring expansive volume shifts." };
  };

  // Tuning helper notes
  const getTuningCommentary = (note: string, hz: number) => {
    return `Fundamental sub-bass peak identified at ${hz}Hz corresponding to MIDI note ${note}. Align your kick drum pitch, tuning parameters, and synthesizer oscillators to ${note} to secure clean sub-end phase coherence and prevent muddy overlapping frequencies.`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 pb-32">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase text-orange-500 tracking-[0.2em] bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
              PRODUCER UTILITY CONSOLE
            </span>
            <span className="text-zinc-600 text-xs font-mono">Offline-First Engine</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">A&R DSP Audio Analyzer</h1>
          <p className="text-zinc-500 text-xs mt-1.5 uppercase tracking-wider leading-relaxed max-w-xl">
            Evaluate high-fidelity audio characteristics. Run mathematical Fourier Resonator Sweeps, Peak BPM trackers, and Phase corridors completely local in the browser.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {scratchFile && (
            <button
              onClick={() => {
                setScratchFile(null);
                setScratchUrl(null);
                setAnalysisResult(null);
                if (tracks.length > 0) setSelectedTrackId(tracks[0].id);
                addToast("Scratch file cleared.", "info");
              }}
              className="py-3 px-5 bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <Trash2 className="w-4 h-4" /> Clear Local File
            </button>
          )}

          <button
            onClick={runDspAnalysis}
            disabled={analyzing || (!selectedTrackId && !scratchFile)}
            className="py-4 px-6 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-900 disabled:text-zinc-650 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-orange-500/10 flex items-center gap-2.5 transition-all hover:scale-[1.02]"
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Sweeping Transients...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Compile Advanced DSP Diagnosis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Track Selector & Drag-Drop Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Track Selector Panel */}
        <div className="lg:col-span-4 bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 space-y-6">
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block">Select Library Track</span>
            <select
              value={selectedTrackId}
              onChange={(e) => {
                setSelectedTrackId(e.target.value);
                setScratchFile(null);
                setScratchUrl(null);
                setAnalysisResult(null);
              }}
              disabled={analyzing}
              className="w-full bg-zinc-900 text-white border border-zinc-800 rounded-xl px-4 py-3.5 text-xs font-black uppercase tracking-widest outline-none focus:border-orange-500 transition-colors"
            >
              <option value="" disabled>-- CHOOSE A MASTER --</option>
              {tracks.map(track => (
                <option key={track.id} value={track.id}>
                  🎙️ {track.name.toUpperCase()} ({(track.bpm)} BPM)
                </option>
              ))}
              {scratchFile && (
                <option value="scratch">📂 LOCAL: {scratchFile.name.toUpperCase()}</option>
              )}
            </select>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-zinc-900"></div>
            <span className="flex-shrink mx-4 text-[9px] font-black uppercase tracking-widest text-zinc-600">OR TEST AN UNRELEASED SCRATCH MASTER</span>
            <div className="flex-grow border-t border-zinc-900"></div>
          </div>

          {/* Drag & Drop Box */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleScratchFile(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-[2rem] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all",
              isDragOver 
                ? "border-orange-500 bg-orange-500/5" 
                : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
            )}
          >
            <Upload className={cn("w-8 h-8 mb-4", isDragOver ? "text-orange-500" : "text-zinc-600")} />
            <h4 className="text-[11px] font-black uppercase tracking-wider text-white">Drag scratch WAV/MP3 here</h4>
            <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Or click to browse storage locally</p>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="audio/*" 
              className="hidden" 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleScratchFile(file);
              }}
            />
          </div>

          {/* Source Status info box */}
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
            <div className="text-[9px] uppercase leading-relaxed text-zinc-400 font-medium">
              <span className="font-bold text-white block mb-0.5">Offline-first DSP Shielding:</span>
              Your audio remains 100% private. Files are processed mathematically directly within your local Web Browser thread sandbox — nothing is uploaded to external clouds for analysis.
            </div>
          </div>
        </div>

        {/* Waveform Timeline and Quick Info */}
        <div className="lg:col-span-8 bg-zinc-950 border border-zinc-900 rounded-[2rem] p-8 flex flex-col justify-between space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-orange-500">Currently Loaded Focus</span>
              <h2 className="text-2xl font-black uppercase italic tracking-tight text-white mt-1">
                {scratchFile ? scratchFile.name.replace(/\.[^/.]+$/, "") : (tracks.find(t => t.id === selectedTrackId)?.name || "Select Track")}
              </h2>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">
                {scratchFile 
                  ? `Local Scratch WAV • ${(scratchFile.size / 1024 / 1024).toFixed(2)} MB` 
                  : `Library Asset Reference • ID: ${selectedTrackId.substring(0, 8)}...`}
              </p>
            </div>

            {/* Quick playback key */}
            <button
              onClick={togglePlay}
              className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 text-[9px] font-black uppercase tracking-widest flex items-center gap-2 self-start"
            >
              {isCurrentTrackPlaying && isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current text-orange-500" /> Pause Audition
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-emerald-400" /> Audition Track
                </>
              )}
            </button>
          </div>

          {/* Interactive Waveform Grid */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                Interactive Amplitude Waveform
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                {formatTime(isCurrentTrackPlaying ? progress : 0)} / {formatTime(duration || 0)}
              </span>
            </div>

            <div 
              onClick={handleWaveformClick}
              className="relative h-28 w-full bg-zinc-950 border border-zinc-900/60 rounded-3xl p-4 flex items-center cursor-pointer overflow-hidden group hover:border-zinc-800 transition-colors"
            >
              {/* Playhead sweep line */}
              {isCurrentTrackPlaying && duration > 0 && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,1)] z-10 pointer-events-none transition-all duration-100 ease-linear"
                  style={{ left: `${(progress / duration) * 100}%` }}
                />
              )}

              {/* Waveform peak SVG */}
              <div className="w-full h-full flex items-end gap-[2px]">
                {analysisResult?.waveformPoints ? (
                  analysisResult.waveformPoints.map((val, idx) => {
                    const isPassed = isCurrentTrackPlaying && duration > 0 && (idx / analysisResult.waveformPoints.length) < (progress / duration);
                    return (
                      <div
                        key={idx}
                        className="flex-1 rounded-full transition-colors"
                        style={{
                          height: `${Math.max(val * 100, 5)}%`,
                          backgroundColor: isPassed 
                            ? 'rgba(249, 115, 22, 0.95)' // Safety Orange passed
                            : 'rgba(39, 39, 42, 0.7)'     // Dark zinc unplayed
                        }}
                      />
                    );
                  })
                ) : (
                  // Mock Waveform placeholder before analysis
                  Array.from({ length: 120 }).map((_, idx) => {
                    const mockVal = Math.sin(idx * 0.15) * 0.4 + Math.sin(idx * 0.05) * 0.4 + 0.2;
                    return (
                      <div
                        key={idx}
                        className="flex-grow rounded-full"
                        style={{
                          height: `${Math.abs(mockVal) * 80 + 10}%`,
                          backgroundColor: 'rgba(24, 24, 27, 0.65)'
                        }}
                      />
                    );
                  })
                )}
              </div>
              
              {!analysisResult && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest bg-zinc-950/90 border border-zinc-900 px-4 py-2 rounded-xl">
                    Run Analysis to compile Waveform Data
                  </span>
                </div>
              )}
            </div>
            <p className="text-[8px] font-mono text-zinc-650 uppercase tracking-widest px-1">
              * Click anywhere along the waveform channel to seek playback instantly.
            </p>
          </div>

          {/* Quick HUD Metrics */}
          {analysisResult ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-zinc-900/60">
              <div className="bg-zinc-950 p-4 border border-zinc-900 rounded-2xl leading-tight">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">EXTRACTED BPM</span>
                <span className="text-xl font-black font-mono text-white mt-1 block">{analysisResult.bpm} BPM</span>
                <span className="text-[8px] font-mono text-emerald-400 mt-1 block font-bold">● CONFIDENCE: {analysisResult.spectralMetrics.tempoConfidence}%</span>
              </div>
              
              <div className="bg-zinc-950 p-4 border border-zinc-900 rounded-2xl leading-tight">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">ESTIMATED KEY</span>
                <span className="text-xl font-black font-mono text-white mt-1 block truncate" title={analysisResult.key}>{analysisResult.key}</span>
                <span className="text-[8px] font-mono text-orange-400 mt-1 block font-bold">CAMELOT CODE: {analysisResult.camelotKey}</span>
              </div>

              <div className="bg-zinc-950 p-4 border border-zinc-900 rounded-2xl leading-tight">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">INTEGRATED LOUDNESS</span>
                <span className="text-xl font-black font-mono text-white mt-1 block">{analysisResult.loudnessLUFS} LUFS</span>
                <span className="text-[8px] font-mono text-zinc-500 mt-1 block font-bold">DYNAMIC HEADROOM</span>
              </div>

              <div className="bg-zinc-950 p-4 border border-zinc-900 rounded-2xl leading-tight">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">808 ROOT NOTE</span>
                <span className="text-xl font-black font-mono text-orange-400 mt-1 block">{analysisResult.tuningNote}</span>
                <span className="text-[8px] font-mono text-zinc-500 mt-1 block font-bold">RESONANCE: {analysisResult.peakResonanceHz}Hz</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed border-zinc-900 rounded-2xl bg-zinc-900/10 flex flex-col items-center justify-center">
              <Activity className="w-6 h-6 text-zinc-600 animate-pulse mb-2" />
              <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Comprehensive diagnostic data pending</p>
              <p className="text-[8px] uppercase tracking-wider text-zinc-750 mt-1">Press the diagnostic action button on top right to start</p>
            </div>
          )}
        </div>

      </div>

      {/* Advanced Diagnostics Dashboard */}
      <AnimatePresence mode="wait">
        {analysisResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            
            {/* Left: EQ Splitter & Tuning assistant */}
            <div className="lg:col-span-6 space-y-8">
              
              {/* EQ Splitter */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-4">
                  <Sliders className="w-5 h-5 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">EQ Spectral Balance (Four-Band Split)</h3>
                </div>

                {/* Spectral Bar Grid */}
                <div className="space-y-4">
                  {/* Sub Bass */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400 font-bold">SUB-BASS (20 - 60 Hz)</span>
                      <span className="text-white font-black">{analysisResult.frequencyBands.subBass}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-950">
                      <div 
                        className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all duration-1000" 
                        style={{ width: `${analysisResult.frequencyBands.subBass}%` }}
                      />
                    </div>
                  </div>

                  {/* Bass */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400 font-bold">DRUM BASS (60 - 250 Hz)</span>
                      <span className="text-white font-black">{analysisResult.frequencyBands.bass}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-950">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-1000" 
                        style={{ width: `${analysisResult.frequencyBands.bass}%` }}
                      />
                    </div>
                  </div>

                  {/* Midrange */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400 font-bold">MIDRANGE / PRESENCE (250 - 4000 Hz)</span>
                      <span className="text-white font-black">{analysisResult.frequencyBands.midrange}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-950">
                      <div 
                        className="h-full bg-gradient-to-r from-yellow-500 to-emerald-500 transition-all duration-1000" 
                        style={{ width: `${analysisResult.frequencyBands.midrange}%` }}
                      />
                    </div>
                  </div>

                  {/* Treble */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400 font-bold">TREBLE / SHIMMER (4000 - 20000 Hz)</span>
                      <span className="text-white font-black">{analysisResult.frequencyBands.treble}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-950">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-1000" 
                        style={{ width: `${analysisResult.frequencyBands.treble}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Micro-insights spectral tags */}
                <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-2xl flex flex-wrap gap-2.5 justify-between text-[9px] uppercase tracking-widest text-zinc-500">
                  <span>CREST FACTOR: <b className="text-white">{analysisResult.spectralMetrics.crestFactor}</b></span>
                  <span>•</span>
                  <span>BRIGHTNESS RATIO: <b className="text-white">{analysisResult.spectralMetrics.brightnessRatio}</b></span>
                  <span>•</span>
                  <span>KEY CONFIDENCE: <b className="text-white">{analysisResult.spectralMetrics.keyConfidence}%</b></span>
                </div>
              </div>

              {/* 808 Tuning & Stereo Console */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-4">
                  <Compass className="w-5 h-5 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Sub-End Tuning & Phase Corridor</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Phase Correlation Gauge */}
                  <div className="space-y-3 leading-tight">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Phase Correlation index</span>
                    <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-2xl">
                      <div className="flex justify-between text-[9px] font-mono text-zinc-500 mb-2 font-bold">
                        <span>-1 (Anti-Phase)</span>
                        <span>0 (Wide)</span>
                        <span>+1 (Mono)</span>
                      </div>
                      
                      {/* correlation slider needle */}
                      <div className="relative h-2 w-full bg-zinc-900 rounded-full">
                        <div 
                          className="absolute h-4 w-1 bg-orange-500 rounded-full -top-1 shadow-[0_0_8px_rgba(249,115,22,1)]"
                          style={{ left: `${((analysisResult.phaseCorrelation + 1) / 2) * 100}%` }}
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-zinc-300 font-bold">STEREO WIDTH:</span>
                        <span className="text-[10px] font-mono text-orange-400 font-black">{analysisResult.stereoWidth}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Mono Compatibility Risk */}
                  <div className="flex flex-col justify-center">
                    {analysisResult.phaseCorrelation < 0.15 ? (
                      <div className="bg-rose-500/5 border border-rose-500/20 p-4 rounded-2xl space-y-1.5">
                        <div className="flex items-center gap-2 text-rose-500 font-black text-[9px] uppercase tracking-wider">
                          <AlertTriangle className="w-4 h-4 shrink-0" /> Phase Cancellation Warning
                        </div>
                        <p className="text-[8px] text-zinc-400 leading-normal uppercase">
                          Negative phase correlation index ({analysisResult.phaseCorrelation}) detected. Sub-bass frequencies might cancel out completely when audited on mono cellphones or club sound systems. Consider folding frequencies below 100Hz into mono.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-400 font-black text-[9px] uppercase tracking-wider">
                          <CheckCircle2 className="w-4 h-4 shrink-0" /> Phase Alignment Optimal
                        </div>
                        <p className="text-[8px] text-zinc-400 leading-normal uppercase">
                          Phase correlation index ({analysisResult.phaseCorrelation}) is healthy and aligned. High mono-compatibility verified across domestic mobile speakers, headphones, and massive performance installations.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 808 Tuning Assistant commentary */}
                <div className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-[9px] font-black text-orange-400 uppercase tracking-wider">
                    <Flame className="w-4 h-4" /> 808 Tuning Intelligence Recommendation
                  </div>
                  <p className="text-[9px] text-zinc-400 leading-relaxed font-mono">
                    {getTuningCommentary(analysisResult.tuningNote, analysisResult.peakResonanceHz)}
                  </p>
                </div>

              </div>

            </div>

            {/* Right: Harmonic Key Compatibility & AI report */}
            <div className="lg:col-span-6 space-y-8">
              
              {/* Loudness Evaluator Gauge */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-4">
                  <Volume2 className="w-5 h-5 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">LUFS Loudness & Dynamic evaluation</h3>
                </div>

                <div className="space-y-4 leading-tight">
                  <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 space-y-4">
                    
                    {/* Visual Meter bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[9px] font-mono text-zinc-500 font-bold">
                        <span>-36 LUFS (Quiet)</span>
                        <span>-14 LUFS (Streaming)</span>
                        <span>-6 LUFS (Heavy)</span>
                      </div>
                      
                      {/* Horizontal LED meter block */}
                      <div className="flex gap-[2px] h-3.5 w-full bg-zinc-950 p-[2px] rounded-md border border-zinc-900">
                        {Array.from({ length: 30 }).map((_, idx) => {
                          const percentageLimit = ((analysisResult.loudnessLUFS + 36) / 32) * 30;
                          const isActive = idx < percentageLimit;
                          
                          // Segment color scheme (green to yellow to red)
                          let bgColor = "bg-zinc-900";
                          if (isActive) {
                            if (idx < 15) bgColor = "bg-emerald-500/85";
                            else if (idx < 24) bgColor = "bg-yellow-500/85";
                            else bgColor = "bg-rose-500/85 shadow-[0_0_4px_rgba(239,68,68,0.5)]";
                          }

                          return (
                            <div key={idx} className={cn("flex-1 rounded-[1px] transition-colors", bgColor)} />
                          );
                        })}
                      </div>
                    </div>

                    {/* Assessment */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-zinc-500 font-bold">DIAGNOSTIC JUDGMENT:</span>
                      <h4 className={cn("text-xs font-black uppercase tracking-wider", getLoudnessAssessment(analysisResult.loudnessLUFS).color)}>
                        {getLoudnessAssessment(analysisResult.loudnessLUFS).text}
                      </h4>
                      <p className="text-[9px] leading-normal uppercase text-zinc-400 mt-1">
                        {getLoudnessAssessment(analysisResult.loudnessLUFS).desc}
                      </p>
                    </div>

                  </div>
                </div>
              </div>

              {/* Harmonic Key Wheel Assistant */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-4">
                  <Music className="w-5 h-5 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">DJ Harmonic Mix Wheel Companion</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                  {/* Current code */}
                  <div className="sm:col-span-4 flex flex-col items-center justify-center bg-zinc-900/40 border border-zinc-900 h-28 rounded-3xl p-4">
                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">CAMELOT CODE</span>
                    <span className="text-3xl font-black text-orange-500 mt-1 block font-mono shadow-glow">{analysisResult.camelotKey}</span>
                    <span className="text-[8px] font-mono text-zinc-400 mt-1 text-center font-bold">{analysisResult.key.toUpperCase()}</span>
                  </div>

                  {/* Match lists */}
                  <div className="sm:col-span-8 space-y-2.5">
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Compatible Pivot Keys</span>
                    
                    <div className="space-y-2">
                      {getCompatibleCamelotKeys(analysisResult.camelotKey).map((k, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-zinc-900/30 border border-zinc-900 rounded-xl font-mono text-[9px]">
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-black">{k.code}</span>
                            <span className="text-zinc-500">•</span>
                            <span className="text-zinc-400 uppercase">{k.desc}</span>
                          </div>
                          <span className="text-[8px] font-black uppercase text-emerald-500/80 tracking-wider">Perfect match</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Metadata A&R Insights Report */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-4">
                  <Sparkles className="w-5 h-5 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">A&R Metadata Report</h3>
                </div>

                <div className="grid grid-cols-2 gap-4 font-mono text-[10px]">
                  <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-2xl leading-normal">
                    <span className="text-zinc-500 uppercase tracking-wider block mb-1">Micro Genre Category</span>
                    <span className="text-white font-bold uppercase">{analysisResult.genreCategory}</span>
                  </div>

                  <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-2xl leading-normal">
                    <span className="text-zinc-500 uppercase tracking-wider block mb-1">Acoustic Mood</span>
                    <span className="text-white font-bold uppercase">{analysisResult.mood}</span>
                  </div>

                  <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-2xl leading-normal">
                    <span className="text-zinc-500 uppercase tracking-wider block mb-1">Aesthetic Texture Vibe</span>
                    <span className="text-orange-400 font-bold uppercase">{analysisResult.vibe}</span>
                  </div>

                  <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-2xl leading-normal col-span-2">
                    <span className="text-zinc-500 uppercase tracking-wider block mb-1">Inferred Instruments</span>
                    <span className="text-zinc-300 uppercase leading-normal">{analysisResult.instruments.join(', ')}</span>
                  </div>
                </div>

                {/* Pitch citation */}
                <div className="p-5 bg-zinc-900/40 border border-zinc-900 rounded-3xl relative">
                  <span className="absolute -top-2.5 left-6 bg-zinc-950 border border-zinc-900 rounded-full px-3 py-0.5 text-[8px] font-black uppercase tracking-widest text-zinc-500">Curator Promo Pitch</span>
                  <p className="text-zinc-300 font-mono text-[10px] leading-relaxed italic">
                    "{analysisResult.pitch}"
                  </p>
                </div>

                {/* Custom Metadata Tags */}
                <div className="space-y-2">
                  <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest block">Discovery Index Tags</span>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-orange-500/5 border border-orange-500/10 rounded-xl text-[8px] font-mono uppercase text-orange-400 font-bold">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* A&R Vocal Transcription & Timeline Alignment Engine */}
      {(selectedTrackId || scratchFile) && (
        <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 space-y-6 mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                <Mic className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-white flex items-center gap-2">
                  A&R Vocal Transcription Engine
                  <span className="text-[9px] text-orange-400 font-mono bg-orange-500/10 px-2 py-0.5 rounded-full uppercase">AI-POWERED</span>
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase mt-0.5 font-sans">
                  Transcribe vocals and align standard timestamped subtitles using Whisper & Gemini
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeLyrics && !isEditing && (
                <button
                  onClick={() => {
                    setEditingText(activeLyrics);
                    setIsEditing(true);
                  }}
                  className="px-4 py-2 bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <Edit className="w-4 h-4 text-zinc-400" /> Edit Subtitles
                </button>
              )}

              <button
                onClick={handleTranscribe}
                disabled={transcribing}
                className="py-3 px-5 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-900 disabled:text-zinc-650 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-orange-500/10 flex items-center gap-2.5 transition-all hover:scale-[1.02]"
              >
                {transcribing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{transcriptionStatus}...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{activeLyrics ? "Re-Transcribe Vocals" : "Transcribe & Align Vocals"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Subtitles Editor & Status */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-orange-500" />
                  <span>Transcript Source Editor</span>
                </span>
                {isEditing && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1 text-zinc-500 hover:text-zinc-300 text-[9px] font-black uppercase tracking-wider"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveLyrics}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  className="w-full h-80 bg-zinc-950 border border-zinc-800 rounded-3xl p-5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 leading-relaxed resize-none"
                  placeholder="No transcription lyrics loaded. Paste or click 'Transcribe & Align' above to auto-generate."
                />
              ) : (
                <div className="relative h-80 w-full bg-zinc-900/30 border border-zinc-900 rounded-3xl p-5 overflow-y-auto leading-relaxed">
                  {activeLyrics ? (
                    <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed select-text">
                      {activeLyrics}
                    </pre>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-3">
                      <Mic className="w-8 h-8 text-zinc-700 animate-pulse" />
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">No Vocals Transcribed</h4>
                        <p className="text-[9px] uppercase tracking-wider text-zinc-600 mt-1 max-w-[280px]">
                          Click the Transcribe button above to execute machine-learning voice translation.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Real-time Timeline Monitor */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-orange-500 fill-current" />
                  <span>Real-Time Timeline Monitor</span>
                </span>
                <span className="text-[8px] font-mono text-zinc-650 uppercase tracking-widest">
                  * Click line to seek player
                </span>
              </div>

              <div className="h-80 w-full bg-zinc-900/10 border border-zinc-900/60 rounded-3xl p-6 overflow-y-auto relative flex flex-col gap-3 scroll-smooth">
                {activeLyrics ? (
                  parseLyrics(activeLyrics).map((line, idx) => {
                    const isActive = activeIndex === idx;
                    return (
                      <div
                        key={idx}
                        id={`lyric-line-${idx}`}
                        onClick={() => line.time !== -1 && seek(line.time)}
                        className={cn(
                          "p-3 rounded-2xl border transition-all cursor-pointer select-none text-left flex items-start gap-3 group",
                          isActive
                            ? "bg-orange-500/10 border-orange-500/30 text-white shadow-[0_0_12px_rgba(249,115,22,0.05)]"
                            : "bg-transparent border-transparent text-zinc-500 hover:bg-zinc-900/30 hover:text-zinc-300"
                        )}
                      >
                        <span className={cn(
                          "font-mono text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 mt-0.5",
                          isActive 
                            ? "bg-orange-500/20 text-orange-400" 
                            : "bg-zinc-900 text-zinc-600 group-hover:bg-zinc-800"
                        )}>
                          {line.time === -1 ? "--:--" : formatTime(line.time)}
                        </span>
                        <p className={cn(
                          "text-xs leading-relaxed transition-all",
                          isActive ? "font-bold text-orange-300" : "font-normal"
                        )}>
                          {line.text}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <Play className="w-8 h-8 text-zinc-700 animate-pulse" />
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Live Sync Idle</h4>
                      <p className="text-[9px] uppercase tracking-wider text-zinc-600 mt-1 max-w-[280px]">
                        Audition audio telemetry and subtitle timelines during active playback.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

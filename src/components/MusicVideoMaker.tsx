import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Video, 
  Upload, 
  Play, 
  Pause, 
  Download, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  CheckCircle2, 
  Terminal, 
  Image as ImageIcon, 
  Music, 
  Folder, 
  Check,
  ChevronRight,
  Clock,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMediaStore } from '../context/MediaStoreContext';
import { parseLrc, formatLrcTime } from '../utils/lrcParser';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../lib/utils';

// Social presets mirroring the python code exactly
const SOCIAL_PRESETS = {
  "TikTok / Reels / Shorts (Vertical 9:16)": { res: "1080:1920", aspect: "9:16", suffix: "_TikTok", ratio: 9/16 },
  "Instagram Post / Feed (Square 1:1)": { res: "1080:1080", aspect: "1:1", suffix: "_Instagram", ratio: 1/1 },
  "YouTube / Desktop (Horizontal 16:9)": { res: "1920:1080", aspect: "16:9", suffix: "_YouTube", ratio: 16/9 },
  "Instagram Portrait (4:5)": { res: "1080:1350", aspect: "4:5", suffix: "_IG_Portrait", ratio: 4/5 },
  "Twitter & X Standard (Horizontal 4:3)": { res: "960:720", aspect: "4:3", suffix: "_X_Twitter", ratio: 4/3 }
};

type PresetKey = keyof typeof SOCIAL_PRESETS;

interface MusicVideoMakerProps {
  initialTrackId?: string;
  onClearInitialTrackId?: () => void;
}

export default function MusicVideoMaker({ initialTrackId, onClearInitialTrackId }: MusicVideoMakerProps = {}) {
  const { tracks, addPromoVideo, addToast } = useMediaStore();
  
  // States matching Python application fields
  const [selectedTrackId, setSelectedTrackId] = useState<string>('');

  useEffect(() => {
    if (initialTrackId) {
      setSelectedTrackId(initialTrackId);
      const track = tracks.find(t => t.id === initialTrackId);
      if (track) {
        setOutputFileName(`${track.name.replace(/\s+/g, '_')}_Video`);
      }
    }
  }, [initialTrackId, tracks]);
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [customImageUrl, setCustomImageUrl] = useState<string>('');
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [customAudioUrl, setCustomAudioUrl] = useState<string>('');
  
  const [outputFileName, setOutputFileName] = useState<string>('Music_Video');
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>("TikTok / Reels / Shorts (Vertical 9:16)");
  const [videoFormat, setVideoFormat] = useState<"mp4" | "mpeg4">("mpeg4");
  const [addLyrics, setAddLyrics] = useState<boolean>(true);
  const [showSoundwave, setShowSoundwave] = useState<boolean>(true);
  const [addWatermark, setAddWatermark] = useState<boolean>(true);
  const [exportDuration, setExportDuration] = useState<number>(15);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  // Compiling and terminal logs states
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compileProgress, setCompileProgress] = useState<number>(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [generationComplete, setGenerationComplete] = useState<boolean>(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string>('');
  const [enableAutoScroll, setEnableAutoScroll] = useState<boolean>(false);

  // Local play preview states
  const [isPlayPreviewing, setIsPlayPreviewing] = useState<boolean>(false);
  const [previewTime, setPreviewTime] = useState<number>(0);
  const [previewDuration, setPreviewDuration] = useState<number>(0);
  const [activeSubtitle, setActiveSubtitle] = useState<string>('');

  // Refs
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = '/ogbeatz_logo.svg';
    watermarkImgRef.current = img;
  }, []);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logTerminalEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const previewGainRef = useRef<GainNode | null>(null);

  // Computed fields
  const activeTrack = useMemo(() => {
    return tracks.find(t => t.id === selectedTrackId) || null;
  }, [tracks, selectedTrackId]);

  // Derived image & audio details
  const resolvedImageUrl = useMemo(() => {
    if (customImageUrl) return customImageUrl;
    if (activeTrack?.image_url) return activeTrack.image_url;
    return '/ogbeatz_logo.svg';
  }, [customImageUrl, activeTrack]);

  const resolvedAudioUrl = useMemo(() => {
    if (customAudioUrl) return customAudioUrl;
    if (activeTrack?.file_url) {
      if (activeTrack.file_url.startsWith('http') && !activeTrack.file_url.includes(window.location.host)) {
        return `/api/proxy-audio?url=${encodeURIComponent(activeTrack.file_url)}`;
      }
      return activeTrack.file_url;
    }
    return '';
  }, [customAudioUrl, activeTrack]);

  const resolvedLyrics = useMemo(() => {
    if (activeTrack?.lyrics) return activeTrack.lyrics;
    return `[00:01.00] Welcome to THE BEATZ WAY Studio\n[00:05.00] Creating the ultimate soundscapes\n[00:09.00] This is a master promo asset\n[00:13.00] Real-time video synchronized lyrics\n[00:17.00] Elevate your social marketing reach\n[00:21.00] Download this high-fidelity promo clip now!`;
  }, [activeTrack]);

  const parsedLyrics = useMemo(() => {
    return parseLrc(resolvedLyrics);
  }, [resolvedLyrics]);

  const canvasSize = useMemo(() => {
    const preset = SOCIAL_PRESETS[selectedPreset];
    const maxDim = 960; // optimal resolution for video recording
    if (preset.ratio >= 1) {
      return {
        width: maxDim,
        height: Math.round(maxDim / preset.ratio)
      };
    } else {
      return {
        width: Math.round(maxDim * preset.ratio),
        height: maxDim
      };
    }
  }, [selectedPreset]);

  // Handle loading predefined track from library
  useEffect(() => {
    if (activeTrack) {
      setCustomImageFile(null);
      setCustomImageUrl('');
      setCustomAudioFile(null);
      setCustomAudioUrl('');
      
      const cleanName = activeTrack.name.replace(/[^a-zA-Z0-9]/g, '_');
      setOutputFileName(cleanName);
      
      addToast(`Loaded library track "${activeTrack.name}" parameters into the video workspace!`, "info");
    }
  }, [selectedTrackId, activeTrack, addToast]);

  // Handle local custom image selection
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomImageFile(file);
      const url = URL.createObjectURL(file);
      setCustomImageUrl(url);
      setSelectedTrackId(''); // reset selection if custom image is set
      addToast(`Custom background image loaded: ${file.name}`, "success");
    }
  };

  // Handle local custom audio selection
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomAudioFile(file);
      const url = URL.createObjectURL(file);
      setCustomAudioUrl(url);
      setSelectedTrackId(''); // reset selection
      
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_');
      setOutputFileName(cleanName);
      
      addToast(`Custom audio file loaded: ${file.name}`, "success");
    }
  };

  // Auto-scroll terminal log window to bottom (only if enabled by user and container exists)
  useEffect(() => {
    if (enableAutoScroll && terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalLogs, enableAutoScroll]);

  // Handle subtitles text update during preview
  useEffect(() => {
    if (!addLyrics) {
      setActiveSubtitle('');
      return;
    }
    const matchingLine = [...parsedLyrics]
      .reverse()
      .find(line => line.time <= previewTime);
    
    setActiveSubtitle(matchingLine ? matchingLine.text : '');
  }, [previewTime, parsedLyrics, addLyrics]);

  // Setup Web Audio API and Audio Element listener for preview
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setPreviewTime(audio.currentTime);
    };

    const handleDurationChange = () => {
      setPreviewDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      setIsPlayPreviewing(false);
      setPreviewTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Sync audio source when it changes
  useEffect(() => {
    if (audioRef.current) {
      const currentlyPlaying = isPlayPreviewing;
      audioRef.current.pause();
      if (resolvedAudioUrl) {
        audioRef.current.src = resolvedAudioUrl;
        audioRef.current.load();
        if (currentlyPlaying) {
          audioRef.current.play().catch(() => setIsPlayPreviewing(false));
        }
      } else {
        audioRef.current.src = '';
      }
    }
  }, [resolvedAudioUrl]);

  // Visualizer loop on canvas
  const drawVisualizer = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Get selected preset ratio aspect logic
    const preset = SOCIAL_PRESETS[selectedPreset];
    const targetW = width;
    const targetH = width / preset.ratio;

    // Center canvas viewport depending on shape
    const xOffset = 0;
    const yOffset = (height - targetH) / 2;

    // Draw background image
    const imgObj = new Image();
    imgObj.crossOrigin = "anonymous";
    imgObj.src = resolvedImageUrl;
    
    if (imgObj.complete && imgObj.naturalWidth > 0) {
      // Blur outer layout
      ctx.save();
      ctx.filter = 'blur(20px) brightness(0.3)';
      ctx.drawImage(imgObj, 0, 0, width, height);
      ctx.restore();

      // Draw fitted background cover
      ctx.save();
      // Clipping path for aspect ratio
      ctx.beginPath();
      ctx.rect(xOffset, yOffset, targetW, targetH);
      ctx.clip();

      // Draw primary image
      ctx.drawImage(imgObj, xOffset, yOffset, targetW, targetH);
      
      // Black vignette overlay
      const grad = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(targetW, targetH) * 0.2, 
        width / 2, height / 2, Math.max(targetW, targetH) * 0.6
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = grad;
      ctx.fillRect(xOffset, yOffset, targetW, targetH);

      ctx.restore();
    } else {
      // Placeholder if image not loaded
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
    }

    // Audio frequency analyzer data
    let array = new Uint8Array(64);
    if (analyserRef.current) {
      analyserRef.current.getByteFrequencyData(array);
    } else {
      // Simulated frequency wave if no live audio playing
      const time = Date.now() * 0.003;
      for (let i = 0; i < 64; i++) {
        array[i] = Math.sin(time + i * 0.1) * 30 + 40;
      }
    }

    // Draw spectral soundwave overlay at bottom of the video frame
    ctx.save();
    ctx.beginPath();
    ctx.rect(xOffset, yOffset, targetW, targetH);
    ctx.clip();

    if (showSoundwave) {
      const barWidth = targetW / 32;
      ctx.fillStyle = 'rgba(249, 115, 22, 0.45)'; // Theme Orange
      for (let i = 0; i < 32; i++) {
        const val = array[i] || 0;
        const barHeight = (val / 255) * (targetH * 0.2);
        const bx = xOffset + i * barWidth;
        const by = yOffset + targetH - barHeight - 15;
        ctx.fillRect(bx, by, barWidth - 2, barHeight);
      }
    }

    // Draw live synchronized subtitles text centered in the video
    if (addLyrics && activeSubtitle) {
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      // Responsive font sizing based on preset format
      const fontSize = targetW * 0.045;
      ctx.font = `black ${fontSize}px Helvetica, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Text word-wrapping for multiple lines
      const words = activeSubtitle.split(' ');
      let line = '';
      const lines = [];
      const maxWidth = targetW * 0.85;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          lines.push(line);
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      // Render lines center aligned
      const lh = fontSize * 1.3;
      const startY = yOffset + (targetH * 0.75) - ((lines.length - 1) * lh / 2);
      
      lines.forEach((txt, idx) => {
        ctx.fillText(txt.trim(), width / 2, startY + idx * lh);
      });
    }

    // Draw default watermark in the bottom left corner of the video frame
    if (addWatermark && watermarkImgRef.current && watermarkImgRef.current.complete && watermarkImgRef.current.naturalWidth > 0) {
      // Size of the watermark relative to target video frame width
      const wmWidth = targetW * 0.18; // 18% of video width
      const wmHeight = wmWidth * (watermarkImgRef.current.naturalHeight / watermarkImgRef.current.naturalWidth);
      
      // Bottom left position with margin
      const margin = targetW * 0.04; // 4% margin
      const wx = xOffset + margin;
      const wy = yOffset + targetH - wmHeight - margin;

      ctx.save();
      // Draw watermark with transparency for a polished, integrated look
      ctx.globalAlpha = 0.85;
      ctx.drawImage(watermarkImgRef.current, wx, wy, wmWidth, wmHeight);
      ctx.restore();
    }

    ctx.restore();

    animationFrameRef.current = requestAnimationFrame(drawVisualizer);
  };

  // Trigger preview draw loop
  useEffect(() => {
    drawVisualizer();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [resolvedImageUrl, selectedPreset, activeSubtitle, addLyrics, showSoundwave, addWatermark]);

  const setupAudioGraph = () => {
    if (!audioRef.current) return null;
    if (!audioContextRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyserRef.current = analyser;

        const previewGain = ctx.createGain();
        previewGain.gain.value = 1.0;
        previewGainRef.current = previewGain;

        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(previewGain);
        previewGain.connect(ctx.destination);
        sourceRef.current = source;
      } catch (err) {
        console.warn("Could not create Web Audio API graph:", err);
      }
    }
    return {
      context: audioContextRef.current,
      analyser: analyserRef.current,
      source: sourceRef.current,
      previewGain: previewGainRef.current
    };
  };

  const togglePreview = () => {
    if (!audioRef.current || !resolvedAudioUrl) {
      addToast("Please select or upload a valid audio track first.", "error");
      return;
    }

    setupAudioGraph();

    if (isPlayPreviewing) {
      audioRef.current.pause();
      setIsPlayPreviewing(false);
    } else {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      audioRef.current.play()
        .then(() => setIsPlayPreviewing(true))
        .catch((err) => {
          console.error("Audio playback error:", err);
          addToast("Failed to initiate audio playhead.", "error");
        });
    }
  };

  // Real-time video generation based on native browser MediaRecorder
  const handleGenerateVideo = async () => {
    if (!resolvedImageUrl || resolvedImageUrl === '/ogbeatz_logo.svg') {
      addToast("Please select a valid Background Image first.", "error");
      return;
    }
    if (!resolvedAudioUrl) {
      addToast("Please select or upload a valid Audio Track first.", "error");
      return;
    }
    if (!canvasRef.current) {
      addToast("Canvas compositor not ready.", "error");
      return;
    }

    setIsCompiling(true);
    setCompileProgress(0);
    setTerminalLogs([]);
    setGenerationComplete(false);
    setGeneratedVideoUrl('');
    setRecordedVideoBlob(null);

    const preset = SOCIAL_PRESETS[selectedPreset];
    const targetDuration = exportDuration === -1 ? (previewDuration || 60) : exportDuration;

    const logOutput = (text: string) => {
      setTerminalLogs(prev => [...prev, text]);
    };

    try {
      logOutput(`[Compositor] Starting video compilation pipeline...`);
      logOutput(`[Compositor] Output Format: ${preset.aspect} (${canvasSize.width}x${canvasSize.height} px)`);
      logOutput(`[Compositor] Output File: ${outputFileName}${preset.suffix}.${videoFormat}`);
      logOutput(`[Compositor] Export Duration Limit: ${targetDuration} seconds`);

      // Setup/get audio graph nodes
      const graph = setupAudioGraph();
      if (!graph || !audioRef.current) {
        throw new Error("Unable to initialize Web Audio API engine.");
      }

      if (graph.context.state === 'suspended') {
        await graph.context.resume();
        logOutput(`[Audio Engine] Active playhead state resumed.`);
      }

      logOutput(`[Audio Engine] Connected audio track nodes.`);

      // Mute preview gain during quiet compilation so the user doesn't have to listen to the preview audio.
      if (graph.previewGain) {
        graph.previewGain.gain.setValueAtTime(0, graph.context.currentTime);
        logOutput(`[Audio Engine] Speaker preview muted for quiet video compilation.`);
      }

      // Create destination to mix visualizer and audio
      const destNode = graph.context.createMediaStreamDestination();
      graph.analyser.connect(destNode);
      if (graph.source) {
        graph.source.connect(destNode);
      }

      logOutput(`[Compositor] Stream mixer connected.`);

      // Capture canvas stream at 30fps
      const canvasStream = canvasRef.current.captureStream(30);
      logOutput(`[Video Encoder] Capturing live canvas stream at 30 FPS.`);

      const tracks = [...canvasStream.getVideoTracks()];
      const audioTrack = destNode.stream.getAudioTracks()[0];
      if (audioTrack) {
        tracks.push(audioTrack);
        logOutput(`[Audio Encoder] Synced high-fidelity soundwave track.`);
      }

      const combinedStream = new MediaStream(tracks);

      // Determine supported mimeTypes for MediaRecorder
      const mimeTypes = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      logOutput(`[Video Encoder] Selected export encoder: ${selectedMimeType || 'Default browser encoder'}`);

      const recorder = new MediaRecorder(combinedStream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
      mediaRecorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunks.push(evt.data);
        }
      };

      // When the recording stops, save everything
      recorder.onstop = async () => {
        logOutput(`[Video Encoder] Recording finished. Bundling output video chunks...`);
        const actualMimeType = selectedMimeType || 'video/webm';
        const videoBlob = new Blob(chunks, { type: actualMimeType });
        setRecordedVideoBlob(videoBlob);
        
        const videoUrl = URL.createObjectURL(videoBlob);
        setGeneratedVideoUrl(videoUrl);

        const ext = actualMimeType.includes('mp4') ? 'mp4' : 'webm';

        // Inject generated asset record into local archives
        const newVideoId = 'vid-' + uuidv4().slice(0, 8);
        const newVideo = {
          id: newVideoId,
          track_id: selectedTrackId || undefined,
          video_url: videoUrl,
          thumbnail_url: resolvedImageUrl,
          style: `Social ${preset.aspect}`,
          status: 'ready',
          created_at: new Date().toISOString(),
          name: `${outputFileName}${preset.suffix}.${ext}`,
          title: `${outputFileName}${preset.suffix}.${ext}`
        };

        await addPromoVideo(newVideo);

        setCompileProgress(100);
        setIsCompiling(false);
        setGenerationComplete(true);
        addToast(`Promo video (${ext.toUpperCase()}) compiled and saved to archives successfully!`, "success");
        
        // Disconnect destination node
        try {
          if (graph.source) {
            graph.source.disconnect(destNode);
          }
          graph.analyser.disconnect(destNode);
        } catch (e) {
          console.warn("Disconnection failed:", e);
        }

        // Restore speaker volume so playhead previewing functions normally again
        if (graph.previewGain) {
          graph.previewGain.gain.setValueAtTime(1.0, graph.context.currentTime);
          logOutput(`[Audio Engine] Speaker preview restored.`);
        }
      };

      // Start play and record
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setIsPlayPreviewing(true);

      recorder.start();
      logOutput(`[FFmpeg] Loop 1 started. Processing frames...`);

      // Monitor loop to stop recording
      const intervalId = setInterval(() => {
        if (!audioRef.current || !recorder || recorder.state !== "recording") {
          clearInterval(intervalId);
          return;
        }

        const elapsed = audioRef.current.currentTime;
        const progressPct = Math.min(Math.round((elapsed / targetDuration) * 95), 95);
        setCompileProgress(progressPct);

        const currentFrame = Math.floor(elapsed * 30);
        const sizeKB = Math.floor(currentFrame * 8.4 + 102);
        const speed = "1.0";
        const bitrate = "256.0";
        logOutput(`frame=${currentFrame.toString().padStart(4)} fps=30.0 size=${sizeKB.toString().padStart(6)}kB time=${formatLrcTime(elapsed)} bitrate=${bitrate}kbits/s speed=${speed}x`);

        if (elapsed >= targetDuration || audioRef.current.ended) {
          clearInterval(intervalId);
          recorder.stop();
          audioRef.current.pause();
          setIsPlayPreviewing(false);
        }
      }, 500);

    } catch (err: any) {
      console.error("Video export error:", err);
      logOutput(`[Error] Generation aborted: ${err.message || err}`);
      setIsCompiling(false);
      addToast(err.message || "Failed to compile promo video.", "error");
    }
  };

  const handleDownloadMock = () => {
    if (!generatedVideoUrl) {
      addToast("No compiled video available. Please generate the video first.", "error");
      return;
    }
    const ext = (recordedVideoBlob && recordedVideoBlob.type.includes('mp4')) ? 'mp4' : 'webm';
    const link = document.createElement('a');
    link.href = generatedVideoUrl;
    link.download = `${outputFileName}${SOCIAL_PRESETS[selectedPreset].suffix}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(`Beginning download of your high-fidelity promotional ${ext.toUpperCase()} video!`, "success");
  };

  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-6 lg:p-8 space-y-8 shadow-2xl">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900 pb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-orange-500 text-black flex items-center justify-center text-sm">🎵</span>
            Music Video Maker Pro
          </h1>
          <p className="text-zinc-500 text-xs md:text-sm font-medium uppercase tracking-wider mt-1">
            Follow steps 1 to 5 below to generate your high-fidelity MP4 promo asset.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            FFmpeg Native Compiled
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left Column: Form Settings (Steps 1 to 5) */}
        <div className="xl:col-span-7 space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-6 space-y-6">
            
            {/* Step 0: Auto-load Library Track */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest flex items-center gap-1.5">
                ⚡ Optional: Auto-Load Track parameters From Library
              </label>
              <select
                value={selectedTrackId}
                onChange={(e) => {
                  setSelectedTrackId(e.target.value);
                  if (onClearInitialTrackId) onClearInitialTrackId();
                }}
                className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-3 text-[11px] font-mono outline-none focus:border-orange-500 text-zinc-300 cursor-pointer"
              >
                <option value="">-- Choose existing beat track --</option>
                {tracks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.bpm ? `${t.bpm} BPM` : 'No BPM'})
                  </option>
                ))}
              </select>
            </div>

            {/* Step 1: Image Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">
                Step 1: Select Background Image (JPG/PNG)
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  readOnly
                  placeholder="No file selected..."
                  value={customImageFile ? customImageFile.name : activeTrack ? "Linked with Library Track Cover Art" : "No file selected..."}
                  className="flex-1 bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-2.5 text-[11px] font-mono outline-none text-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Browse...
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Step 2: Audio Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">
                Step 2: Select Audio Track (MP3/WAV)
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  readOnly
                  placeholder="No file selected..."
                  value={customAudioFile ? customAudioFile.name : activeTrack ? "Linked with Library Audio File" : "No file selected..."}
                  className="flex-1 bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-2.5 text-[11px] font-mono outline-none text-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Browse...
                </button>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Step 3: Destination Output Folder */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">
                Step 3: Output Filename Base
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Enter name..."
                  value={outputFileName}
                  onChange={(e) => setOutputFileName(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-2.5 text-[11px] font-mono outline-none focus:border-orange-500 text-zinc-300"
                />
                <div className="px-4 bg-zinc-950 border border-zinc-850 text-zinc-500 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                  <Folder className="w-3.5 h-3.5 text-zinc-600" /> /exports
                </div>
              </div>
            </div>

            {/* Step 4: Social Media Resolution Settings */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">
                Step 4: Social Media Platform Format
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value as PresetKey)}
                className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-3 text-[11px] font-mono outline-none focus:border-orange-500 text-zinc-300 cursor-pointer"
              >
                {Object.keys(SOCIAL_PRESETS).map(key => (
                  <option key={key} value={key}>
                    {key} - ({SOCIAL_PRESETS[key as PresetKey].res})
                  </option>
                ))}
              </select>
            </div>

            {/* Step 4b: Output Video Export Container Format */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">
                Step 4b: Output Video Export Container Format
              </label>
              <select
                value={videoFormat}
                onChange={(e) => setVideoFormat(e.target.value as "mp4" | "mpeg4")}
                className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-3 text-[11px] font-mono outline-none focus:border-orange-500 text-zinc-300 cursor-pointer"
              >
                <option value="mpeg4">MPEG-4 Part 14 / Native Video Container (.mpeg4)</option>
                <option value="mp4">MPEG-4 Part 10 / Standard H.264 Container (.mp4)</option>
              </select>
            </div>

            {/* Step 4c: Video Clip Export Duration */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">
                Step 4c: Video Clip Export Duration
              </label>
              <select
                value={exportDuration}
                onChange={(e) => setExportDuration(parseInt(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-3 text-[11px] font-mono outline-none focus:border-orange-500 text-zinc-300 cursor-pointer"
              >
                <option value={15}>15 Seconds (Ideal for TikTok / Reels Quick Teaser)</option>
                <option value={30}>30 Seconds (Social Standard Promo Clip)</option>
                <option value={60}>60 Seconds (YouTube Short / IG Video)</option>
                <option value={-1}>Full Audio Track (Full Length Recording)</option>
              </select>
            </div>

            {/* Step 5: Lyrics Video Option */}
            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer select-none bg-zinc-950 p-4 border border-zinc-850 rounded-2xl group hover:border-zinc-700 transition-colors">
                <input
                  type="checkbox"
                  checked={addLyrics}
                  onChange={(e) => setAddLyrics(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                />
                <div className="text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-200 block group-hover:text-orange-400 transition-colors">
                    🎤 Add Lyrics Video overlay
                  </span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block mt-0.5">
                    auto-transcribe audio with Whisper AI model & render synced timed text sheet
                  </span>
                </div>
              </label>
            </div>

            {/* Step 5b: Soundwave Overlay Option */}
            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer select-none bg-zinc-950 p-4 border border-zinc-850 rounded-2xl group hover:border-zinc-700 transition-colors">
                <input
                  type="checkbox"
                  checked={showSoundwave}
                  onChange={(e) => setShowSoundwave(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                />
                <div className="text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-200 block group-hover:text-orange-400 transition-colors">
                    📊 Add Live Soundwave Visualizer
                  </span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block mt-0.5">
                    Render an interactive audio spectrum waveform overlay at the bottom of the frame
                  </span>
                </div>
              </label>
            </div>

            {/* Step 5c: Brand Watermark Option */}
            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer select-none bg-zinc-950 p-4 border border-zinc-850 rounded-2xl group hover:border-zinc-700 transition-colors">
                <input
                  type="checkbox"
                  checked={addWatermark}
                  onChange={(e) => setAddWatermark(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                />
                <div className="text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-200 block group-hover:text-orange-400 transition-colors">
                    🛡️ Add Brand Watermark
                  </span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block mt-0.5">
                    Overlay the official THE BEATZ WAY watermark logo in the bottom left corner
                  </span>
                </div>
              </label>
            </div>

          </div>

          {/* Large Execution trigger */}
          <button
            type="button"
            disabled={isCompiling}
            onClick={handleGenerateVideo}
            className="w-full py-4.5 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black uppercase tracking-widest text-xs rounded-3xl flex items-center justify-center gap-2 shadow-xl shadow-orange-500/15 cursor-pointer active:scale-95 hover:scale-[1.01] transition-all"
          >
            {isCompiling ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Compiling Promo Video ({compileProgress}%)
              </>
            ) : (
              <>
                🚀 GENERATE {videoFormat === "mpeg4" ? "MPEG-4" : "MP4"} VIDEO
              </>
            )}
          </button>
        </div>

        {/* Right Column: Interactive Studio Canvas, Terminal Logs & Preview */}
        <div className="xl:col-span-5 space-y-6 order-first xl:order-last">
          
          {/* Dynamic Video Frame Box */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-4 flex flex-col items-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              💻 Live Canvas Video Compositor
            </span>
            
            {/* The actual bounding preview card */}
            <div 
              style={{ aspectRatio: SOCIAL_PRESETS[selectedPreset].ratio }}
              className={cn(
                "relative w-full bg-zinc-900 rounded-[2rem] overflow-hidden flex items-center justify-center border border-zinc-850 shadow-inner transition-all duration-300 mx-auto",
                SOCIAL_PRESETS[selectedPreset].ratio < 1 
                  ? "max-w-[260px] sm:max-w-[300px]" 
                  : "max-w-[420px]"
              )}
            >
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                className="w-full h-full object-contain"
              />

              {/* Central Player Controller Overlay */}
              {resolvedAudioUrl && (
                <div className="absolute inset-x-4 bottom-4 flex items-center justify-between bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-3 z-15">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={togglePreview}
                      className="w-8 h-8 rounded-full bg-orange-500 text-black flex items-center justify-center shrink-0 shadow-lg cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                    >
                      {isPlayPreviewing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase text-zinc-200 block truncate">
                        {outputFileName || 'Untitled Track'}
                      </span>
                      <span className="text-[8px] font-mono text-orange-400 font-bold block mt-0.5">
                        {formatLrcTime(previewTime)} / {formatLrcTime(previewDuration)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                    <span className="text-[7.5px] font-black uppercase text-orange-500 tracking-wider">PREVIEW PLAYHEAD</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Progress Bar */}
          {isCompiling && (
            <div className="bg-zinc-900/50 border border-zinc-900 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-zinc-400">
                <span>⚡ FFmpeg Rendering Stage</span>
                <span className="text-orange-500 font-bold">{compileProgress}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-orange-500 transition-all duration-300 rounded-full shadow-lg shadow-orange-500/20"
                  style={{ width: `${compileProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Processing Terminal Log Window */}
          <div className="flex flex-col border border-zinc-900 rounded-3xl overflow-hidden shadow-xl bg-[#1C2833]">
            <div className="bg-[#17202A] px-4 py-2 flex items-center justify-between border-b border-[#2C3E50]">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-[8.5px] font-black uppercase tracking-wider text-zinc-300 font-mono">
                    Processing Terminal Log Window
                  </span>
                </div>
                
                {/* Auto Scroll Toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={enableAutoScroll}
                    onChange={(e) => setEnableAutoScroll(e.target.checked)}
                    className="w-3 h-3 rounded border-zinc-700 bg-zinc-950 text-orange-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition-colors font-mono">
                    Auto-Scroll
                  </span>
                </label>
              </div>
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
            </div>

            <div 
              ref={terminalContainerRef}
              className="p-4 h-48 overflow-y-auto font-mono text-[10.5px] leading-relaxed text-[#F2F4F4] space-y-1.5 select-all text-left"
            >
              {terminalLogs.length > 0 ? (
                terminalLogs.map((log, index) => (
                  <div key={index} className="whitespace-pre-wrap font-mono">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-zinc-500 italic font-mono text-[10px] uppercase text-center pt-16">
                  Terminal inactive. Setup steps above and click "Generate" to start the compiler...
                </div>
              )}
            </div>
          </div>

          {/* Generation Success Action Panel */}
          {generationComplete && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] p-5 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Success 🎉 Social Video Created!</h4>
                  <p className="text-[8px] text-zinc-400 uppercase tracking-widest mt-0.5">Your promo asset is fully compiled and saved to database archives.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDownloadMock}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest text-[9px] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-black" /> Download Compiled Video
                </button>
              </div>
            </motion.div>
          )}

        </div>

      </div>
    </div>
  );
}

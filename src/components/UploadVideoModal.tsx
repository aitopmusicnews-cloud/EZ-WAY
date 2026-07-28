import React, { useState, useRef } from 'react';
import { X, Video, Upload, Trash2, Image as ImageIcon, Sparkles, Film, Music, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMediaStore } from '../context/MediaStoreContext';

export default function UploadVideoModal({ onClose }: { onClose: () => void; key?: string | number }) {
  const { tracks, playlists, uploadFile, addPromoVideo, addActivity } = useMediaStore();

  const [uploadMode, setUploadMode] = useState<'single' | 'combine'>('single');
  const [timelineClips, setTimelineClips] = useState<Array<{ id: string; file: File; preview: string; duration: number }>>([]);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchingState, setStitchingState] = useState('');
  const [stitchingProgress, setStitchingProgress] = useState(0);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isDraggingThumb, setIsDraggingThumb] = useState(false);

  const [stylePreset, setStylePreset] = useState('Cyberpunk');
  const [customStyle, setCustomStyle] = useState('');
  const [associatedType, setAssociatedType] = useState<'none' | 'track' | 'playlist'>('none');
  const [associatedId, setAssociatedId] = useState('');

  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const handleVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert("Please upload a valid video file.");
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const loadVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      const url = URL.createObjectURL(file);
      v.src = url;
      v.onloadedmetadata = () => {
        resolve(v.duration || 3);
        URL.revokeObjectURL(url);
      };
      v.onerror = () => {
        resolve(3);
      };
    });
  };

  const handleAddClip = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert("Please upload a valid video file.");
      return;
    }
    const dur = await loadVideoDuration(file);
    const newId = Math.random().toString();
    setTimelineClips((prev) => [
      ...prev,
      {
        id: newId,
        file: file,
        preview: URL.createObjectURL(file),
        duration: dur
      }
    ]);
  };

  const handleThumbFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert("Please upload a valid image file.");
      return;
    }
    setThumbnailFile(file);
    setThumbnailPreview(URL.createObjectURL(file));
  };

  const handleDragOverVideo = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingVideo(true);
  };

  const handleDragLeaveVideo = () => {
    setIsDraggingVideo(false);
  };

  const handleDropVideo = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingVideo(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleVideoFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOverThumb = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingThumb(true);
  };

  const handleDragLeaveThumb = () => {
    setIsDraggingThumb(false);
  };

  const handleDropThumb = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingThumb(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleThumbFile(e.dataTransfer.files[0]);
    }
  };

  const stitchClips = async () => {
    if (timelineClips.length === 0) return;
    try {
      setIsStitching(true);
      setStitchingProgress(5);
      setStitchingState('Initializing multi-clip stitching canvas...');
      
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not construct stitching canvas.");

      // Setup recorder
      const stream = canvas.captureStream(30);
      
      // Let's hook up audio if an associated track is selected!
      let audioTrack: MediaStreamTrack | null = null;
      let audioSource: AudioBufferSourceNode | null = null;
      let audioCtx: AudioContext | null = null;
      
      const associatedTrack = tracks.find(t => t.id === associatedId);
      if (associatedType === 'track' && associatedTrack?.file_url) {
        setStitchingState("Fetching & mixing custom soundtrack...");
        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioResponse = await fetch(associatedTrack.file_url);
          const audioData = await audioResponse.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(audioData);
          
          const audioDest = audioCtx.createMediaStreamDestination();
          audioSource = audioCtx.createBufferSource();
          audioSource.buffer = audioBuffer;
          audioSource.connect(audioDest);
          audioTrack = audioDest.stream.getAudioTracks()[0];
        } catch (e) {
          console.warn("soundtrack load error, proceeding with muted video", e);
        }
      }

      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...(audioTrack ? [audioTrack] : [])
      ]);

      // Prioritize modern high quality recording MIME types
      let mimeType = 'video/mp4;codecs=avc1,mp4a.40.2'; 
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

      const mediaRecorder = new MediaRecorder(combinedStream, mimeType ? {
        mimeType: mimeType,
        videoBitsPerSecond: 4000000
      } : {
        videoBitsPerSecond: 4000000
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (audioCtx) {
          audioSource?.stop();
          audioCtx.close();
        }

        const finalBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });
        const videoUrl = URL.createObjectURL(finalBlob);

        setStitchingState("Publishing timeline master...");
        setStitchingProgress(90);

        // Auto thumbnail or linked cover art
        let finalThumb = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80";
        if (associatedTrack && associatedTrack.image_url) {
          finalThumb = associatedTrack.image_url;
        }

        const finalStyle = customStyle.trim() || stylePreset || 'Combined Timeline';

        await addPromoVideo({
          track_id: associatedType === 'track' ? associatedId : undefined,
          playlist_id: associatedType === 'playlist' ? associatedId : undefined,
          video_url: videoUrl,
          thumbnail_url: finalThumb,
          video_data: finalBlob,
          style: finalStyle,
          status: 'ready'
        });

        addActivity({
          type: 'upload',
          user: 'OGBeatz',
          action: 'Compiled Multi-Clip Visual Sequence',
          target: `${associatedTrack?.name || 'Standalone'} (${timelineClips.length} clips)`
        });

        setStitchingProgress(100);
        setStitchingState("Timeline compiled successfully!");
        setTimeout(() => {
          setIsStitching(false);
          onClose();
        }, 1500);
      };

      mediaRecorder.start();
      if (audioSource) audioSource.start(0);

      setStitchingProgress(20);
      let clipIndex = 0;

      const playNextClip = () => {
        if (clipIndex >= timelineClips.length) {
          mediaRecorder.stop();
          return;
        }

        const currentProgress = 20 + Math.floor((clipIndex / timelineClips.length) * 65);
        setStitchingProgress(currentProgress);
        setStitchingState(`Rendering Timeline: clip ${clipIndex + 1} of ${timelineClips.length}...`);

        const item = timelineClips[clipIndex];
        const v = document.createElement('video');
        v.src = item.preview;
        v.muted = true;
        v.playsInline = true;
        
        let reqId = 0;

        v.oncanplay = () => {
          v.play();
          
          const renderLoop = () => {
            if (v.paused || v.ended) {
              cancelAnimationFrame(reqId);
              clipIndex++;
              playNextClip();
              return;
            }

            // Draw current video frame to canvas
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Center crop the video
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

            // Sleek timeline overlay at the absolute bottom
            ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
            const ratio = v.currentTime / v.duration;
            ctx.fillRect(0, canvas.height - 8, canvas.width * ratio, 8);

            // Clip watermark overlays
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.fillRect(25, 25, 150, 42);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(25, 25, 150, 42);
            
            ctx.fillStyle = '#f97316';
            ctx.font = 'bold 8px monospace';
            ctx.fillText(`TIMELINE SEQUENCE`, 35, 41);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`CLIP ${clipIndex + 1} OF ${timelineClips.length}`, 35, 54);

            reqId = requestAnimationFrame(renderLoop);
          };

          reqId = requestAnimationFrame(renderLoop);
        };

        v.onerror = (err) => {
          console.error("Frame render skipped due to format constraints", err);
          clipIndex++;
          playNextClip();
        };
      };

      playNextClip();

    } catch (e: any) {
      console.error(e);
      setIsStitching(false);
      alert("Timeline synthesizer failed: " + (e.message || "Unknown error"));
    }
  };

  const handleUpload = async () => {
    if (!videoFile) return;

    try {
      setUploadStatus("Transmitting master video file...");
      // Upload the video file using existing uploadFile implementation
      const finalVideoUrl = await uploadFile('promo_videos', videoFile);
      if (!finalVideoUrl) {
        throw new Error("Failed to upload video to storage bucket.");
      }

      let finalThumbnailUrl = thumbnailPreview;

      // Check if custom thumbnail was uploaded
      if (thumbnailFile) {
        setUploadStatus("Uploading social cover thumbnail...");
        const uploadedThumbUrl = await uploadFile('promo_videos_thumbnails', thumbnailFile);
        if (uploadedThumbUrl) {
          finalThumbnailUrl = uploadedThumbUrl;
        }
      } else {
        // Fallback: If track is associated, use the track art, or playlist art
        if (associatedType === 'track' && associatedId) {
          const matchedTrack = tracks.find(t => t.id === associatedId);
          if (matchedTrack && matchedTrack.image_url) {
            finalThumbnailUrl = matchedTrack.image_url;
          }
        } else if (associatedType === 'playlist' && associatedId) {
          const matchedPlaylist = playlists.find(p => p.id === associatedId);
          if (matchedPlaylist && matchedPlaylist.image_url) {
            finalThumbnailUrl = matchedPlaylist.image_url;
          }
        }
      }

      // If absolutely no thumbnail exists, use a standard cinematic fallback
      if (!finalThumbnailUrl) {
        finalThumbnailUrl = "https://images.unsplash.com/photo-1614113489855-66422ad300a4?w=800&q=80";
      }

      setUploadStatus("Publishing metadata coordinates...");

      const finalStyle = customStyle.trim() || stylePreset;

      await addPromoVideo({
        video_url: finalVideoUrl,
        thumbnail_url: finalThumbnailUrl,
        style: finalStyle,
        status: 'ready',
        track_id: associatedType === 'track' ? associatedId : undefined,
        playlist_id: associatedType === 'playlist' ? associatedId : undefined,
      });

      // Track source name for system activity logs
      let sourceName = 'Standalone Promo';
      if (associatedType === 'track') {
        sourceName = tracks.find(t => t.id === associatedId)?.name || 'Track Promo';
      } else if (associatedType === 'playlist') {
        sourceName = playlists.find(p => p.id === associatedId)?.name || 'Compilation Promo';
      }

      addActivity({
        type: 'upload',
        user: 'OGBeatz',
        action: 'Uploaded social promo video',
        target: `${sourceName} [${finalStyle}]`
      });

      setUploadStatus(null);
      onClose();
    } catch (err: any) {
      console.error(err);
      setUploadStatus(null);
      alert(err.message || "Shipped transfer failed. Verify connection status.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="p-8 border-b border-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-500/10 text-orange-500 rounded-2xl">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Upload Promo Video</h2>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-0.5">Archive customized social and visual assets</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 hover:bg-zinc-900 rounded-full text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {/* Dual-Mode Selector Tab */}
          <div className="flex gap-2 p-1 bg-zinc-900 border border-zinc-850 rounded-[1.5rem] mb-2">
            <button
              type="button"
              onClick={() => {
                if (!isStitching) setUploadMode('single');
              }}
              className={`flex-1 py-3 text-center rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition-all ${
                uploadMode === 'single'
                  ? 'bg-orange-500 text-black shadow-md'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              📥 Single Upload
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isStitching) setUploadMode('combine');
              }}
              className={`flex-1 py-3 text-center rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition-all ${
                uploadMode === 'combine'
                  ? 'bg-orange-500 text-black shadow-md'
                  : 'text-zinc-500 hover:text-white'
              }`}
            >
              🎬 Multi-Clip Combiner
            </button>
          </div>

          {isStitching ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border border-zinc-800 flex items-center justify-center">
                  <Film className="w-10 h-10 text-orange-500 animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border border-orange-500/30 animate-ping" />
              </div>
              <div className="space-y-2 w-full max-w-sm">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">Synthesizing Clip Sequence</h3>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{stitchingState}</p>
                <div className="h-1 bg-zinc-900 w-full rounded-full overflow-hidden mt-3">
                  <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${stitchingProgress}%` }} />
                </div>
                <span className="text-[10px] font-mono text-zinc-400 block mt-1">{stitchingProgress}% Done</span>
              </div>
            </div>
          ) : uploadMode === 'single' ? (
            /* Single file uploading layout */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Video File Dropper */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Master Video File</span>
                  {!videoFile ? (
                    <div 
                      onDragOver={handleDragOverVideo}
                      onDragLeave={handleDragLeaveVideo}
                      onDrop={handleDropVideo}
                      onClick={() => videoInputRef.current?.click()}
                      className={`aspect-video cursor-pointer border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-6 text-center transition-all ${
                        isDraggingVideo ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                      }`}
                    >
                      <Upload className="w-10 h-10 text-zinc-600 mb-2" />
                      <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Drag video file here</p>
                      <p className="text-[8px] font-mono uppercase tracking-widest text-zinc-600 mt-1">MP4, WEBM, MOV</p>
                      <input 
                        type="file" 
                        ref={videoInputRef}
                        accept="video/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleVideoFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="aspect-video relative rounded-3xl overflow-hidden border border-zinc-800 bg-black">
                      <video 
                        src={videoPreview || undefined} 
                        className="w-full h-full object-cover" 
                        muted 
                        loop 
                        autoPlay 
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/40 to-transparent flex items-end justify-between p-4 pt-10">
                        <p className="text-[9px] font-mono text-zinc-400 truncate w-7/12">{videoFile.name}</p>
                        <button 
                          type="button"
                          onClick={() => {
                            setVideoFile(null);
                            setVideoPreview(null);
                          }}
                          className="p-1 px-2.5 bg-rose-500/20 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Thumbnail Dropper (Optional) */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Cover Artwork / Thumbnail (Optional)</span>
                  {!thumbnailFile ? (
                    <div 
                      onDragOver={handleDragOverThumb}
                      onDragLeave={handleDragLeaveThumb}
                      onDrop={handleDropThumb}
                      onClick={() => thumbInputRef.current?.click()}
                      className={`aspect-video cursor-pointer border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-6 text-center transition-all ${
                        isDraggingThumb ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                      }`}
                    >
                      <ImageIcon className="w-10 h-10 text-zinc-600 mb-2" />
                      <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Drag image here</p>
                      <p className="text-[8px] font-mono uppercase tracking-widest text-zinc-600 mt-1">PNG, JPG, WEBP</p>
                      <input 
                        type="file" 
                        ref={thumbInputRef}
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleThumbFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="aspect-video relative rounded-3xl overflow-hidden border border-zinc-800 bg-black">
                      <img src={thumbnailPreview || undefined} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/40 to-transparent flex items-end justify-between p-4 pt-10">
                        <p className="text-[9px] font-mono text-zinc-400 truncate w-7/12">{thumbnailFile.name}</p>
                        <button 
                          type="button"
                          onClick={() => {
                            setThumbnailFile(null);
                            setThumbnailPreview(null);
                          }}
                          className="p-1 px-2.5 bg-rose-500/20 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Multi-Clip Combiner Layout */
            <div className="space-y-4 animate-fadeIn">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block">Stitch-Ready Multi Clips</span>
              
              {/* Timeline Container list */}
              {timelineClips.length === 0 ? (
                <div 
                  onClick={() => videoInputRef.current?.click()}
                  className="py-12 border-2 border-dashed border-zinc-800 bg-zinc-900/10 rounded-3xl text-center cursor-pointer hover:border-zinc-700 transition-all flex flex-col items-center justify-center"
                >
                  <Film className="w-12 h-12 text-zinc-700 mb-2" />
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400">No raw clips added to timeline</p>
                  <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Click below to upload video segments</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {timelineClips.map((clip, idx) => (
                    <div key={clip.id} className="bg-zinc-900/50 border border-zinc-900 rounded-2xl overflow-hidden relative group">
                      <video src={clip.preview} className="w-full aspect-video object-cover" muted playsInline />
                      <div className="p-3 bg-black flex items-center justify-between">
                        <div>
                          <p className="text-[8px] font-black text-orange-500 uppercase">CLIP {idx + 1}</p>
                          <p className="text-[9px] font-mono text-zinc-500 truncate mt-0.5">{clip.file.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setTimelineClips((prev) => prev.filter(c => c.id !== clip.id));
                          }}
                          className="p-1.5 bg-zinc-900 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Left/Right Sequencer arrows on hover */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const copy = [...timelineClips];
                              const temp = copy[idx];
                              copy[idx] = copy[idx - 1];
                              copy[idx - 1] = temp;
                              setTimelineClips(copy);
                            }}
                            className="p-1 bg-black/80 hover:bg-orange-500 rounded text-zinc-400 hover:text-black text-[8px] font-bold"
                          >
                            ◀
                          </button>
                        )}
                        {idx < timelineClips.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const copy = [...timelineClips];
                              const temp = copy[idx];
                              copy[idx] = copy[idx + 1];
                              copy[idx + 1] = temp;
                              setTimelineClips(copy);
                            }}
                            className="p-1 bg-black/80 hover:bg-orange-500 rounded text-zinc-400 hover:text-black text-[8px] font-bold"
                          >
                            ▶
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add segments trigger */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex-1 py-3 bg-zinc-900/60 border border-zinc-850 rounded-2xl text-[9px] font-black uppercase tracking-widest text-zinc-300 hover:border-zinc-700 transition-all cursor-pointer text-center"
                >
                  ⚡ Click to Append Video Segment
                </button>
                <input 
                  type="file" 
                  ref={videoInputRef}
                  accept="video/*" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleAddClip(e.target.files[0]);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Core connection pickers & style selectors */}
          {!isStitching && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-900/80">
                {/* Connection Box */}
                <div>
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-1.5 mb-2">
                    <Layers className="w-3 h-3 text-orange-500" /> Soundtrack / Link Connection
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setAssociatedType('none'); setAssociatedId(''); }}
                      className={`py-2 px-1 rounded-xl border text-center font-black uppercase text-[8px] tracking-wider transition-all cursor-pointer ${
                        associatedType === 'none' 
                          ? 'bg-zinc-900 border-orange-500 text-orange-500' 
                          : 'bg-zinc-900/40 border-zinc-850 text-zinc-500 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      Mute
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAssociatedType('track'); setAssociatedId(tracks[0]?.id || ''); }}
                      disabled={tracks.length === 0}
                      className={`py-2 px-1 rounded-xl border text-center font-black uppercase text-[8px] tracking-wider transition-all cursor-pointer disabled:opacity-30 ${
                        associatedType === 'track' 
                          ? 'bg-zinc-900 border-orange-500 text-orange-500' 
                          : 'bg-zinc-900/40 border-zinc-850 text-zinc-500 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      Track
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAssociatedType('playlist'); setAssociatedId(playlists[0]?.id || ''); }}
                      disabled={playlists.length === 0}
                      className={`py-2 px-1 rounded-xl border text-center font-black uppercase text-[8px] tracking-wider transition-all cursor-pointer disabled:opacity-30 ${
                        associatedType === 'playlist' 
                          ? 'bg-zinc-900 border-orange-500 text-orange-500' 
                          : 'bg-zinc-900/40 border-zinc-850 text-zinc-500 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      Playlist
                    </button>
                  </div>

                  {associatedType === 'track' && tracks.length > 0 && (
                    <div className="mt-3">
                      <select 
                        value={associatedId} 
                        onChange={(e) => setAssociatedId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-850 text-zinc-300 rounded-xl px-4 py-2.5 text-[9px] outline-none focus:border-orange-500 font-bold uppercase tracking-wider"
                      >
                        {tracks.map(t => (
                          <option key={t.id} value={t.id}>{t.name} — {t.artist}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {associatedType === 'playlist' && playlists.length > 0 && (
                    <div className="mt-3">
                      <select 
                        value={associatedId} 
                        onChange={(e) => setAssociatedId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-850 text-zinc-300 rounded-xl px-4 py-2.5 text-[9px] outline-none focus:border-orange-500 font-bold uppercase tracking-wider"
                      >
                        {playlists.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Aesthetic style selectors */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-orange-500" /> Aesthetic Style / Palette
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {['Cyberpunk', 'Minimalist', 'Vaporwave', 'Cinematic', 'TikTok Hype'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setStylePreset(preset);
                          setCustomStyle('');
                        }}
                        className={`px-3 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                          stylePreset === preset && !customStyle
                            ? 'bg-orange-500 border-orange-500 text-black'
                            : 'bg-zinc-900/40 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="text"
                    placeholder="Or enter custom video styling..."
                    value={customStyle}
                    onChange={(e) => {
                      setCustomStyle(e.target.value);
                      setStylePreset('');
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Action trigger button */}
              {uploadMode === 'single' ? (
                <button 
                  type="button"
                  onClick={handleUpload}
                  disabled={!videoFile || !!uploadStatus}
                  className="w-full py-4.5 bg-white text-black rounded-full font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-orange-500 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <Upload className="w-4 h-4" /> {uploadStatus || "Publish Single Social Asset"}
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={stitchClips}
                  disabled={timelineClips.length === 0}
                  className="w-full py-4.5 bg-white text-black rounded-full font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-orange-500 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  <Film className="w-4 h-4" /> Stitch & Sequence Combined Video Timeline ({timelineClips.length} Clips)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useEffect, useState } from 'react';
import { X, Download, Share2, Trash2, AlertCircle, Youtube, Instagram, Facebook, ChevronLeft, Copy, Check, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PromoVideo } from '../types';
import { useMediaStore } from '../context/MediaStoreContext';
import { generatePromoPack } from '../services/geminiService';

interface VideoPreviewModalProps {
  video: PromoVideo;
  onClose: () => void;
  key?: string | number;
}

export default function VideoPreviewModal({ video, onClose }: VideoPreviewModalProps) {
  const { deletePromoVideo, tracks, playlists, addToast } = useMediaStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const track = tracks.find(t => t.id === video.track_id);
  const playlist = playlists.find(p => p.id === video.playlist_id);
  const sourceName = track?.name || playlist?.name || 'Untitled Asset';

  useEffect(() => {
    if (videoRef.current && !video._brokenBlob) {
      // Try to play with sound first, if it fails, try muted
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.warn("Autoplay with sound blocked, trying muted...");
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play();
          }
        });
      }
    }
  }, [video.video_url, video._brokenBlob]);

  const [isDownloading, setIsDownloading] = useState(false);
  const [activePanel, setActivePanel] = useState<'meta' | 'share'>('meta');
  const [socialPlatform, setSocialPlatform] = useState<'youtube' | 'instagram' | 'facebook'>('youtube');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [promoData, setPromoData] = useState<any>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    async function loadPromoData() {
      try {
        if (track) {
          const data = await generatePromoPack(track);
          setPromoData(data);
        } else if (playlist) {
          const simulatedTrack = {
            name: playlist.name,
            artist: "THE BEATZ WAY",
            bpm: 120,
            key_signature: "Am",
            tags: ["Collection", "Beat Tape", "Release"]
          };
          const data = await generatePromoPack(simulatedTrack);
          setPromoData(data);
        } else {
          const simulatedTrack = {
            name: sourceName,
            artist: "THE BEATZ WAY",
            bpm: 125,
            key_signature: "Cm",
            tags: [video.style || "Urban", "Asset", "Promo"]
          };
          const data = await generatePromoPack(simulatedTrack);
          setPromoData(data);
        }
      } catch (err) {
        console.error("Error generating promo pack data:", err);
      }
    }
    loadPromoData();
  }, [track, playlist, video, sourceName]);

  const getProxyVideoUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http') && !url.includes(window.location.host)) {
      return `/api/proxy-video?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const handleDownload = async () => {
    if (!video.video_url) return;
    setIsDownloading(true);

    try {
      const response = await fetch(getProxyVideoUrl(video.video_url));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sourceName.replace(/\s+/g, '_')}_Promo_Master.mp4`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setIsDownloading(false);
      }, 100);
    } catch (error) {
      console.error('Download failed:', error);
      setIsDownloading(false);
      const a = document.createElement('a');
      a.href = getProxyVideoUrl(video.video_url);
      a.download = `${sourceName.replace(/\s+/g, '_')}_Promo_Master.mp4`;
      a.click();
    }
  };

  const copyText = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Helper defaults if promoData is still fetching
  const youtubeTitle = promoData?.youtube?.title || `🔥 ${sourceName} - Official Visualizer // (${video.style} style)`;
  const youtubeDesc = promoData?.youtube?.description || `Presenting "${sourceName}" produced in professional ${video.style} aesthetic. \n\nStream/Download on all music platforms. Produced by THE BEATZ WAY.\n\n#beatzway #youtube #${video.style.replace(/\s+/g, '').toLowerCase()}`;
  const instagramCaption = promoData?.instagram || `🔥 THE VIBE IS HERE: "${sourceName}" is officially live inside the promo portal. Handcrafted modern beats in custom ${video.style.toLowerCase()} style. \n\nStream full master now via the link in bio! 🔗 \n\n#reels #instamusic #producer #${video.style.replace(/\s+/g, '').toLowerCase()}`;
  const facebookCaption = promoData?.facebook || `🔥 WATCH: "${sourceName}" is now streaming! Check out this high-fidelity master created in dynamic ${video.style.toLowerCase()} visualizer. \n\nStream/Download full version here inside the portal! 🔗 \n\n#beatzway #facebookreels #producer #${video.style.replace(/\s+/g, '').toLowerCase()}`;

  const openExternalPublish = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/95 backdrop-blur-3xl"
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-5xl max-h-[90vh] bg-zinc-950 border border-zinc-900 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col md:flex-row"
      >
        {/* Video Player Side */}
        <div className="flex-grow bg-black min-h-[350px] aspect-video md:aspect-auto flex items-center justify-center relative group">
           {video._brokenBlob ? (
             <div className="flex flex-col items-center gap-4 text-center p-8">
               <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                 <AlertCircle className="w-8 h-8 text-rose-500" />
               </div>
               <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase tracking-widest text-rose-500">Asset Desynchronized</h3>
                 <p className="text-zinc-500 text-xs max-w-xs mx-auto">This neural render cache was tied to a volatile session buffer and is no longer available. Re-rendering required.</p>
               </div>
             </div>
           ) : (video.video_url?.match(/\.(mp4|webm|mov)$/i) || video.video_url?.startsWith('data:video') || video.video_url?.startsWith('blob:')) ? (
             <video 
               ref={videoRef}
               src={getProxyVideoUrl(video.video_url)} 
               controls 
               playsInline
               className="w-full h-full object-contain max-h-[85vh]"
               poster={video.thumbnail_url}
               onError={(e) => {
                 const videoElement = e.currentTarget;
                 console.error("Video load error:", videoElement.error);
               }}
             />
           ) : (
             <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center min-h-[400px]">
               <motion.img 
                 src={video.video_url || 'https://images.unsplash.com/photo-1614113489855-66422ad300a4?w=800&q=80'}
                 className="w-full h-full object-contain"
                 initial={{ scale: 1 }}
                 animate={{ scale: 1.05 }}
                 transition={{ duration: 10, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
               />
               {track?.file_url && (
                 <audio 
                   src={track.file_url} 
                   autoPlay 
                   controls 
                   onError={(e) => {
                     console.warn("Audio load failure:", track.file_url);
                     addToast?.("The preview audio file is currently unreachable. Enjoying video-only showcase.", "info");
                   }}
                   className="absolute bottom-8 w-3/4 max-w-md opacity-80 hover:opacity-100 transition-opacity z-10" 
                 />
               )}
             </div>
           )}
           <div className="absolute top-8 left-8">
              <div className="px-4 py-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-orange-500">
                PROMO MASTER // {video.style.toUpperCase()}
              </div>
           </div>
        </div>

        {/* Dynamic Panel Side (Metadata or Social Share Suite) */}
        <div className="w-full md:w-96 border-l border-zinc-900 p-8 flex flex-col justify-between bg-zinc-950/40 relative">
          
          <AnimatePresence mode="wait">
            {activePanel === 'meta' ? (
              <motion.div 
                key="metadata-panel"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6 flex-grow flex flex-col justify-between"
              >
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter leading-tight">{sourceName}</h2>
                    <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Active Promotion Set</p>
                  </div>

                  <div className="space-y-4">
                     <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-3xl">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">Created</p>
                        <p className="text-xs font-bold">{new Date(video.created_at).toLocaleDateString()} at {new Date(video.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                     </div>
                     
                     <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-3xl">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">Neural Style Preset</p>
                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">{video.style}</p>
                     </div>

                     <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-3xl">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">Status</p>
                        <div className="flex items-center gap-2">
                           <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                           <p className="text-xs font-bold uppercase tracking-widest">{video.status}</p>
                        </div>
                     </div>
                  </div>
                </div>

                <div className="space-y-3 pt-6 shrink-0">
                  <button 
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full py-4 bg-white text-black rounded-2xl font-black tracking-widest uppercase text-[10px] flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isDownloading ? (
                      <>
                        <Download className="w-4 h-4 animate-bounce" /> Processing...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" /> Download Master
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => setActivePanel('share')}
                    className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-black rounded-2xl font-black tracking-widest uppercase text-[10px] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-orange-500/20 active:scale-95"
                  >
                    <Share2 className="w-4 h-4 text-black" /> Share to YouTube / IG
                  </button>
                  {isConfirmingDelete ? (
                    <div className="w-full bg-rose-950/20 border border-rose-500/25 p-4 rounded-2xl space-y-3 antialiased">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-200">Confirm Destruction?</p>
                          <p className="text-[8px] text-rose-400 uppercase tracking-widest mt-0.5">This will permanently purge this rendering from the database & local caches.</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            deletePromoVideo(video.id);
                            onClose();
                          }}
                          className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-black text-[9px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer active:scale-95"
                        >
                          Yes, Purge File
                        </button>
                        <button
                          onClick={() => setIsConfirmingDelete(false)}
                          className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[9px] font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer active:scale-95"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsConfirmingDelete(true)}
                      className="w-full py-3 text-zinc-600 hover:text-rose-500 text-[9px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Destroy Asset
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="sharing-panel"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6 flex-grow flex flex-col justify-between h-full"
              >
                <div className="space-y-6 flex-grow">
                  <button 
                    onClick={() => setActivePanel('meta')}
                    className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back to stats
                  </button>

                  <div>
                     <h2 className="text-xl font-black uppercase tracking-tighter leading-tight italic">Social Publisher</h2>
                     <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">Deploy rendering directly with AI optimization</p>
                  </div>

                  {/* Platform Tab Selection */}
                  <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-900/60 rounded-2xl border border-zinc-900">
                    <button
                      onClick={() => setSocialPlatform('youtube')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                        socialPlatform === 'youtube' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      <Youtube className="w-4 h-4" /> YouTube
                    </button>
                    <button
                      onClick={() => setSocialPlatform('instagram')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                        socialPlatform === 'instagram' ? 'bg-purple-500/10 border border-purple-500/20 text-purple-500' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      <Instagram className="w-4 h-4" /> Instagram
                    </button>
                    <button
                      onClick={() => setSocialPlatform('facebook')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                        socialPlatform === 'facebook' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      <Facebook className="w-4 h-4" /> Facebook
                    </button>
                  </div>

                  {/* Active Platform Configuration */}
                  <div className="space-y-4 max-h-[35vh] overflow-y-auto pr-1">
                    {socialPlatform === 'youtube' ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-rose-500/80 px-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Optimized for YouTube Shorts / Video</span>
                        </div>

                        {/* Title Input block */}
                        <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl space-y-2 relative group">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">SEO Title</span>
                            <button 
                              onClick={() => copyText(youtubeTitle, 'yt_title')}
                              className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                              title="Copy Title"
                            >
                              {copiedField === 'yt_title' ? (
                                <span className="text-[8px] text-emerald-500 font-bold uppercase">Copied!</span>
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs font-bold text-zinc-200 tracking-tight leading-snug">{youtubeTitle}</p>
                        </div>

                        {/* Description block */}
                        <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl space-y-2 relative group">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Video Description</span>
                            <button 
                              onClick={() => copyText(youtubeDesc, 'yt_desc')}
                              className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                              title="Copy Description"
                            >
                              {copiedField === 'yt_desc' ? (
                                <span className="text-[8px] text-emerald-500 font-bold uppercase">Copied!</span>
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs font-mono text-zinc-400 leading-normal line-clamp-4 overflow-hidden select-all whitespace-pre-wrap">{youtubeDesc}</p>
                        </div>

                        {/* Recommended Tags */}
                        <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl space-y-1.5">
                           <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Target Keywords</span>
                           <p className="text-[9px] font-mono text-orange-500/80 font-bold tracking-tight">#ogbeatz #{video.style.toLowerCase().replace(/\s+/g, '')} #producer #viralbeats</p>
                        </div>
                      </div>
                    ) : socialPlatform === 'instagram' ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-purple-500/80 px-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Optimized for Instagram Reels / Stories</span>
                        </div>

                        <div className="p-4 border border-zinc-900 bg-zinc-900/30 rounded-2xl flex gap-3">
                          <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                          <p className="text-[9px] font-semibold text-zinc-500 leading-relaxed uppercase tracking-wider">
                            Recommending high contrast 9:16 portrait frames. Visual style utilizes vibrant gradient color mappings matching the track.
                          </p>
                        </div>

                        {/* Reel Caption */}
                        <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl space-y-2 relative group">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Reels Caption</span>
                            <button 
                              onClick={() => copyText(instagramCaption, 'ig_caption')}
                              className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                              title="Copy Caption"
                            >
                              {copiedField === 'ig_caption' ? (
                                <span className="text-[8px] text-emerald-500 font-bold uppercase">Copied!</span>
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-zinc-200 leading-normal line-clamp-5 overflow-hidden select-all whitespace-pre-wrap">{instagramCaption}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-blue-500/80 px-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Optimized for Facebook Feed & Reels</span>
                        </div>

                        <div className="p-4 border border-zinc-900 bg-zinc-900/30 rounded-2xl flex gap-3">
                          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          <p className="text-[9px] font-semibold text-zinc-500 leading-relaxed uppercase tracking-wider">
                            Facebook visualizer feed integrations. Promotes continuous playback loop mechanics matching user-authored streams.
                          </p>
                        </div>

                        {/* Facebook Caption */}
                        <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl space-y-2 relative group">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Facebook Caption</span>
                            <button 
                              onClick={() => copyText(facebookCaption, 'fb_caption')}
                              className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                              title="Copy Caption"
                            >
                              {copiedField === 'fb_caption' ? (
                                <span className="text-[8px] text-emerald-500 font-bold uppercase">Copied!</span>
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-zinc-200 leading-normal line-clamp-5 overflow-hidden select-all whitespace-pre-wrap">{facebookCaption}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-6 shrink-0">
                  <button 
                    onClick={() => {
                      if (socialPlatform === 'youtube') {
                        // Copy title and description then open upload
                        copyText(`${youtubeTitle}\n\n${youtubeDesc}`, 'yt_all');
                        openExternalPublish('https://youtube.com/upload');
                      } else if (socialPlatform === 'instagram') {
                        // Copy caption then open Instagram creator portal
                        copyText(instagramCaption, 'ig_all');
                        openExternalPublish('https://www.instagram.com/');
                      } else {
                        // Copy caption then open Facebook Creator Studio
                        copyText(facebookCaption, 'fb_all');
                        openExternalPublish('https://www.facebook.com/creatorstudio/');
                      }
                    }}
                    className={`w-full py-4 rounded-2xl font-black tracking-widest uppercase text-[10px] flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer ${
                      socialPlatform === 'youtube' 
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20' 
                        : socialPlatform === 'instagram'
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                    }`}
                  >
                    Copy & Open {socialPlatform === 'youtube' ? 'YouTube Studio' : socialPlatform === 'instagram' ? 'Instagram Portal' : 'Facebook Creator Studio'}
                  </button>
                  <button 
                    onClick={() => setActivePanel('meta')}
                    className="w-full py-3 bg-transparent text-zinc-500 hover:text-white text-[9px] font-black uppercase tracking-widest transition-colors flex items-center justify-center cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button 
          onClick={onClose}
          className="absolute top-8 right-8 p-3 bg-black/50 hover:bg-black rounded-2xl text-white transition-all backdrop-blur-xl border border-white/5 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </motion.div>
    </div>
  );
}

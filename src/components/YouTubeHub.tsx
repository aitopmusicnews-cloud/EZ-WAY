import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaStore } from '../context/MediaStoreContext';
import { promoVideosForTrack } from '../services/youtubeUploadCore';
import YouTubeHubLegacy from './YouTubeHubLegacy';

interface YouTubeHubProps {
  addToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const setNativeSelectValue = (select: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

export default function YouTubeHub(props: YouTubeHubProps) {
  const { tracks, promoVideos } = useMediaStore();
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const legacySelectRef = useRef<HTMLSelectElement | null>(null);
  const legacyGroupRef = useRef<HTMLElement | null>(null);
  const portalNodeRef = useRef<HTMLElement | null>(null);

  const filteredPromoVideos = useMemo(
    () => promoVideosForTrack(promoVideos, selectedTrackId),
    [promoVideos, selectedTrackId],
  );

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;

    const removeBridge = () => {
      if (legacyGroupRef.current) legacyGroupRef.current.style.display = '';
      portalNodeRef.current?.remove();
      legacyGroupRef.current = null;
      legacySelectRef.current = null;
      portalNodeRef.current = null;
      setPortalTarget(null);
    };

    const installBridge = () => {
      const label = Array.from(root.querySelectorAll('label')).find((item) =>
        item.textContent?.includes('Choose Complete Promo Video Rendering'),
      );
      const group = label?.parentElement as HTMLElement | null;
      const select = group?.querySelector('select') as HTMLSelectElement | null;

      if (!group || !select) {
        if (legacyGroupRef.current && !root.contains(legacyGroupRef.current)) removeBridge();
        return;
      }
      if (legacyGroupRef.current === group && portalNodeRef.current) return;

      removeBridge();
      const portalNode = document.createElement('div');
      group.parentElement?.insertBefore(portalNode, group);
      group.style.display = 'none';
      legacyGroupRef.current = group;
      legacySelectRef.current = select;
      portalNodeRef.current = portalNode;
      setPortalTarget(portalNode);
    };

    installBridge();
    const observer = new MutationObserver(installBridge);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      removeBridge();
    };
  }, []);

  const handleTrackSelect = (trackId: string) => {
    setSelectedTrackId(trackId);
    setSelectedVideoId('');
    if (legacySelectRef.current) setNativeSelectValue(legacySelectRef.current, '');
  };

  const handleVideoSelect = (videoId: string) => {
    setSelectedVideoId(videoId);
    if (legacySelectRef.current) setNativeSelectValue(legacySelectRef.current, videoId);
  };

  const dropdowns = portalTarget ? createPortal(
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono block">
          1. Select Track
        </label>
        <select
          value={selectedTrackId}
          onChange={(event) => handleTrackSelect(event.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer font-sans"
        >
          <option value="">-- Select an EZ-WAY track --</option>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name} — {track.artist || 'Unknown Artist'}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono block">
          2. Select Promo Video
        </label>
        <select
          value={selectedVideoId}
          onChange={(event) => handleVideoSelect(event.target.value)}
          disabled={!selectedTrackId}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">
            {selectedTrackId ? '-- Select a promo video for this track --' : '-- Select a track first --'}
          </option>
          {filteredPromoVideos.map((video) => (
            <option key={video.id} value={video.id}>
              {video.name || video.title || 'Promo Video'} ({video.style || 'Visualizer'})
            </option>
          ))}
          {selectedTrackId && filteredPromoVideos.length === 0 && (
            <option value="" disabled>No promo videos available for this track</option>
          )}
        </select>
      </div>
    </div>,
    portalTarget,
  ) : null;

  return (
    <div ref={hostRef}>
      <YouTubeHubLegacy {...props} />
      {dropdowns}
    </div>
  );
}

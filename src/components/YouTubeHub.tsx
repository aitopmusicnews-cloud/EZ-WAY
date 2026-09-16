import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaStore } from '../context/MediaStoreContext';
import { researchLocalLyricSeo } from '../services/localLyricOptimizer';
import {
  createYouTubeBrowserClient,
  createYouTubeFetchBridge,
  preloadGoogleIdentityServices,
  setYouTubeBrowserAmazonMusicLink,
  YOUTUBE_OAUTH_SENTINEL_URL,
} from '../services/youtubeBrowser';
import {
  buildYouTubeSEOSeed,
  cacheYouTubeSEOResearch,
  promoVideosForTrack,
  setYouTubeAmazonMusicLink,
} from '../services/youtubeUploadCore';
import YouTubeHubLegacy from './YouTubeHubLegacy';

interface YouTubeHubProps {
  addToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  initialVideoId?: string;
  onClearInitialVideoId?: () => void;
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
  const [amazonPortalTarget, setAmazonPortalTarget] = useState<HTMLElement | null>(null);
  const [amazonMusicLink, setAmazonMusicLink] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const legacySelectRef = useRef<HTMLSelectElement | null>(null);
  const legacyGroupRef = useRef<HTMLElement | null>(null);
  const portalNodeRef = useRef<HTMLElement | null>(null);
  const amazonPortalNodeRef = useRef<HTMLElement | null>(null);
  const researchPromiseRef = useRef<Promise<void> | null>(null);

  const filteredPromoVideos = useMemo(
    () => promoVideosForTrack(promoVideos, selectedTrackId),
    [promoVideos, selectedTrackId],
  );

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    const nativeOpen = window.open.bind(window);
    const client = createYouTubeBrowserClient();
    const bridgedFetch = createYouTubeFetchBridge({ nativeFetch, client });

    const bridgedOpen = ((url?: string | URL, target?: string, features?: string) => {
      if (String(url || '') !== YOUTUBE_OAUTH_SENTINEL_URL) {
        return nativeOpen(url, target, features);
      }

      let closed = false;
      const fakeWindow = {
        get closed() { return closed; },
        close() { closed = true; },
      } as unknown as Window;

      void client.connect()
        .then((state) => {
          if (!state.connected) throw new Error('Google authorization completed without a YouTube channel.');
          try { localStorage.setItem('YOUTUBE_OAUTH_STATUS', 'SUCCESS'); } catch (_) {}
          window.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
        })
        .catch((error) => {
          console.error('[YouTube OAuth] Browser authorization failed.', error);
        })
        .finally(() => {
          closed = true;
        });

      return fakeWindow;
    }) as typeof window.open;

    window.fetch = bridgedFetch;
    window.open = bridgedOpen;
    void preloadGoogleIdentityServices().catch((error) => {
      console.warn('[YouTube OAuth] Google Identity Services preload failed.', error);
    });

    return () => {
      if (window.fetch === bridgedFetch) window.fetch = nativeFetch;
      if (window.open === bridgedOpen) window.open = nativeOpen;
    };
  }, []);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;

    const removeBridge = () => {
      if (legacyGroupRef.current) legacyGroupRef.current.style.display = '';
      portalNodeRef.current?.remove();
      amazonPortalNodeRef.current?.remove();
      legacyGroupRef.current = null;
      legacySelectRef.current = null;
      portalNodeRef.current = null;
      amazonPortalNodeRef.current = null;
      setPortalTarget(null);
      setAmazonPortalTarget(null);
    };

    const installBridge = () => {
      const labels = Array.from(root.querySelectorAll('label')) as HTMLLabelElement[];
      const label = labels.find((item) =>
        item.textContent?.includes('Choose Complete Promo Video Rendering'),
      );
      const group = label?.parentElement as HTMLElement | null;
      const select = group?.querySelector('select') as HTMLSelectElement | null;

      if (group && select && !(legacyGroupRef.current === group && portalNodeRef.current)) {
        if (legacyGroupRef.current && legacyGroupRef.current !== group) {
          legacyGroupRef.current.style.display = '';
          portalNodeRef.current?.remove();
          portalNodeRef.current = null;
        }
        if (!portalNodeRef.current) {
          const portalNode = document.createElement('div');
          group.parentElement?.insertBefore(portalNode, group);
          group.style.display = 'none';
          legacyGroupRef.current = group;
          legacySelectRef.current = select;
          portalNodeRef.current = portalNode;
          setPortalTarget(portalNode);
        }
      }

      const amazonLabel = labels.find((item) => item.textContent?.includes('Amazon Music Link'));
      const appleLabel = labels.find((item) => item.textContent?.includes('Apple Music Link'));
      const appleGroup = appleLabel?.parentElement as HTMLElement | null;
      const streamingGrid = appleGroup?.parentElement as HTMLElement | null;

      if (!amazonLabel && streamingGrid && !amazonPortalNodeRef.current) {
        const amazonPortalNode = document.createElement('div');
        streamingGrid.appendChild(amazonPortalNode);
        amazonPortalNodeRef.current = amazonPortalNode;
        setAmazonPortalTarget(amazonPortalNode);
      }

      if (amazonPortalNodeRef.current && !root.contains(amazonPortalNodeRef.current)) {
        amazonPortalNodeRef.current = null;
        setAmazonPortalTarget(null);
      }
    };

    installBridge();
    const observer = new MutationObserver(installBridge);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      removeBridge();
    };
  }, []);

  const researchTrack = (trackId: string): Promise<void> => {
    const track = tracks.find((item) => item.id === trackId);
    if (!track) return Promise.resolve();
    const seed = buildYouTubeSEOSeed(track.name, track.artist);
    const primaryGenre = String(track.tags?.[0] || '').trim();

    const task = (async () => {
      try {
        const local = await researchLocalLyricSeo(seed, primaryGenre);
        cacheYouTubeSEOResearch(seed, {
          suggestions: local.suggestions,
          competitorTags: local.competitor_tags,
          rankedTags: local.ranked_tags,
        });
        if (!local.warning) return;
        if (local.warning !== 'youtube_api_key_missing') {
          console.warn('[YouTube SEO] Local optimizer returned a partial result; using OAuth research.', local.warning);
        }
      } catch (error) {
        console.warn('[YouTube SEO] Local optimizer unavailable; using OAuth research.', error);
      }

      try {
        const response = await fetch(`/api/youtube/seo-research?seed=${encodeURIComponent(seed)}`);
        if (!response.ok) return;
        const research = await response.json();
        cacheYouTubeSEOResearch(seed, research);
      } catch (error) {
        console.warn('[YouTube SEO] OAuth lyric research unavailable; using cached/static lyric SEO.', error);
      }
    })();

    researchPromiseRef.current = task;
    return task;
  };

  const handleTrackSelect = (trackId: string) => {
    setSelectedTrackId(trackId);
    setSelectedVideoId('');
    researchPromiseRef.current = trackId ? researchTrack(trackId) : null;
    if (legacySelectRef.current) setNativeSelectValue(legacySelectRef.current, '');
  };

  const handleVideoSelect = (videoId: string) => {
    setSelectedVideoId(videoId);
    const applySelection = () => {
      if (legacySelectRef.current) setNativeSelectValue(legacySelectRef.current, videoId);
    };
    const pendingResearch = researchPromiseRef.current;
    if (pendingResearch) void pendingResearch.finally(applySelection);
    else applySelection();
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

  const amazonMusicField = amazonPortalTarget ? createPortal(
    <div className="space-y-1">
      <label className="text-[8px] font-black uppercase tracking-wider text-zinc-500 font-mono block">
        Amazon Music Link
      </label>
      <input
        type="text"
        value={amazonMusicLink}
        onChange={(event) => {
          const value = event.target.value;
          setAmazonMusicLink(value);
          setYouTubeAmazonMusicLink(value);
          setYouTubeBrowserAmazonMusicLink(value);
        }}
        placeholder="https://music.amazon.com/..."
        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-orange-500 font-sans"
      />
    </div>,
    amazonPortalTarget,
  ) : null;

  return (
    <div ref={hostRef}>
      <YouTubeHubLegacy {...props} />
      {dropdowns}
      {amazonMusicField}
    </div>
  );
}

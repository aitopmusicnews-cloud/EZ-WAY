import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Download,
  FileAudio,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Save,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import { canUsePremiumFeature } from '../services/premiumFeatures';
import { loadTrackAudioFile } from '../services/albumCoverCore';
import { albumCoverAnchorStyle, albumCoverFontPreviewUrl, albumCoverPointerAnchor, defaultAlbumCoverAnchor, type AlbumCoverAnchor } from '../services/albumCoverTextEditor';
import {
  ALBUM_COVER_FONT_OPTIONS,
  absoluteAlbumCoverUrl,
  createAlbumCoverGeneration,
  downloadAlbumCover,
  generateBetterAlbumCovers,
  updateAlbumCoverReleaseText,
  getAlbumCoverGeneration,
  getAlbumCoverHistory,
  getAlbumCoverMetrics,
  isAlbumCoverStudioConfigured,
  latestAlbumCoverVariationSet,
  retryAlbumCoverGeneration,
  runAlbumCoverPath,
  selectAlbumCoverVariation,
  waitForAlbumCoverGeneration,
  waitForAlbumCoverVariationSet,
  type AlbumCoverCreativeControls,
  type AlbumCoverGeneration,
  type AlbumCoverMetrics,
  type AlbumCoverReleaseTextSettings,
  type AlbumCoverReferenceType,
  type AlbumCoverMoodPath,
  type AlbumCoverVariation,
  type AlbumCoverVariationCount,
} from '../services/albumCoverStudio';

interface AlbumCoverStudioProps {
  initialTrackId?: string | null;
  onClearInitialTrackId?: () => void;
}

const terminalStatuses = new Set(['complete', 'partial', 'analysis_failed', 'image_failed', 'needs_mood_choice']);

const safeCoverFileName = (title: string): string => (
  `${title || 'album-cover'}-cover.png`.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-')
);

const standaloneCollectionId = (): string => {
  try {
    const existing = localStorage.getItem('album-cover-collection');
    if (existing) return existing;
    const created = (globalThis.crypto?.randomUUID?.() || `album-cover-${Date.now()}`).replaceAll('-', '');
    localStorage.setItem('album-cover-collection', created);
    return created;
  } catch {
    return `album-cover-${Date.now()}`;
  }
};

const asNumber = (value: unknown, digits = 0): string => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(digits);
};

const confidence = (value: unknown): string => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return `${Math.round(numeric * 100)}% confidence`;
};

const displayValue = (value: unknown): string => {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(displayValue).filter((item) => item !== '—').join(', ') || '—';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.label || record.name || record.value || '—');
  }
  return String(value);
};

const statusClass = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized.includes('complete') || normalized.includes('ready')) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (normalized.includes('fail') || normalized.includes('error')) return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (normalized.includes('partial') || normalized.includes('choice')) return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-zinc-700 bg-zinc-900 text-zinc-400';
};

const moodPathFromSet = (value: string | undefined): Exclude<AlbumCoverMoodPath, 'auto'> => (
  value === 'audio' || value === 'lyrics' || value === 'blend' ? value : 'blend'
);

export default function AlbumCoverStudio({ initialTrackId, onClearInitialTrackId }: AlbumCoverStudioProps = {}) {
  const { tracks, updateTrack, uploadFile, addToast } = useMediaStore();
  const [selectedTrackId, setSelectedTrackId] = useState(initialTrackId || '');
  const [manualCollectionId] = useState(standaloneCollectionId);
  const [titleInput, setTitleInput] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [lyricsText, setLyricsText] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [autoLoadedAudio, setAutoLoadedAudio] = useState(false);
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [autoLoadedLyrics, setAutoLoadedLyrics] = useState(false);
  const [parentalAdvisory, setParentalAdvisory] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [showArtist, setShowArtist] = useState(true);
  const [titlePosition, setTitlePosition] = useState<AlbumCoverReleaseTextSettings['title']['position']>('top-center');
  const [titleSize, setTitleSize] = useState(104);
  const [titleFontStyle, setTitleFontStyle] = useState<AlbumCoverReleaseTextSettings['title']['fontStyle']>('editorial');
  const [titleColor, setTitleColor] = useState('#F5F1E8');
  const [titleAnchor, setTitleAnchor] = useState<AlbumCoverAnchor>(() => defaultAlbumCoverAnchor('top-center'));
  const [artistPosition, setArtistPosition] = useState<AlbumCoverReleaseTextSettings['artist']['position']>('bottom-center');
  const [artistSize, setArtistSize] = useState(42);
  const [artistFontStyle, setArtistFontStyle] = useState<AlbumCoverReleaseTextSettings['artist']['fontStyle']>('serif');
  const [artistColor, setArtistColor] = useState('#F5F1E8');
  const [artistAnchor, setArtistAnchor] = useState<AlbumCoverAnchor>(() => defaultAlbumCoverAnchor('bottom-center'));
  const [fontPickerRole, setFontPickerRole] = useState<'title' | 'artist'>('title');
  const coverEditorRef = useRef<HTMLDivElement | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceType, setReferenceType] = useState<AlbumCoverReferenceType>('artist');
  const [variationCount] = useState<AlbumCoverVariationCount>(6);
  const [subjectHint, setSubjectHint] = useState('');
  const [sceneHint, setSceneHint] = useState('');
  const [stylePreset, setStylePreset] = useState<NonNullable<AlbumCoverCreativeControls['stylePreset']>>('auto');
  const [compositionPreset, setCompositionPreset] = useState<NonNullable<AlbumCoverCreativeControls['compositionPreset']>>('auto');
  const [colorMood, setColorMood] = useState('');
  const [mustInclude, setMustInclude] = useState('');
  const [avoid, setAvoid] = useState('');
  const [creativeStrength, setCreativeStrength] = useState<NonNullable<AlbumCoverCreativeControls['creativeStrength']>>('balanced');
  const [generation, setGeneration] = useState<AlbumCoverGeneration | null>(null);
  const [history, setHistory] = useState<AlbumCoverGeneration[]>([]);
  const [metrics, setMetrics] = useState<AlbumCoverMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingTitle, setUpdatingTitle] = useState(false);
  const [selectedVariationId, setSelectedVariationId] = useState('');
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const enabled = canUsePremiumFeature('albumcover-studio');
  const configured = isAlbumCoverStudioConfigured();
  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) || null,
    [tracks, selectedTrackId],
  );
  const collectionId = selectedTrack ? `ezway-${selectedTrack.id}`.slice(0, 64) : manualCollectionId.slice(0, 64);
  const latestSet = useMemo(() => latestAlbumCoverVariationSet(generation), [generation]);
  const variations = useMemo(
    () => [...(latestSet?.variations || [])].sort((a, b) => a.position - b.position),
    [latestSet],
  );
  const selectedVariation = useMemo(
    () => variations.find((item) => item.id === selectedVariationId)
      || variations.find((item) => item.selected)
      || null,
    [variations, selectedVariationId],
  );
  const titleDirty = Boolean(selectedTrack && titleInput.trim() && titleInput.trim() !== String(selectedTrack.name || '').trim());
  const releaseText = useMemo<AlbumCoverReleaseTextSettings>(() => ({
    showTitle,
    showArtist,
    parentalAdvisory,
    title: { position: titlePosition, size: titleSize, fontStyle: titleFontStyle, case: 'original', treatment: 'light', color: titleColor, x: titleAnchor.x, y: titleAnchor.y },
    artist: { position: artistPosition, size: artistSize, fontStyle: artistFontStyle, case: 'original', treatment: 'light', color: artistColor, x: artistAnchor.x, y: artistAnchor.y },
    advisoryPosition: 'bottom-right',
    advisorySize: 'small',
  }), [showTitle, showArtist, parentalAdvisory, titlePosition, titleSize, titleFontStyle, titleColor, titleAnchor, artistPosition, artistSize, artistFontStyle, artistColor, artistAnchor]);

  const updateAnchorFromPointer = (role: 'title' | 'artist', event: React.PointerEvent<HTMLElement>) => {
    const rect = coverEditorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchor = albumCoverPointerAnchor(event, rect);
    if (role === 'title') setTitleAnchor(anchor);
    else setArtistAnchor(anchor);
  };

  const startTextDrag = (role: 'title' | 'artist', event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateAnchorFromPointer(role, event);
  };

  const moveTextDrag = (role: 'title' | 'artist', event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateAnchorFromPointer(role, event);
  };

  useEffect(() => {
    const saved = generation?.release_text as any;
    if (!saved) return;
    const title = saved.title || {};
    const artist = saved.artist || {};
    const savedTitlePosition = title.position || titlePosition;
    const savedArtistPosition = artist.position || artistPosition;
    if (title.position) setTitlePosition(title.position);
    if (artist.position) setArtistPosition(artist.position);
    if (title.font_style) setTitleFontStyle(title.font_style);
    if (artist.font_style) setArtistFontStyle(artist.font_style);
    if (Number.isFinite(Number(title.size))) setTitleSize(Number(title.size));
    if (Number.isFinite(Number(artist.size))) setArtistSize(Number(artist.size));
    if (/^#[0-9A-Fa-f]{6}$/.test(String(title.color || ''))) setTitleColor(title.color);
    if (/^#[0-9A-Fa-f]{6}$/.test(String(artist.color || ''))) setArtistColor(artist.color);
    setTitleAnchor(Number.isFinite(Number(title.x)) && Number.isFinite(Number(title.y)) ? { x: Number(title.x), y: Number(title.y) } : defaultAlbumCoverAnchor(savedTitlePosition));
    setArtistAnchor(Number.isFinite(Number(artist.x)) && Number.isFinite(Number(artist.y)) ? { x: Number(artist.x), y: Number(artist.y) } : defaultAlbumCoverAnchor(savedArtistPosition));
  // Sync controls when a saved/recomposited generation is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation?.id, generation?.updated_at]);

  const creativeControls = useMemo<AlbumCoverCreativeControls>(() => ({
    subjectHint: subjectHint.trim(),
    sceneHint: sceneHint.trim(),
    stylePreset,
    compositionPreset,
    colorMood: colorMood.trim(),
    mustInclude: mustInclude.trim(),
    avoid: avoid.trim(),
    creativeStrength,
  }), [subjectHint, sceneHint, stylePreset, compositionPreset, colorMood, mustInclude, avoid, creativeStrength]);

  const refreshCollection = async (id = collectionId) => {
    if (!configured || !id) return;
    setHistoryBusy(true);
    try {
      const [historyResponse, metricResponse] = await Promise.all([
        getAlbumCoverHistory(id).catch(() => ({ collection_id: id, versions: [] })),
        getAlbumCoverMetrics(id).catch(() => null),
      ]);
      setHistory(historyResponse.versions || []);
      setMetrics(metricResponse);
    } finally {
      setHistoryBusy(false);
    }
  };

  useEffect(() => {
    if (!initialTrackId) return;
    setSelectedTrackId(initialTrackId);
    onClearInitialTrackId?.();
  }, [initialTrackId, onClearInitialTrackId]);

  useEffect(() => {
    let cancelled = false;
    setGeneration(null);
    setSelectedVariationId('');
    setError('');
    setStatusText('');
    setAudioFile(null);
    setAutoLoadedAudio(false);
    setLyricsFile(null);
    setAutoLoadedLyrics(false);
    setParentalAdvisory(false);

    if (selectedTrack) {
      setTitleInput(selectedTrack.name || '');
      setArtistInput(selectedTrack.artist || '');
      setLyricsText(selectedTrack.lyrics || '');
      const hasSavedLyrics = Boolean(selectedTrack.lyrics?.trim());
      setAutoLoadedLyrics(hasSavedLyrics);

      void (async () => {
        try {
          const hydratedAudio = await loadTrackAudioFile(selectedTrack);
          if (cancelled) return;
          setAudioFile(hydratedAudio);
          setAutoLoadedAudio(Boolean(hydratedAudio));
          const loadedSources = [
            hydratedAudio ? 'Auto-loaded EZ-WAY MP3' : '',
            hasSavedLyrics ? 'Auto-loaded saved lyrics' : '',
          ].filter(Boolean);
          if (loadedSources.length > 0) {
            setStatusText(`${loadedSources.join(' + ')}.`);
          }
        } catch (caught: any) {
          if (cancelled) return;
          setAudioFile(null);
          setAutoLoadedAudio(false);
          const message = caught?.message || 'Could not auto-load the selected EZ-WAY MP3.';
          setError(message);
          addToast(message, 'error');
        }
      })();
    } else {
      setTitleInput('');
      setArtistInput('');
      setLyricsText('');
    }

    refreshCollection(selectedTrack ? `ezway-${selectedTrack.id}`.slice(0, 64) : manualCollectionId.slice(0, 64)).catch(() => undefined);
    // collection refresh intentionally follows the selected track identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      cancelled = true;
    };
  }, [selectedTrackId]);

  useEffect(() => {
    if (!generation) return;
    const selected = generation.selected_variation_id
      || generation.variation_sets.flatMap((set) => set.variations).find((item) => item.selected)?.id
      || '';
    if (selected) setSelectedVariationId(selected);
  }, [generation]);

  const resolveTrackAudio = async (): Promise<File | Blob | null> => {
    if (audioFile) return audioFile;
    if (!selectedTrack) return null;
    if (selectedTrack.file_data instanceof Blob && selectedTrack.file_data.size > 0) {
      return selectedTrack.file_data;
    }
    if (!selectedTrack.file_url) return null;
    const response = await fetch(selectedTrack.file_url);
    if (!response.ok) throw new Error(`Could not load the selected track audio (${response.status}).`);
    return response.blob();
  };

  const applyGeneration = async (queued: AlbumCoverGeneration, waitForNewSetFrom?: number) => {
    setGeneration(queued);
    setStatusText(`Processing… ${queued.status.replaceAll('_', ' ')}`);
    if (terminalStatuses.has(queued.status) && waitForNewSetFrom == null) {
      await refreshCollection(queued.collection_id);
      return queued;
    }

    const completed = waitForNewSetFrom == null
      ? await waitForAlbumCoverGeneration(queued.id, {
        onPoll: (current) => {
          setGeneration(current);
          setStatusText(`Processing… ${current.status.replaceAll('_', ' ')}`);
        },
      })
      : await waitForAlbumCoverVariationSet(queued.id, waitForNewSetFrom, {
        onPoll: (current) => {
          setGeneration(current);
          setStatusText(`Creating fresh directions… ${current.status.replaceAll('_', ' ')}`);
        },
      });

    setGeneration(completed);
    setStatusText(`Version ${completed.version} is ${completed.status.replaceAll('_', ' ')}.`);
    await refreshCollection(completed.collection_id);
    return completed;
  };

  const handleGenerate = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSelectedVariationId('');
    try {
      const audio = await resolveTrackAudio();
      const pastedLyrics = lyricsText.trim();
      if (!audio && !lyricsFile && !pastedLyrics) {
        throw new Error('Add an MP3, lyrics, or both.');
      }
      setStatusText('Analyze and generate started…');
      const queued = await createAlbumCoverGeneration({
        collectionId,
        audio,
        lyricsFile,
        lyricsText: pastedLyrics,
        title: titleInput.trim(),
        artist: artistInput.trim(),
        parentalAdvisory,
        variationCount,
        creativeControls,
        releaseText,
        referenceImage,
        referenceType,
      });
      const completed = await applyGeneration(queued);
      if (completed.status === 'needs_mood_choice') {
        addToast('Album Cover Studio needs you to choose the audio or lyric direction.', 'info');
      } else if (completed.status === 'complete' || completed.status === 'partial') {
        addToast(`Album Cover Studio generated version ${completed.version}.`, 'success');
      }
    } catch (caught: any) {
      const message = caught?.message || 'Album cover generation failed.';
      setError(message);
      setStatusText('');
      addToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePath = async (path: Exclude<AlbumCoverMoodPath, 'auto'>, action: 'generate' | 'regenerate' = 'regenerate') => {
    if (!generation || busy) return;
    setBusy(true);
    setError('');
    const previousSetCount = generation.variation_sets.length;
    try {
      const queued = await runAlbumCoverPath(generation.id, path, variationCount, action, creativeControls);
      await applyGeneration(queued, previousSetCount);
    } catch (caught: any) {
      const message = caught?.message || 'The requested creative direction could not be generated.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateBetter = async () => {
    if (!generation || !latestSet || !selectedVariation || busy) return;
    setBusy(true);
    setError('');
    const previousSetCount = generation.variation_sets.length;
    try {
      const queued = await generateBetterAlbumCovers(
        generation.id,
        selectedVariation.id,
        moodPathFromSet(latestSet.mood_path),
        variationCount,
        creativeControls,
      );
      await applyGeneration(queued, previousSetCount);
    } catch (caught: any) {
      const message = caught?.message || 'Generate Better failed.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleApplyTextChanges = async () => {
    if (!generation || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await updateAlbumCoverReleaseText(generation.id, releaseText);
      setGeneration(updated);
      setStatusText('Title, artist, and advisory updated without rerunning FLUX.');
      addToast('Release text updated without regenerating the artwork.', 'success');
    } catch (caught: any) {
      const message = caught?.message || 'Release text update failed.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (!generation || busy) return;
    setBusy(true);
    setError('');
    try {
      const queued = await retryAlbumCoverGeneration(generation.id);
      await applyGeneration(queued);
    } catch (caught: any) {
      const message = caught?.message || 'Retry failed.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectVariation = async (variation: AlbumCoverVariation) => {
    try {
      const updated = await selectAlbumCoverVariation(variation.id);
      setGeneration(updated);
      setSelectedVariationId(variation.id);
      await refreshCollection(updated.collection_id);
      addToast('Cover selected in Album Cover Studio.', 'success');
    } catch (caught: any) {
      const message = caught?.message || 'The cover could not be selected.';
      setError(message);
      addToast(message, 'error');
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  };

  const handleDownload = async (variation: AlbumCoverVariation) => {
    try {
      const blob = await downloadAlbumCover(variation);
      triggerBlobDownload(blob, safeCoverFileName(titleInput));
    } catch (caught: any) {
      const message = caught?.message || 'Cover download failed.';
      setError(message);
      addToast(message, 'error');
    }
  };

  const handleSaveToTrack = async () => {
    if (!selectedTrack || !selectedVariation || saving) return;
    setSaving(true);
    setError('');
    try {
      let currentGeneration = generation;
      if (!selectedVariation.selected) {
        currentGeneration = await selectAlbumCoverVariation(selectedVariation.id);
        setGeneration(currentGeneration);
      }
      const blob = await downloadAlbumCover(selectedVariation);
      const file = new File([blob], safeCoverFileName(titleInput || selectedTrack.name), { type: blob.type || 'image/png' });
      const uploadedUrl = await uploadFile('artwork', file);
      if (!uploadedUrl) throw new Error('The generated cover could not be saved to EZ-WAY artwork storage.');
      await updateTrack(selectedTrack.id, { image_url: uploadedUrl, image_data: file });
      setSelectedVariationId(selectedVariation.id);
      addToast(`Saved new cover art to “${selectedTrack.name}”.`, 'success');
      setStatusText('Selected cover saved to the EZ-WAY track for Videos, Sharing, and YouTube.');
      if (currentGeneration) await refreshCollection(currentGeneration.collection_id);
    } catch (caught: any) {
      const message = caught?.message || 'The selected cover could not be saved to the track.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTrackTitle = async () => {
    if (!selectedTrack || !titleInput.trim() || !titleDirty || updatingTitle) return;
    setUpdatingTitle(true);
    setError('');
    try {
      await updateTrack(selectedTrack.id, { name: titleInput.trim() });
      addToast(`Updated EZ-WAY track title to “${titleInput.trim()}”.`, 'success');
    } catch (caught: any) {
      const message = caught?.message || 'Track title could not be updated.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setUpdatingTitle(false);
    }
  };

  const openHistoryVersion = async (generationId: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const loaded = await getAlbumCoverGeneration(generationId);
      setGeneration(loaded);
      setSelectedVariationId(loaded.selected_variation_id || '');
      setStatusText(`Opened historical version ${loaded.version}.`);
    } catch (caught: any) {
      const message = caught?.message || 'Historical version could not be loaded.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <div className="min-h-full p-8 text-white">
        <div className="max-w-3xl mx-auto rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
          <WandSparkles className="w-12 h-12 text-orange-500 mx-auto mb-5" />
          <h1 className="text-2xl font-black uppercase tracking-tight">EZ AI Album Cover Studio</h1>
          <p className="text-zinc-500 mt-3">This premium feature is not enabled for this account.</p>
        </div>
      </div>
    );
  }

  const analysis = generation?.analysis || null;
  const audioAnalysis = analysis?.audio || null;
  const lyricAnalysis = analysis?.lyrics || null;
  const conflictData = generation?.conflict || null;
  const lastError = generation?.last_error || null;

  return (
    <div className="min-h-full bg-black text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1500px] mx-auto space-y-6">
        <header className="rounded-[2rem] border border-zinc-900 bg-zinc-950 p-6 sm:p-8">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 text-orange-500 mb-3">
                <WandSparkles className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-[0.26em]">The Beat&apos;z Way · Audio + lyric intelligence</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight"><span className="text-orange-500">EZ AI</span> Album Cover Studio</h1>
              <p className="text-zinc-400 mt-3 max-w-3xl">Turn an MP3, lyrics, or both into versioned cover-art concepts. Every input version and variation set remains available.</p>
              <p className="text-[11px] text-zinc-600 mt-2">Creative Director: Cloudflare Gemma 4 · Artwork: FLUX.1 Schnell · Final cover choice: You · Export: 3000×3000</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-xs text-zinc-400">
              <span className="font-black text-zinc-200">Audit collection:</span> {collectionId.slice(0, 18)}…
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-orange-500/15 bg-orange-500/[0.04] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <h2 className="text-xs font-black uppercase tracking-[0.2em]">EZ-WAY integration actions</h2>
          </div>
          <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">Select EZ-WAY Track</label>
              <select
                value={selectedTrackId}
                onChange={(event) => setSelectedTrackId(event.target.value)}
                className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3.5 text-sm text-white outline-none focus:border-orange-500"
              >
                <option value="">Manual studio session…</option>
                {tracks.map((track) => <option key={track.id} value={track.id}>{track.name} — {track.artist || 'Unknown Artist'}</option>)}
              </select>
            </div>
            {selectedTrack && (
              <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-black p-3 min-w-[260px]">
                <div className="w-14 h-14 rounded-xl bg-zinc-900 overflow-hidden flex items-center justify-center shrink-0">
                  {selectedTrack.image_url ? <img src={selectedTrack.image_url} alt="Current artwork" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-zinc-700" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black truncate">{selectedTrack.name}</p>
                  <p className="text-[10px] text-zinc-500 truncate mt-1">Auto-fills title, artist, audio and lyrics when available.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="grid xl:grid-cols-[0.88fr_1.12fr] gap-6 items-start">
          <section className="rounded-[2rem] border border-zinc-900 bg-zinc-950 p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 flex items-center justify-center text-xs font-black">01</span>
              <h2 className="text-xl font-black">Release + source material</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="space-y-2 text-xs font-bold text-zinc-400">
                <span>Album / single title</span>
                <input value={titleInput} onChange={(event) => setTitleInput(event.target.value)} maxLength={200} placeholder="e.g. Midnight Drive" className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-orange-500" />
              </label>
              <label className="space-y-2 text-xs font-bold text-zinc-400">
                <span>Artist name</span>
                <input value={artistInput} onChange={(event) => setArtistInput(event.target.value)} maxLength={200} placeholder="e.g. The Artist Cut" className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-orange-500" />
              </label>
            </div>

            {selectedTrack && titleDirty && (
              <button onClick={handleUpdateTrackTitle} disabled={updatingTitle} className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs font-black uppercase tracking-wider hover:border-orange-500 disabled:opacity-50">
                {updatingTitle ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <Save className="w-4 h-4 inline mr-2" />}
                Update EZ-WAY Track Title
              </button>
            )}

            <div className="rounded-3xl border border-zinc-800 bg-black p-4 space-y-4">
              <div><p className="text-sm font-black">Title + Artist</p><p className="text-[10px] text-zinc-600 mt-1">FLUX creates artwork only. EZ-WAY adds these layers exactly once afterward.</p></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={showTitle} onChange={(event) => setShowTitle(event.target.checked)} className="accent-orange-500" /> Show title</label>
                <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={showArtist} onChange={(event) => setShowArtist(event.target.checked)} className="accent-orange-500" /> Show artist</label>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Title position preset</span><select value={titlePosition} onChange={(e) => { const next = e.target.value as typeof titlePosition; setTitlePosition(next); setTitleAnchor(defaultAlbumCoverAnchor(next)); }} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="center">Center</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select></label>
                <button type="button" onClick={() => setFontPickerRole('title')} className={`text-left rounded-xl border px-3 py-2 ${fontPickerRole === 'title' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 bg-zinc-950'}`}><span className="block text-[10px] font-black uppercase text-zinc-500">Title font</span><span className="block mt-1 text-xs font-bold">{ALBUM_COVER_FONT_OPTIONS.find((font) => font.value === titleFontStyle)?.label || titleFontStyle}</span></button>
                <label className="text-[10px] font-black uppercase text-zinc-500 space-y-1"><span>Artist position preset</span><select value={artistPosition} onChange={(e) => { const next = e.target.value as typeof artistPosition; setArtistPosition(next); setArtistAnchor(defaultAlbumCoverAnchor(next)); }} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs normal-case text-white"><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="center">Center</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select></label>
                <button type="button" onClick={() => setFontPickerRole('artist')} className={`text-left rounded-xl border px-3 py-2 ${fontPickerRole === 'artist' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 bg-zinc-950'}`}><span className="block text-[10px] font-black uppercase text-zinc-500">Artist font</span><span className="block mt-1 text-xs font-bold">{ALBUM_COVER_FONT_OPTIONS.find((font) => font.value === artistFontStyle)?.label || artistFontStyle}</span></button>
              </div>
              <FontPicker
                role={fontPickerRole}
                value={fontPickerRole === 'title' ? titleFontStyle : artistFontStyle}
                text={fontPickerRole === 'title' ? (titleInput || 'Album Title') : (artistInput || 'Artist Name')}
                size={fontPickerRole === 'title' ? titleSize : artistSize}
                color={fontPickerRole === 'title' ? titleColor : artistColor}
                onChange={(font) => fontPickerRole === 'title' ? setTitleFontStyle(font as typeof titleFontStyle) : setArtistFontStyle(font as typeof artistFontStyle)}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="text-[10px] font-black uppercase text-zinc-500">Title size<input type="number" min={24} max={180} value={titleSize} onChange={(e) => setTitleSize(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-white" /></label>
                <label className="text-[10px] font-black uppercase text-zinc-500">Title color<input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-zinc-800 bg-zinc-950 p-1" /></label>
                <label className="text-[10px] font-black uppercase text-zinc-500">Artist size<input type="number" min={24} max={180} value={artistSize} onChange={(e) => setArtistSize(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-white" /></label>
                <label className="text-[10px] font-black uppercase text-zinc-500">Artist color<input type="color" value={artistColor} onChange={(e) => setArtistColor(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-zinc-800 bg-zinc-950 p-1" /></label>
              </div>
              {generation && selectedVariation && (
                <div className="rounded-2xl border border-orange-500/20 bg-zinc-950 p-3 space-y-3">
                  <div><p className="text-xs font-black">Drag typography on cover</p><p className="text-[10px] text-zinc-500 mt-1">Drag title or artist with mouse, touch, or pen. Apply saves exact normalized X/Y positions without rerunning FLUX.</p></div>
                  <div ref={coverEditorRef} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-900 touch-none select-none">
                    <img src={absoluteAlbumCoverUrl(selectedVariation.image_url)} alt="Typography positioning preview" draggable={false} className="absolute inset-0 h-full w-full object-cover pointer-events-none" />
                    {showTitle && titleInput.trim() && <button type="button" onPointerDown={(event) => startTextDrag('title', event)} onPointerMove={(event) => moveTextDrag('title', event)} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} style={{ ...albumCoverAnchorStyle(titleAnchor), transform: 'translate(-50%, -50%)', color: titleColor, fontSize: `${Math.max(16, titleSize * 0.22)}px`, lineHeight: 1.05 }} className="absolute max-w-[88%] cursor-move rounded-md border border-orange-400/70 bg-black/25 px-2 py-1 text-center font-black shadow-lg backdrop-blur-[1px]">{titleInput}</button>}
                    {showArtist && artistInput.trim() && <button type="button" onPointerDown={(event) => startTextDrag('artist', event)} onPointerMove={(event) => moveTextDrag('artist', event)} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} style={{ ...albumCoverAnchorStyle(artistAnchor), transform: 'translate(-50%, -50%)', color: artistColor, fontSize: `${Math.max(13, artistSize * 0.22)}px`, lineHeight: 1.05 }} className="absolute max-w-[88%] cursor-move rounded-md border border-white/60 bg-black/25 px-2 py-1 text-center font-bold shadow-lg backdrop-blur-[1px]">{artistInput}</button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[9px] text-zinc-500"><span>Title: {Math.round(titleAnchor.x * 100)}%, {Math.round(titleAnchor.y * 100)}%</span><span>Artist: {Math.round(artistAnchor.x * 100)}%, {Math.round(artistAnchor.y * 100)}%</span></div>
                </div>
              )}

              <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 cursor-pointer"><input type="checkbox" checked={parentalAdvisory} onChange={(event) => setParentalAdvisory(event.target.checked)} className="w-5 h-5 accent-orange-500" /><span className="text-sm font-bold">Parental Advisory (manual — default Off)</span></label>
              {generation && <button type="button" onClick={handleApplyTextChanges} disabled={busy} className="w-full rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-[10px] font-black uppercase text-orange-300 disabled:opacity-50">Apply text changes — no rerender</button>}
            </div>

            <label className="block rounded-2xl border border-dashed border-zinc-800 bg-black p-4 cursor-pointer hover:border-orange-500/40">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Artist / character reference</p><p className="text-[10px] text-zinc-600">Optional. Guides appearance and styling; exact facial identity may vary with FLUX.1 Schnell.</p></div><select value={referenceType} onChange={(e) => setReferenceType(e.target.value as AlbumCoverReferenceType)} onClick={(e) => e.stopPropagation()} className="rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-2 text-[10px] text-white"><option value="artist">Artist</option><option value="character">Character</option><option value="style">Style</option></select></div>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-xs text-zinc-500 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" onChange={(e) => setReferenceImage(e.target.files?.[0] || null)} />
              {referenceImage && <p className="text-[10px] text-orange-300 mt-2">Reference: {referenceImage.name}</p>}
            </label>

            <label className="block rounded-2xl border border-dashed border-zinc-800 bg-black p-4 cursor-pointer hover:border-zinc-700">
              <div className="flex items-center gap-3">
                <FileAudio className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="text-sm font-bold">MP3 audio</p>
                  <p className="text-[10px] text-zinc-600">{autoLoadedAudio && audioFile
                    ? `Auto-loaded EZ-WAY MP3: ${audioFile.name}`
                    : audioFile?.name || (selectedTrack?.file_url || selectedTrack?.file_data ? 'Loading selected EZ-WAY track MP3…' : 'Choose an MP3 file.')}</p>
                </div>
              </div>
              <input type="file" accept="audio/mpeg,.mp3" className="mt-3 block w-full text-xs text-zinc-500 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" onChange={(event) => { setAudioFile(event.target.files?.[0] || null); setAutoLoadedAudio(false); }} />
            </label>

            <label className="block rounded-2xl border border-dashed border-zinc-800 bg-black p-4 cursor-pointer hover:border-zinc-700">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-orange-500" />
                <div><p className="text-sm font-bold">Lyrics text file</p><p className="text-[10px] text-zinc-600">{lyricsFile?.name || 'Optional .txt lyrics file'}</p></div>
              </div>
              <input type="file" accept="text/plain,.txt" className="mt-3 block w-full text-xs text-zinc-500 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" onChange={(event) => setLyricsFile(event.target.files?.[0] || null)} />
            </label>

            <label className="space-y-2 block text-xs font-bold text-zinc-400">
              <span>Or paste lyrics</span>
              <textarea value={lyricsText} onChange={(event) => { setLyricsText(event.target.value); setAutoLoadedLyrics(false); }} rows={10} placeholder="Paste lyrics here…" className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-orange-500 resize-y" />
              {autoLoadedLyrics && <p className="text-[10px] font-bold text-emerald-400">Auto-loaded saved lyrics from the selected EZ-WAY track.</p>}
            </label>

            <div className="rounded-3xl border border-orange-500/20 bg-orange-500/[0.04] p-4 space-y-4">
              <div>
                <div className="flex items-center gap-2"><WandSparkles className="w-4 h-4 text-orange-500" /><h3 className="text-sm font-black">Creative Control</h3></div>
                <p className="text-[10px] text-zinc-500 mt-1">Subject / Scene, style, composition, color, required details, and exclusions are sent ahead of the song brief so FLUX sees them first.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500"><span>Primary subject</span><input value={subjectHint} onChange={(event) => setSubjectHint(event.target.value)} maxLength={300} placeholder="e.g. woman in a red suit" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500" /></label>
                <label className="space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500"><span>Scene / setting</span><input value={sceneHint} onChange={(event) => setSceneHint(event.target.value)} maxLength={300} placeholder="e.g. empty theater stage" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500" /></label>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500"><span>Style</span><select value={stylePreset} onChange={(event) => setStylePreset(event.target.value as NonNullable<AlbumCoverCreativeControls['stylePreset']>)} className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500"><option value="auto">Auto</option><option value="photo">Photo</option><option value="cinematic">Cinematic</option><option value="illustration">Illustration</option><option value="painting">Painting</option><option value="collage">Collage</option><option value="minimal">Minimal</option></select></label>
                <label className="space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500"><span>Composition</span><select value={compositionPreset} onChange={(event) => setCompositionPreset(event.target.value as NonNullable<AlbumCoverCreativeControls['compositionPreset']>)} className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500"><option value="auto">Auto</option><option value="close-up">Close-up</option><option value="portrait">Portrait</option><option value="wide">Wide scene</option><option value="centered">Centered</option><option value="off-center">Off-center</option><option value="minimal">Minimal</option></select></label>
              </div>
              <label className="space-y-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500"><span>Color / mood</span><input value={colorMood} onChange={(event) => setColorMood(event.target.value)} maxLength={200} placeholder="e.g. warm amber, deep shadows, restrained red" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500" /></label>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500"><span>Must include</span><textarea value={mustInclude} onChange={(event) => setMustInclude(event.target.value)} rows={2} maxLength={500} placeholder="Objects, wardrobe, symbols, details…" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500 resize-y" /></label>
                <label className="space-y-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500"><span>Avoid</span><textarea value={avoid} onChange={(event) => setAvoid(event.target.value)} rows={2} maxLength={500} placeholder="Cars, city streets, neon, faces…" className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs normal-case tracking-normal font-medium text-white outline-none focus:border-orange-500 resize-y" /></label>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">Creative strength</p>
                <div className="grid grid-cols-3 gap-2">{(['loose', 'balanced', 'strict'] as const).map((strength) => <button key={strength} type="button" onClick={() => setCreativeStrength(strength)} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${creativeStrength === strength ? 'border-orange-500 bg-orange-500 text-black' : 'border-zinc-800 bg-black text-zinc-400'}`}>{strength}</button>)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black px-4 py-3"><p className="text-xs font-black">6 finished covers</p><p className="text-[10px] text-zinc-600 mt-1">3 distinct Creative Director concepts × 2 FLUX executions. No AI winner — you choose.</p></div>

            {!configured && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100">Set <code>VITE_ALBUM_COVER_API_URL</code> to the deployed EZ AI Album Cover Studio backend before generating real covers.</div>}
            {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
            {statusText && <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-xs text-zinc-300">{statusText}</div>}

            <button onClick={handleGenerate} disabled={busy || !configured} className="w-full h-14 rounded-2xl bg-orange-500 text-black text-xs font-black uppercase tracking-[0.16em] hover:bg-orange-400 disabled:opacity-40 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? 'Processing…' : 'Analyze and generate'}
            </button>
          </section>

          <section className="rounded-[2rem] border border-zinc-900 bg-zinc-950 p-5 sm:p-6 min-h-[620px]">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-8 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 flex items-center justify-center text-xs font-black">02</span>
              <h2 className="text-xl font-black">Generated directions</h2>
            </div>

            {!generation && <div className="min-h-[500px] rounded-3xl border border-dashed border-zinc-900 bg-black/40 flex items-center justify-center text-center p-8"><div><ImageIcon className="w-12 h-12 text-zinc-800 mx-auto mb-4" /><p className="text-zinc-600">Your generated cover variations will appear here.</p></div></div>}

            {generation && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="rounded-full border border-zinc-800 bg-black px-3 py-1.5 text-[10px] font-black">Version {generation.version}</span>
                  <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase ${statusClass(generation.status)}`}>{generation.status.replaceAll('_', ' ')}</span>
                  {generation.cache_hit && <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black text-blue-300">cache hit</span>}
                  {generation.title && <span className="rounded-full border border-zinc-800 bg-black px-3 py-1.5 text-[10px] text-zinc-400">Title: <strong className="text-white">{generation.title}</strong></span>}
                  {generation.artist && <span className="rounded-full border border-zinc-800 bg-black px-3 py-1.5 text-[10px] text-zinc-400">Artist: <strong className="text-white">{generation.artist}</strong></span>}
                </div>

                {analysis && (
                  <div className="rounded-3xl border border-zinc-800 bg-black p-5">
                    <h3 className="text-sm font-black mb-4">Detected signal</h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {audioAnalysis && <>
                        <Metric label="BPM" value={asNumber(audioAnalysis.tempo_bpm, 1)} note={confidence(audioAnalysis.tempo_confidence)} />
                        <Metric label="Key" value={`${displayValue(audioAnalysis.key)} ${displayValue(audioAnalysis.scale)}`.replace('—', '').trim() || '—'} note={confidence(audioAnalysis.key_confidence)} />
                        <Metric label="Energy" value={`${Math.round(Number(audioAnalysis.energy || 0) * 100)}%`} note={displayValue(audioAnalysis.mood)} />
                        <Metric label="Genre / style" value={displayValue(audioAnalysis.inferred_genre)} note={confidence(audioAnalysis.genre_confidence)} />
                        <Metric label="Audio mood" value={displayValue(audioAnalysis.mood)} note={confidence(audioAnalysis.mood?.confidence)} />
                        <Metric label="Loudness" value={`${asNumber(audioAnalysis.loudness_dbfs, 1)} dBFS`} note={`dynamic range ${asNumber(audioAnalysis.dynamic_range_db, 1)} dB`} />
                      </>}
                      {lyricAnalysis && <>
                        <Metric label="Lyric mood" value={displayValue(lyricAnalysis.mood)} note={confidence(lyricAnalysis.mood?.confidence)} />
                        <Metric label="Themes" value={displayValue(lyricAnalysis.themes)} />
                        <Metric label="Lyric tone" value={displayValue(lyricAnalysis.tone || lyricAnalysis.sentiment)} />
                      </>}
                    </div>
                  </div>
                )}

                {conflictData && generation.status === 'needs_mood_choice' && (
                  <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5">
                    <div className="flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" /><div><h3 className="font-black">Music and lyrics point in different directions</h3><p className="text-sm text-amber-100/70 mt-1">{String(conflictData.reason || 'Choose the creative path to continue.')}</p></div></div>
                    <div className="grid sm:grid-cols-2 gap-3 mt-4">
                      <PathChoice label={String(conflictData.audio_path?.label || 'Follow audio')} description={String(conflictData.audio_path?.description || 'Use the music signal as the dominant mood.')} disabled={busy} onClick={() => handlePath('audio', 'generate')} />
                      <PathChoice label={String(conflictData.lyrics_path?.label || 'Follow lyrics')} description={String(conflictData.lyrics_path?.description || 'Use the lyric signal as the dominant mood.')} disabled={busy} onClick={() => handlePath('lyrics', 'generate')} />
                    </div>
                  </div>
                )}

                {lastError && (
                  <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div><p className="font-black text-red-200">{String(lastError.code || 'Generation error')}</p><p className="text-sm text-red-200/70 mt-1">{String(lastError.message || 'A pipeline step failed.')}</p></div>
                    <button onClick={handleRetry} disabled={busy} className="rounded-xl border border-red-400/30 bg-black/30 px-4 py-2 text-xs font-black text-red-100 disabled:opacity-50">Retry failed step</button>
                  </div>
                )}

                {latestSet && (
                  <>
                    <div className="rounded-3xl border border-zinc-800 bg-black p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div><p className="text-[10px] uppercase tracking-widest text-zinc-600">Variation set {latestSet.set_number}</p><p className="font-black mt-1 capitalize">{latestSet.mood_path}-driven</p></div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={handleGenerateBetter} disabled={busy || !selectedVariation} className="rounded-xl bg-orange-500 px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50">{selectedVariation ? 'Generate Better from Selected' : 'Select a cover to improve'}</button>
                        {generation.has_audio && generation.has_lyrics && <button onClick={() => handlePath('blend')} disabled={busy} className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-[10px] font-black disabled:opacity-50">Fresh blend</button>}
                        {generation.has_audio && <button onClick={() => handlePath('audio')} disabled={busy} className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-[10px] font-black disabled:opacity-50">Fresh audio path</button>}
                        {generation.has_lyrics && <button onClick={() => handlePath('lyrics')} disabled={busy} className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-[10px] font-black disabled:opacity-50">Fresh lyric path</button>}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {variations.map((variation) => {
                        const isSelected = variation.id === selectedVariationId || variation.selected;
                        return (
                          <article key={variation.id} className={`rounded-3xl border overflow-hidden bg-black transition-all ${isSelected ? 'border-orange-500 shadow-lg shadow-orange-500/10' : 'border-zinc-800'}`}>
                            <div className="relative aspect-square bg-zinc-900">
                              <img src={absoluteAlbumCoverUrl(variation.image_url)} alt={`Album cover variation ${variation.position}`} className="w-full h-full object-cover" />
                              {isSelected && <span className="absolute top-3 right-3 rounded-full bg-orange-500 px-3 py-1.5 text-[10px] font-black text-black flex items-center gap-1"><Check className="w-3 h-3" />Selected</span>}
                            </div>
                            <div className="p-4 space-y-3">
                              <div><p className="font-black">{variation.concept_name || `Cover ${variation.position}`}</p><p className="text-[10px] text-zinc-600 mt-1">Cover {variation.position} · {variation.width}×{variation.height} · equal choice</p></div>
                              <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleSelectVariation(variation)} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[10px] font-black">{isSelected ? 'Selected' : 'Select'}</button>
                                <button onClick={() => handleDownload(variation)} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[10px] font-black flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" />Download</button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {selectedTrack && selectedVariation && (
                      <button onClick={handleSaveToTrack} disabled={saving} className="w-full h-14 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save to EZ-WAY Track
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-[2rem] border border-zinc-900 bg-zinc-950 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div className="flex items-center gap-3"><span className="w-8 h-8 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 flex items-center justify-center text-xs font-black">03</span><h2 className="text-xl font-black">Studio metrics</h2></div>
            <button onClick={() => refreshCollection()} disabled={!configured || historyBusy} className="rounded-xl border border-zinc-800 bg-black px-4 py-2 text-[10px] font-black text-zinc-400 flex items-center gap-2 disabled:opacity-40"><RefreshCcw className={`w-3.5 h-3.5 ${historyBusy ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
          {!metrics ? <p className="text-sm text-zinc-600">Metrics will appear after your first generation.</p> : <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3"><Metric label="Versions" value={metrics.versions} /><Metric label="Variation sets" value={metrics.variation_sets} /><Metric label="Covers generated" value={metrics.covers_generated} /><Metric label="Success rate" value={`${Math.round(metrics.success_rate * 100)}%`} /><Metric label="Avg cover score" value={metrics.average_cover_score == null ? '—' : asNumber(metrics.average_cover_score, 1)} /><Metric label="Release ready" value={metrics.release_ready_covers} /><Metric label="Selected covers" value={metrics.selected_covers} /><Metric label="Critic completion" value={`${Math.round(metrics.critic_completion_rate * 100)}%`} /><Metric label="Retries" value={metrics.retries} /><Metric label="Failed steps" value={metrics.failed_steps} /><Metric label="Cache hits" value={metrics.cache_hits} /><Metric label="Best cover score" value={metrics.best_cover_score == null ? '—' : asNumber(metrics.best_cover_score, 1)} /></div>}
          {metrics?.quality_trend?.length ? <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-4"><div className="flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4 text-orange-500" /><p className="text-xs font-black">Quality trend</p></div><div className="flex gap-2 overflow-x-auto pb-1">{metrics.quality_trend.map((point) => <div key={`${point.version}-${point.set_number}`} className="min-w-[120px] rounded-2xl border border-zinc-900 bg-zinc-950 p-3"><p className="text-[9px] text-zinc-600">v{point.version} · set {point.set_number}</p><p className="text-lg font-black mt-1">{point.winner_score == null ? '—' : asNumber(point.winner_score, 1)}</p><p className="text-[9px] text-zinc-600">set score</p></div>)}</div></div> : null}
        </section>

        <section className="rounded-[2rem] border border-zinc-900 bg-zinc-950 p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-5"><span className="w-8 h-8 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 flex items-center justify-center text-xs font-black">04</span><h2 className="text-xl font-black">Input versions</h2></div>
          {!history.length ? <p className="text-sm text-zinc-600">No historical versions yet.</p> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{history.map((version) => {
            const source = version.has_audio && version.has_lyrics ? 'Audio + lyrics' : version.has_audio ? 'Audio' : 'Lyrics';
            const release = [version.artist, version.title].filter(Boolean).join(' — ') || source;
            return <button key={version.id} onClick={() => openHistoryVersion(version.id)} disabled={busy} className="text-left rounded-2xl border border-zinc-800 bg-black p-4 hover:border-orange-500/50 disabled:opacity-50"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black text-orange-400">v{version.version}</span><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${statusClass(version.status)}`}>{version.status.replaceAll('_', ' ')}</span></div><p className="font-black mt-2 truncate">{release}</p><p className="text-[10px] text-zinc-600 mt-1">{version.variation_sets.length} variation set(s) · {source}</p></button>;
          })}</div>}
        </section>
      </div>
    </div>
  );
}


function FontPicker({ role, value, text, size, color, onChange }: { role: 'title' | 'artist'; value: string; text: string; size: number; color: string; onChange: (font: string) => void }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-3 mb-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{role} font previews</p><p className="text-[9px] text-zinc-600 mt-1">Previewing your actual {role} text. Click a tile to choose.</p></div><span className="text-[9px] text-orange-300">{ALBUM_COVER_FONT_OPTIONS.length} fonts</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
        {ALBUM_COVER_FONT_OPTIONS.map((font) => {
          const active = font.value === value;
          const previewUrl = albumCoverFontPreviewUrl(absoluteAlbumCoverUrl('/'), { fontStyle: font.value, text, size: Math.max(36, Math.min(88, size)), color });
          return <button key={`${role}-${font.value}`} type="button" onClick={() => onChange(font.value)} className={`overflow-hidden rounded-xl border text-left transition ${active ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 bg-black hover:border-zinc-600'}`}><div className="h-16 flex items-center justify-center bg-zinc-900/80 p-1">{previewUrl ? <img src={previewUrl} alt={`${font.label} preview`} loading="lazy" className="max-h-full max-w-full object-contain" /> : <span className="text-xs">{text}</span>}</div><div className="px-2 py-1.5"><span className="block truncate text-[9px] font-black">{font.label}</span><span className="text-[8px] text-zinc-600">{font.group === 'Custom' ? 'Custom Font' : 'Built-in'}</span></div></button>;
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, note = '' }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="text-sm font-black mt-1 break-words">{value}</p>
      {note && <p className="text-[9px] text-zinc-600 mt-1">{note}</p>}
    </div>
  );
}

function PathChoice({ label, description, disabled, onClick }: { label: string; description: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className="text-left rounded-2xl border border-amber-400/20 bg-black/20 p-4 hover:border-amber-300/50 disabled:opacity-50">
      <strong className="block text-sm">{label}</strong>
      <span className="block text-xs text-amber-100/60 mt-1">{description}</span>
    </button>
  );
}

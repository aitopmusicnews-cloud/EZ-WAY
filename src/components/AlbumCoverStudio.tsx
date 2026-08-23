import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Save,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import { buildAlbumCoverDraft, type AlbumCoverDraft } from '../services/albumCoverCore';
import {
  absoluteAlbumCoverUrl,
  createAlbumCoverGeneration,
  downloadAlbumCover,
  isAlbumCoverStudioConfigured,
  latestAlbumCoverVariations,
  regenerateAlbumCovers,
  selectAlbumCoverVariation,
  waitForAlbumCoverGeneration,
  type AlbumCoverGeneration,
  type AlbumCoverVariation,
} from '../services/albumCoverStudio';
import { ALBUM_COVER_FONTS, buildAlbumCoverTitleUpdate } from '../services/albumCoverTitleFont';
import { getTrackMusicIntelligence } from '../services/musicIntelligence';
import { canUsePremiumFeature } from '../services/premiumFeatures';

interface AlbumCoverStudioProps {
  initialTrackId?: string | null;
  onClearInitialTrackId?: () => void;
}

const safeCoverFileName = (title: string): string => (
  `${title || 'album-cover'}-cover.png`.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-')
);

export default function AlbumCoverStudio({ initialTrackId, onClearInitialTrackId }: AlbumCoverStudioProps = {}) {
  const { tracks, updateTrack, uploadFile, addToast } = useMediaStore();
  const [selectedTrackId, setSelectedTrackId] = useState(initialTrackId || '');
  const [draft, setDraft] = useState<AlbumCoverDraft | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [parentalAdvisory, setParentalAdvisory] = useState(false);
  const [generation, setGeneration] = useState<AlbumCoverGeneration | null>(null);
  const [selectedVariationId, setSelectedVariationId] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingTitle, setUpdatingTitle] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const enabled = canUsePremiumFeature('albumcover-studio');
  const configured = isAlbumCoverStudioConfigured();
  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) || null,
    [tracks, selectedTrackId],
  );
  const variations = useMemo(() => latestAlbumCoverVariations(generation), [generation]);
  const titleDirty = Boolean(selectedTrack && titleInput.trim() !== String(selectedTrack.name || '').trim());

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
    if (!selectedTrack) {
      setDraft(null);
      setTitleInput('');
      return () => { cancelled = true; };
    }

    setTitleInput(selectedTrack.name || '');
    setLoadingProfile(true);
    getTrackMusicIntelligence(selectedTrack.id)
      .catch(() => null)
      .then((profile) => {
        if (!cancelled) setDraft(buildAlbumCoverDraft(selectedTrack, profile));
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => { cancelled = true; };
  }, [selectedTrack]);

  const finishGeneration = async (queued: AlbumCoverGeneration) => {
    if (['complete', 'partial', 'analysis_failed', 'image_failed', 'needs_mood_choice'].includes(queued.status)) {
      return queued;
    }
    return waitForAlbumCoverGeneration(queued.id, {
      onPoll: (current) => {
        setGeneration(current);
        setStatusText(`Creating cover options… ${current.status.replace(/_/g, ' ')}`);
      },
    });
  };

  const handleUpdateTitle = async () => {
    if (!selectedTrack || updatingTitle) return;
    setUpdatingTitle(true);
    setError('');
    try {
      const payload = buildAlbumCoverTitleUpdate(titleInput);
      await updateTrack(selectedTrack.id, payload);
      setTitleInput(payload.name);
      setDraft((current) => current ? { ...current, title: payload.name } : current);
      setStatusText(`Track title updated to “${payload.name}”. New covers will use this title.`);
      addToast(`Updated track title to “${payload.name}”`, 'success');
    } catch (caught: any) {
      const message = caught?.message || 'Track title could not be updated.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setUpdatingTitle(false);
    }
  };

  const handleGenerate = async () => {
    if (!draft || generating || titleDirty) return;
    setGenerating(true);
    setError('');
    setSelectedVariationId('');
    setStatusText('Sending saved track intelligence to Albumcover Studio…');
    try {
      const queued = await createAlbumCoverGeneration(draft, parentalAdvisory);
      setGeneration(queued);
      const completed = await finishGeneration(queued);
      setGeneration(completed);
      const options = latestAlbumCoverVariations(completed);
      if (!options.length) {
        const backendMessage = completed.last_error ? JSON.stringify(completed.last_error) : '';
        throw new Error(backendMessage || `Cover generation ended with status: ${completed.status}.`);
      }
      setSelectedVariationId(options[0].id);
      setStatusText('Three cover options are ready. Pick one to save to the track.');
      addToast(`Generated cover options for “${draft.title}”`, 'success');
    } catch (caught: any) {
      const message = caught?.message || 'Album cover generation failed.';
      setError(message);
      setStatusText('');
      addToast(message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!generation || generating) return;
    setGenerating(true);
    setError('');
    setSelectedVariationId('');
    setStatusText('Creating three fresh cover options…');
    try {
      const queued = await regenerateAlbumCovers(generation.id);
      const completed = await finishGeneration(queued);
      setGeneration(completed);
      const options = latestAlbumCoverVariations(completed);
      if (!options.length) throw new Error(`Fresh cover generation ended with status: ${completed.status}.`);
      setSelectedVariationId(options[0].id);
      setStatusText('Fresh cover options are ready.');
    } catch (caught: any) {
      const message = caught?.message || 'Fresh cover generation failed.';
      setError(message);
      setStatusText('');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveCover = async () => {
    if (!selectedTrack || !selectedVariationId || saving) return;
    const variation = variations.find((item) => item.id === selectedVariationId);
    if (!variation) return;

    setSaving(true);
    setError('');
    try {
      await selectAlbumCoverVariation(variation.id);
      const blob = await downloadAlbumCover(variation);
      const file = new File([blob], safeCoverFileName(selectedTrack.name), { type: blob.type || 'image/png' });
      const uploadedUrl = await uploadFile('artwork', file);
      if (!uploadedUrl) throw new Error('The generated cover could not be saved to EZ-WAY artwork storage.');
      await updateTrack(selectedTrack.id, {
        image_url: uploadedUrl,
        image_data: file,
      });
      addToast(`Saved new cover art to “${selectedTrack.name}”`, 'success');
      setStatusText('Cover saved to the track and ready for Videos, Sharing, and YouTube workflows.');
    } catch (caught: any) {
      const message = caught?.message || 'The selected cover could not be saved.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) {
    return (
      <div className="min-h-full p-8 text-white">
        <div className="max-w-3xl mx-auto rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
          <WandSparkles className="w-12 h-12 text-orange-500 mx-auto mb-5" />
          <h1 className="text-2xl font-black uppercase tracking-tight">EZ AI Albumcover Studio</h1>
          <p className="text-zinc-500 mt-3">This premium feature is not enabled for this account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-black text-white p-5 sm:p-8 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-7">
        <div>
          <div className="flex items-center gap-3 text-orange-500 mb-2"><WandSparkles className="w-6 h-6" /><span className="text-[10px] font-black uppercase tracking-[0.25em]">EZ AI</span></div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">Albumcover Studio</h1>
          <p className="text-zinc-500 mt-2 max-w-3xl">Select a track, edit its saved title if needed, and generate covers from the Music Intelligence already stored in EZ-WAY. The Font Library shows the typography treatments EZ AI can apply automatically. No second song analysis is required.</p>
        </div>

        <div className="grid xl:grid-cols-[.72fr_1.28fr] gap-6">
          <section className="rounded-3xl border border-zinc-900 bg-zinc-950 p-6 space-y-6 h-fit">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Select Track</label>
              <select value={selectedTrackId} onChange={(event) => setSelectedTrackId(event.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3.5 text-sm text-white outline-none focus:border-orange-500">
                <option value="">Choose a library track…</option>
                {tracks.map((track) => <option key={track.id} value={track.id}>{track.name} — {track.artist || 'Unknown Artist'}</option>)}
              </select>
            </div>

            {selectedTrack && (
              <div className="flex gap-4 items-center rounded-2xl border border-zinc-800 bg-black p-4">
                <div className="w-20 h-20 rounded-xl bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center">
                  {selectedTrack.image_url ? <img src={selectedTrack.image_url} alt="Current cover" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-zinc-700" />}
                </div>
                <div className="min-w-0"><p className="font-black truncate">{selectedTrack.name}</p><p className="text-xs text-zinc-500 truncate mt-1">{selectedTrack.artist || 'Unknown Artist'}</p><p className="text-[9px] uppercase tracking-widest text-zinc-700 mt-2">{selectedTrack.image_url ? 'Current artwork' : 'No cover art'}</p></div>
              </div>
            )}

            {selectedTrack && (
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Edit Track Title</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                    className="min-w-0 flex-1 rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-orange-500"
                    placeholder="Track title"
                  />
                  <button
                    onClick={handleUpdateTitle}
                    disabled={!titleDirty || updatingTitle || !titleInput.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:border-orange-500 disabled:opacity-40"
                  >
                    {updatingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Update Track Title
                  </button>
                </div>
                {titleDirty && <p className="text-[10px] text-amber-300">Save the title before generating so EZ-WAY and the cover stay in sync.</p>}
              </div>
            )}

            {loadingProfile && <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading saved Music Intelligence…</div>}

            {draft && !loadingProfile && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {[draft.genre, draft.mood, draft.style, draft.bpm ? `${draft.bpm} BPM` : '', draft.key].filter(Boolean).map((item) => <span key={String(item)} className="rounded-full border border-zinc-800 bg-black px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">{item}</span>)}
                </div>
                {draft.instruments.length > 0 && <p className="text-xs text-zinc-500"><span className="text-zinc-300 font-bold">Instruments:</span> {draft.instruments.join(', ')}</p>}
                {draft.keywords.length > 0 && <p className="text-xs text-zinc-500"><span className="text-zinc-300 font-bold">Keywords:</span> {draft.keywords.join(', ')}</p>}

                <div className="space-y-2">
                  <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Font Library</p><p className="text-[10px] text-zinc-600 mt-1">Reference only. EZ AI automatically chooses a genre-aware lettering treatment for each cover.</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    {ALBUM_COVER_FONTS.map((font) => (
                      <div key={font.id} className="rounded-2xl border border-zinc-800 bg-black px-3 py-3">
                        <span className="block text-[9px] uppercase tracking-wider text-zinc-600">{font.category}</span>
                        <span className="block mt-1 text-base text-white truncate" style={{ fontFamily: font.previewFamily, fontStyle: font.id.includes('italic') ? 'italic' : 'normal', fontWeight: 600 }}>{font.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black p-4 cursor-pointer"><div><p className="text-sm font-bold">Parental Advisory</p><p className="text-[10px] text-zinc-600 mt-1">Add the exact advisory label after artwork generation.</p></div><input type="checkbox" checked={parentalAdvisory} onChange={(event) => setParentalAdvisory(event.target.checked)} className="w-5 h-5 accent-orange-500" /></label>

                {!configured && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">Set <code>VITE_ALBUM_COVER_API_URL</code> to the deployed EZ AI Albumcover Studio backend before generating real covers.</div>}
                {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
                {statusText && <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-xs text-zinc-300">{statusText}</div>}

                <button onClick={handleGenerate} disabled={!configured || generating || titleDirty} className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 text-xs font-black uppercase tracking-widest text-black hover:bg-orange-400 disabled:opacity-40">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'Generating…' : 'Generate 3 Covers'}
                </button>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-zinc-900 bg-zinc-950 p-5 sm:p-7 min-h-[520px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"><div><h2 className="text-lg font-black uppercase tracking-tight">Cover Options</h2><p className="text-xs text-zinc-600 mt-1">Generated choices never replace the track artwork until you save one.</p></div>{generation && <button onClick={handleRegenerate} disabled={generating} className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:border-orange-500 disabled:opacity-40"><RefreshCcw className="w-3.5 h-3.5" /> Generate New Options</button>}</div>

            {variations.length > 0 ? (
              <>
                <div className="grid md:grid-cols-3 gap-4">
                  {variations.map((variation: AlbumCoverVariation) => {
                    const selected = variation.id === selectedVariationId;
                    return (
                      <button key={variation.id} onClick={() => setSelectedVariationId(variation.id)} className={`relative overflow-hidden rounded-2xl border text-left transition ${selected ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-zinc-800 hover:border-zinc-600'}`}>
                        <div className="aspect-square bg-zinc-900"><img src={absoluteAlbumCoverUrl(variation.image_url)} alt={variation.concept_name || `Cover option ${variation.position}`} className="w-full h-full object-cover" /></div>
                        <div className="p-3 bg-black"><p className="text-xs font-bold truncate">{variation.concept_name || `Cover Option ${variation.position}`}</p><p className="text-[9px] text-zinc-600 mt-1">3000×3000 PNG</p></div>
                        {selected && <span className="absolute top-3 right-3 w-8 h-8 rounded-full bg-orange-500 text-black flex items-center justify-center"><Check className="w-4 h-4" /></span>}
                      </button>
                    );
                  })}
                </div>
                <button onClick={handleSaveCover} disabled={!selectedVariationId || saving} className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-xs font-black uppercase tracking-widest text-black hover:bg-zinc-200 disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving Cover…' : 'Save Cover to Track'}
                </button>
              </>
            ) : (
              <div className="min-h-[390px] flex flex-col items-center justify-center text-center text-zinc-700"><ImageIcon className="w-14 h-14 mb-5" /><p className="font-bold text-zinc-500">Your three cover choices will appear here.</p><p className="text-xs mt-2 max-w-sm">Pick a track on the left, review the automatically loaded creative data, then generate.</p></div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

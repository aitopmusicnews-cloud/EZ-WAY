import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, Loader2 } from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import { loadTrackAudioFile, refreshTrackAudioSource } from '../services/trackAudioSource';
import { musicVideoFilename, validateMusicVideoFiles } from '../services/musicVideoCommand';

interface MusicVideoMakerProps {
  initialTrackId?: string;
  onClearInitialTrackId?: () => void;
}

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export default function SimpleMusicVideoMaker({ initialTrackId, onClearInitialTrackId }: MusicVideoMakerProps = {}) {
  const { tracks, addPromoVideo } = useMediaStore();
  const [image, setImage] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [trackId, setTrackId] = useState(initialTrackId || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const imageUrl = useObjectUrl(image);
  const audioUrl = useObjectUrl(audio);
  const videoUrl = useObjectUrl(result?.blob || null);

  useEffect(() => {
    if (initialTrackId) { setTrackId(initialTrackId); setAudio(null); }
  }, [initialTrackId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  const convert = async () => {
    if (!image || busy) return;
    const job = new AbortController();
    controller.current = job;
    setBusy(true); setError(''); setResult(null);
    try {
      setStatus('Preparing audio…');
      const track = tracks.find(item => item.id === trackId);
      const source = audio || (track ? await loadTrackAudioFile(await refreshTrackAudioSource(track)) : null);
      job.signal.throwIfAborted();
      if (!source) throw new Error('Choose an MP3/WAV file or a track from your library.');
      validateMusicVideoFiles(image, source);
      const { createMusicVideo } = await import('../services/musicVideoEngine');
      job.signal.throwIfAborted();
      const blob = await createMusicVideo(image, source, message => {
        if (mounted.current && !job.signal.aborted) setStatus(message);
      }, job.signal);
      job.signal.throwIfAborted();
      const name = musicVideoFilename(source.name);
      setResult({ blob, name });
      setStatus('MP4 ready. Saving to Video Library…');
      // The library owns its own URL; revoking the preview cannot break saved playback.
      await addPromoVideo({
        id: crypto.randomUUID(), track_id: audio ? undefined : trackId || undefined,
        name, title: name, video_data: blob,
        thumbnail_data: image, thumbnail_url: URL.createObjectURL(image),
        style: 'Music Video Maker • Image + Audio', status: 'ready',
        created_at: new Date().toISOString(),
      });
      if (mounted.current) setStatus('MP4 ready and added to Video Library.');
    } catch (err) {
      if (mounted.current) {
        if (job.signal.aborted) setStatus('Conversion cancelled.');
        else { setStatus(''); setError(err instanceof Error ? err.message : 'Conversion failed. Please try again.'); }
      }
    } finally {
      if (mounted.current) setBusy(false);
      controller.current = null;
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        <div className="flex items-center gap-3"><Film className="text-orange-500" /><h2 className="text-xl font-bold">Image + song = music video</h2></div>
        <p className="text-sm text-zinc-400">Choose your artwork and audio, then create an MP4 of the full song. Your original music plays with the image throughout.</p>
        <fieldset disabled={busy} className="grid gap-6 md:grid-cols-2 disabled:opacity-60">
          <div className="space-y-3">
            <label className="block font-semibold" htmlFor="video-image">1. Choose artwork</label>
            <input id="video-image" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="block w-full text-sm" onChange={event => { setImage(event.target.files?.[0] || null); setResult(null); setError(''); }} />
            <p className="text-xs text-zinc-500">JPG or PNG · up to 20 MB</p>
            {imageUrl && <img src={imageUrl} alt="Selected video artwork" className="h-48 w-full rounded-lg bg-black object-contain" />}
          </div>
          <div className="space-y-3">
            <label className="block font-semibold" htmlFor="video-audio">2. Choose audio</label>
            <input id="video-audio" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="block w-full text-sm" onChange={event => { setAudio(event.target.files?.[0] || null); setTrackId(''); onClearInitialTrackId?.(); setResult(null); setError(''); }} />
            <p className="text-xs text-zinc-500">MP3 or WAV · up to 250 MB</p>
            <label htmlFor="video-track" className="block text-sm text-zinc-400">Or use a library track</label>
            <select id="video-track" value={trackId} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3" onChange={event => { setTrackId(event.target.value); setAudio(null); setResult(null); setError(''); onClearInitialTrackId?.(); }}>
              <option value="">Select a track</option>
              {tracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
            </select>
            {audioUrl && <audio src={audioUrl} controls className="w-full" />}
            {audio && <p className="text-xs text-zinc-400">Using: {audio.name}</p>}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || !image || (!audio && !trackId)} onClick={convert} className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-bold text-black disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Creating MP4…' : 'Create MP4'}
          </button>
          {busy && !result && <button type="button" onClick={() => controller.current?.abort()} className="rounded-full border border-zinc-700 px-5 py-3">Cancel</button>}
        </div>
        <p className="text-xs text-zinc-500">Conversion runs on this device. Keep this page open until it finishes. Large files may take longer and require more memory.</p>
        <p role="status" aria-live="polite" className="text-sm text-orange-300">{status}</p>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
      {result && videoUrl && <div className="space-y-4 rounded-2xl border border-zinc-800 p-6">
        <h3 className="font-bold">Your video is ready</h3>
        <video src={videoUrl} controls playsInline className="max-h-[480px] w-full rounded-lg bg-black" />
        <a href={videoUrl} download={result.name} className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-bold text-black"><Download className="h-4 w-4" />Download MP4</a>
      </div>}
    </div>
  );
}

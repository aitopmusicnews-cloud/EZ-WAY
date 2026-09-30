import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, Loader2 } from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import { loadTrackAudioFile, refreshTrackAudioSource } from '../services/trackAudioSource';
import { musicVideoFilename, validateMusicVideoFiles, DEFAULT_VIDEO_OPTIONS, VIDEO_PRESETS, type VideoOptions } from '../services/musicVideoCommand';

import { transcribeLyricsFile } from '../services/localLyricOptimizer';
import { formatLrcTime } from '../utils/lrcParser';
import { resolveMediaAccess } from '../services/mediaAccess';

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

export default function MusicVideoMaker({ initialTrackId, onClearInitialTrackId }: MusicVideoMakerProps = {}) {
  const { tracks, addPromoVideo, updateTrack } = useMediaStore();
  const [image, setImage] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [trackId, setTrackId] = useState(initialTrackId || '');
  const [options, setOptions] = useState<VideoOptions>({ ...DEFAULT_VIDEO_OPTIONS });
  const [includeLyrics, setIncludeLyrics] = useState(false);
  const [lyricBusy, setLyricBusy] = useState(false);
  const [outputName, setOutputName] = useState('');
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

  const activeTrack = tracks.find(item => item.id === trackId);
  useEffect(() => {
    setOptions(previous => ({ ...previous, lyrics: activeTrack?.lyrics || '' }));
  }, [trackId]);
  const setting = <K extends keyof VideoOptions>(key: K, value: VideoOptions[K]) => {
    setOptions(previous => ({ ...previous, [key]: value }));
    setResult(null);
  };
  const sourceAudio = async () => {
    if (audio) return audio;
    if (activeTrack) return loadTrackAudioFile(await refreshTrackAudioSource(activeTrack));
    throw new Error('Choose an MP3/WAV file or a library track.');
  };
  const generateLyrics = async () => {
    setLyricBusy(true); setError(''); setStatus('Generating synced lyrics…');
    try {
      const transcript = await transcribeLyricsFile(await sourceAudio());
      const lyrics = transcript.segments.map(segment => `${formatLrcTime(segment.start)} ${segment.text}`).join('\n');
      if (!lyrics.trim()) throw new Error('No synced lyrics were detected. You can import or paste an LRC file.');
      if (mounted.current) { setting('lyrics', lyrics); setIncludeLyrics(true); setStatus('Synced lyrics ready.'); }
    } catch (err) {
      if (mounted.current) { setError(err instanceof Error ? err.message : 'Could not generate lyrics.'); setStatus(''); }
    } finally { if (mounted.current) setLyricBusy(false); }
  };
  const loadArtwork = async () => {
    if (!activeTrack) return;
    setLyricBusy(true); setError('');
    try {
      let blob = activeTrack.image_data;
      if (!blob) {
        const media = await resolveMediaAccess({ objectKey: activeTrack.image_key, url: activeTrack.image_url });
        const response = await fetch(media.url);
        if (!response.ok) throw new Error('Could not load track artwork.');
        blob = await response.blob();
      }
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
      const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not read artwork.')), 'image/jpeg', .95));
      if (mounted.current) { setImage(new File([jpeg], 'track-artwork.jpg', { type: 'image/jpeg' })); setResult(null); }
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load artwork.'); }
    finally { if (mounted.current) setLyricBusy(false); }
  };
  const saveLyrics = async () => {
    if (!trackId) return;
    try { await updateTrack(trackId, { lyrics: options.lyrics }); setStatus('Lyrics saved to track.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save lyrics.'); }
  };

  const convert = async () => {
    if (!image || busy || lyricBusy) return;
    const job = new AbortController();
    controller.current = job;
    setBusy(true); setError(''); setResult(null);
    try {
      setStatus('Preparing audio…');
      const source = await sourceAudio();
      job.signal.throwIfAborted();
      if (!source) throw new Error('Choose an MP3/WAV file or a track from your library.');
      validateMusicVideoFiles(image, source);
      const { createMusicVideo } = await import('../services/musicVideoEngine');
      job.signal.throwIfAborted();
      const blob = await createMusicVideo(image, source, message => {
        if (mounted.current && !job.signal.aborted) setStatus(message);
      }, job.signal, { ...options, lyrics: includeLyrics ? options.lyrics : '' });
      job.signal.throwIfAborted();
      const name = musicVideoFilename(outputName.trim() ? `${outputName.replace(/\.mp4$/i, '')}.mp4` : source.name);
      setResult({ blob, name });
      setStatus('MP4 ready. Saving to Video Library…');
      // The library owns its own URL; revoking the preview cannot break saved playback.
      await addPromoVideo({
        id: crypto.randomUUID(), track_id: audio ? undefined : trackId || undefined,
        name, title: name, video_data: blob,
        thumbnail_data: image, thumbnail_url: URL.createObjectURL(image),
        style: `${options.lyricVideo && includeLyrics ? 'Lyric Video' : 'Music Video'} • ${VIDEO_PRESETS[options.preset].label}`, status: 'ready',
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
        <p className="text-sm text-zinc-400">Choose artwork and music, add the effects you want, and create an MP4 ready for your platform.</p>
        <fieldset disabled={busy || lyricBusy} className="grid gap-6 md:grid-cols-2 disabled:opacity-60">
          <div className="space-y-3">
            <label className="block font-semibold" htmlFor="video-image">1. Choose artwork</label>
            <input id="video-image" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="block w-full text-sm" onChange={event => { setImage(event.target.files?.[0] || null); setResult(null); setError(''); }} />
            <p className="text-xs text-zinc-500">JPG or PNG · up to 20 MB</p>
            {activeTrack && <button type="button" onClick={loadArtwork} className="text-sm text-orange-400 underline">Use this track’s artwork</button>}
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
        <fieldset disabled={busy || lyricBusy} className="space-y-4 border-t border-zinc-800 pt-5 disabled:opacity-60">
          <legend className="font-semibold">3. Customize your video</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">Social size
              <select aria-label="Social size" value={options.preset} onChange={event => setting('preset', event.target.value as VideoOptions['preset'])} className="block w-full rounded-lg bg-zinc-950 p-3">
                {Object.entries(VIDEO_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
              </select>
            </label>
            <label className="space-y-2">Duration
              <select aria-label="Duration" value={options.duration} onChange={event => setting('duration', Number(event.target.value))} className="block w-full rounded-lg bg-zinc-950 p-3">
                <option value={0}>Full song</option>{[15, 30, 60].map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
              </select>
            </label>
          </div>
          <label className="block">Output filename<input aria-label="Output filename" value={outputName} placeholder="Uses your song’s name" onChange={event => setOutputName(event.target.value)} className="mt-2 block w-full rounded-lg bg-zinc-950 p-3" /></label>
          <div className="flex flex-wrap gap-5">
            <label><input type="checkbox" checked={options.soundwave} onChange={event => setting('soundwave', event.target.checked)} /> Audio-reactive soundwave</label>
            <label><input type="checkbox" checked={options.watermark} onChange={event => setting('watermark', event.target.checked)} /> Brand watermark</label>
            <label><input type="checkbox" checked={includeLyrics} onChange={event => { setIncludeLyrics(event.target.checked); setResult(null); }} /> Synced lyrics</label>
          </div>
          {includeLyrics && <div className="space-y-3 rounded-lg bg-zinc-950 p-4">
            <label className="block">Timed lyrics (LRC)
              <textarea aria-label="Timed lyrics" rows={7} value={options.lyrics} onChange={event => setting('lyrics', event.target.value)} placeholder={'[00:05.00] Your first line\n[00:10.00] Your next line'} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm" />
            </label>
            <label className="block text-sm">Import LRC<input type="file" accept=".lrc,.txt" onChange={async event => { const file = event.target.files?.[0]; if (file) { try { setting('lyrics', await file.text()); } catch { setError('Could not read the lyrics file.'); } } }} className="mt-2 block" /></label>
            <div className="flex flex-wrap gap-4">
              <button type="button" disabled={!audio && !trackId} onClick={generateLyrics} className="text-orange-400 underline disabled:opacity-40">Generate synced lyrics</button>
              {trackId && <button type="button" onClick={saveLyrics} className="text-orange-400 underline">Save lyrics to track</button>}
            </div>
            <p className="text-xs text-zinc-500">Generate uses your configured Lyric Optimizer service. You can also paste or import timestamped lyrics.</p>
            <label className="block"><input type="checkbox" checked={options.lyricVideo} onChange={event => setting('lyricVideo', event.target.checked)} /> Large centered lyric-video layout</label>
            <label className="block">Lyric style<select aria-label="Lyric style" value={options.lyricStyle} onChange={event => setting('lyricStyle', event.target.value as VideoOptions['lyricStyle'])} className="ml-3 rounded-lg bg-zinc-900 p-2"><option value="white">White</option><option value="gradient">Gradient</option><option value="outline">Outline</option></select></label>
          </div>}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || lyricBusy || !image || (!audio && !trackId)} onClick={convert} className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-bold text-black disabled:opacity-40">
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

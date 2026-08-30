import React, { useState } from 'react';
import {
  MoreVertical,
  Edit3,
  Share2,
  Download,
  Trash2,
  Video,
  Plus,
  Check,
  Info,
  Mic2,
  SplitSquareVertical,
  Loader2,
  X,
  FileText,
  Music2,
  Sparkles,
} from 'lucide-react';
import { Track, Playlist } from '../types';
import { cn } from '../lib/utils';
import { useMediaStore } from '../context/MediaStoreContext';
import {
  AudioToolJobResult,
  StemMode,
  runAudioToolsJob,
} from '../services/audioTools';

interface TrackOptionsMenuProps {
  track: Track;
  onEdit: () => void;
  onShare: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onCreatePromo: () => void;
  onCreateVideo: () => void;
  onAddToPlaylist: (id: string) => void;
  playlists: Playlist[];
  onAnalyze?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

type AudioDialog = 'lyrics' | 'stems' | null;

export function TrackAnalyzeMenuItem({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <button
      type="button"
      onClick={onAnalyze}
      className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/10 rounded-xl transition-colors"
    >
      <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Analyze Track
    </button>
  );
}

export default function TrackOptionsMenu({
  track,
  onEdit,
  onShare,
  onDownload,
  onDelete,
  onCreatePromo,
  onCreateVideo,
  onAddToPlaylist,
  playlists,
  onAnalyze,
  onViewDetails,
  className,
}: TrackOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [audioDialog, setAudioDialog] = useState<AudioDialog>(null);
  const [stemMode, setStemMode] = useState<StemMode>('vocals_instrumental');
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [audioResult, setAudioResult] = useState<AudioToolJobResult | null>(null);
  const [audioError, setAudioError] = useState('');
  const { updateTrack } = useMediaStore();

  const openAudioDialog = (dialog: Exclude<AudioDialog, null>) => {
    setIsOpen(false);
    setAudioDialog(dialog);
    setAudioResult(null);
    setAudioError('');
    setProgressText('');
  };

  const runSyncedLyrics = async () => {
    setProcessing(true);
    setAudioError('');
    setAudioResult(null);
    setProgressText('Preparing vocal isolation…');
    try {
      const result = await runAudioToolsJob(track, 'lyrics', undefined, setProgressText);
      if (!result.lyrics?.trim()) {
        throw new Error('No reliable lyrics were detected. The existing lyrics were left unchanged.');
      }
      await updateTrack(track.id, { lyrics: result.lyrics });
      setAudioResult(result);
      setProgressText('Synced lyrics saved to this track.');
    } catch (error: any) {
      setAudioError(error?.message || 'Synced lyric generation failed.');
      setProgressText('');
    } finally {
      setProcessing(false);
    }
  };

  const runStemSeparation = async () => {
    setProcessing(true);
    setAudioError('');
    setAudioResult(null);
    setProgressText('Preparing stem separation…');
    try {
      const result = await runAudioToolsJob(track, 'stems', stemMode, setProgressText);
      setAudioResult(result);
      setProgressText('Stem separation complete.');
    } catch (error: any) {
      setAudioError(error?.message || 'Stem separation failed.');
      setProgressText('');
    } finally {
      setProcessing(false);
    }
  };

  const closeAudioDialog = () => {
    if (processing) return;
    setAudioDialog(null);
    setAudioResult(null);
    setAudioError('');
    setProgressText('');
  };

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-zinc-400 hover:text-white transition-colors"
        aria-label={`Open tools for ${track.name}`}
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-12 w-60 bg-zinc-950 border border-zinc-900 rounded-2xl p-2 shadow-2xl z-50 space-y-1">
            {onViewDetails && (
              <button onClick={() => { onViewDetails(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:bg-zinc-900 rounded-xl transition-colors">
                <Info className="w-3.5 h-3.5 text-orange-500" /> Track Details
              </button>
            )}
            <button onClick={() => { onEdit(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Edit Metadata
            </button>
            {onAnalyze && (
              <TrackAnalyzeMenuItem onAnalyze={() => { onAnalyze(); setIsOpen(false); }} />
            )}
            <button onClick={() => openAudioDialog('lyrics')} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/10 rounded-xl transition-colors">
              <Mic2 className="w-3.5 h-3.5 text-orange-500" /> Synced Lyrics
            </button>
            <button onClick={() => openAudioDialog('stems')} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/10 rounded-xl transition-colors">
              <SplitSquareVertical className="w-3.5 h-3.5 text-orange-500" /> Stem Separation
            </button>
            <div className="h-px bg-zinc-900 mx-2 my-1" />
            <button onClick={() => { onShare(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Share2 className="w-3.5 h-3.5 text-orange-500" /> Generate Link
            </button>
            <button onClick={() => { onCreatePromo(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Plus className="w-3.5 h-3.5" /> Marketing Pack
            </button>
            <button onClick={() => { onCreateVideo(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Video className="w-3.5 h-3.5" /> Generate Video
            </button>
            <div className="h-px bg-zinc-900 mx-2 my-1" />
            <div className="px-4 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-zinc-600">Quick Add to:</div>
            {playlists.slice(0, 3).map(pl => (
              <button
                key={pl.id}
                onClick={() => { onAddToPlaylist(pl.id); setIsOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors"
              >
                <span className="truncate">{pl.name}</span>
                {pl.track_ids.includes(track.id) && <Check className="w-3 h-3 text-emerald-500" />}
              </button>
            ))}
            <div className="h-px bg-zinc-900 mx-2 my-1" />
            <button onClick={() => { onDownload(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> Download Source
            </button>
            <button onClick={() => { onDelete(); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Final Purge
            </button>
          </div>
        </>
      )}

      {audioDialog && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAudioDialog(); }}>
          <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900">
              <div>
                <p className="text-[9px] uppercase tracking-[0.24em] text-orange-500 font-black">Audio Tools</p>
                <h3 className="text-lg font-black uppercase tracking-tight mt-1">
                  {audioDialog === 'lyrics' ? 'Timestamped Lyrics' : 'Stem Separation'}
                </h3>
              </div>
              <button onClick={closeAudioDialog} disabled={processing} className="p-2 text-zinc-500 hover:text-white disabled:opacity-30" aria-label="Close audio tools">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                <p className="text-xs font-black text-white truncate">{track.name}</p>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {audioDialog === 'lyrics'
                    ? 'Isolates the vocal first, then generates real timestamped LRC lyrics. If vocals cannot be transcribed reliably, nothing is invented.'
                    : 'Choose a simple karaoke split or full production stems before processing starts.'}
                </p>
              </div>

              {audioDialog === 'stems' && !audioResult && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => setStemMode('vocals_instrumental')}
                    className={cn(
                      'p-4 rounded-2xl border text-left transition-all',
                      stemMode === 'vocals_instrumental'
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                    )}
                  >
                    <Mic2 className="w-5 h-5 text-orange-500 mb-3" />
                    <span className="block text-xs font-black uppercase">Vocals + Instrumental</span>
                    <span className="block text-[9px] text-zinc-500 mt-1">2 files: vocal and no-vocal mix</span>
                  </button>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => setStemMode('full')}
                    className={cn(
                      'p-4 rounded-2xl border text-left transition-all',
                      stemMode === 'full'
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                    )}
                  >
                    <SplitSquareVertical className="w-5 h-5 text-orange-500 mb-3" />
                    <span className="block text-xs font-black uppercase">Full Separation</span>
                    <span className="block text-[9px] text-zinc-500 mt-1">Vocals, drums, bass and other</span>
                  </button>
                </div>
              )}

              {progressText && (
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-900 bg-zinc-900/30 px-4 py-3">
                  {processing ? <Loader2 className="w-4 h-4 animate-spin text-orange-500" /> : <Check className="w-4 h-4 text-emerald-500" />}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">{progressText}</span>
                </div>
              )}

              {audioError && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-[11px] text-rose-300 leading-relaxed">
                  {audioError}
                </div>
              )}

              {audioResult && (
                <div className="space-y-3">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-black">Downloads</p>
                  {audioResult.bundle_url && (
                    <a href={audioResult.bundle_url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-xs font-black uppercase text-orange-400 hover:bg-orange-500/15">
                      <span className="flex items-center gap-2"><Download className="w-4 h-4" /> Download All Stems</span>
                      <span>ZIP</span>
                    </a>
                  )}
                  {Object.entries(audioResult.files || {}).map(([name, url]) => (
                    <a key={name} href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-zinc-700 hover:text-white">
                      <span className="flex items-center gap-2">
                        {name === 'lrc' || name === 'plain' ? <FileText className="w-4 h-4 text-orange-500" /> : <Music2 className="w-4 h-4 text-orange-500" />}
                        {name.replace(/_/g, ' ')}
                      </span>
                      <Download className="w-4 h-4" />
                    </a>
                  ))}
                </div>
              )}

              {!audioResult && (
                <button
                  type="button"
                  disabled={processing}
                  onClick={audioDialog === 'lyrics' ? runSyncedLyrics : runStemSeparation}
                  className="w-full h-12 rounded-2xl bg-orange-500 text-black text-xs font-black uppercase tracking-widest hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : audioDialog === 'lyrics' ? <Mic2 className="w-4 h-4" /> : <SplitSquareVertical className="w-4 h-4" />}
                  {processing
                    ? 'Processing…'
                    : audioDialog === 'lyrics'
                      ? 'Generate Synced Lyrics'
                      : stemMode === 'full'
                        ? 'Create Full Stems'
                        : 'Create Vocals + Instrumental'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

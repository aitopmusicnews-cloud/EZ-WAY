import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Music,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import {
  analyzeAndPersistTrack,
  getTrackMusicIntelligence,
} from '../services/musicIntelligence';
import {
  profileToLegacyTrackUpdates,
  type MusicIntelligenceProfile,
  type RankedLabel,
} from '../services/musicIntelligenceCore';
import { runAudioToolsJob } from '../services/audioTools';

const displayLabels = (items: RankedLabel[] = [], limit = 5) => items.slice(0, limit);

export default function AudioAnalyzerStudio() {
  const { tracks, updateTrack, addToast } = useMediaStore();
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [profile, setProfile] = useState<MusicIntelligenceProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [transcribing, setTranscribing] = useState(false);

  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) || null,
    [tracks, selectedTrackId],
  );

  useEffect(() => {
    if (!selectedTrackId && tracks.length > 0) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [tracks, selectedTrackId]);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      if (!selectedTrackId) {
        setProfile(null);
        return;
      }
      setLoadingProfile(true);
      try {
        const saved = await getTrackMusicIntelligence(selectedTrackId);
        if (!cancelled) setProfile(saved);
      } catch (error) {
        console.warn('[AudioAnalyzerStudio] Could not load saved profile:', error);
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [selectedTrackId]);

  const runSharedAnalysis = async (force = true) => {
    if (!selectedTrack) return;
    if (!selectedTrack.file_url || selectedTrack.file_url.startsWith('blob:')) {
      addToast('This track needs a cloud audio source before Music Intelligence can analyze it.', 'error');
      return;
    }

    setAnalyzing(true);
    setAnalysisStatus('Starting Music Intelligence…');
    try {
      await updateTrack(selectedTrack.id, { status: 'processing' });
      const nextProfile = await analyzeAndPersistTrack(selectedTrack, {
        force,
        onProgress: setAnalysisStatus,
      });
      const legacyUpdates = profileToLegacyTrackUpdates(nextProfile, selectedTrack.tags || []);
      await updateTrack(selectedTrack.id, {
        ...legacyUpdates,
        status: 'ready',
      });
      setProfile(nextProfile);
      addToast(`Music Intelligence profile updated for "${selectedTrack.name}".`, 'success');
    } catch (error: any) {
      console.error('[AudioAnalyzerStudio] Music Intelligence failed:', error);
      await updateTrack(selectedTrack.id, { status: 'error' });
      addToast(`Analysis failed: ${error?.message || error}`, 'error');
    } finally {
      setAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const generateSyncedLyrics = async () => {
    if (!selectedTrack) return;
    if (!selectedTrack.file_url || selectedTrack.file_url.startsWith('blob:')) {
      addToast('This track needs a cloud audio source before synced lyrics can run.', 'error');
      return;
    }

    setTranscribing(true);
    try {
      const result = await runAudioToolsJob(
        selectedTrack,
        'lyrics',
        undefined,
        (status) => setAnalysisStatus(status),
      );
      if (!result.lyrics) {
        throw new Error('No reliable lyrics were returned.');
      }
      await updateTrack(selectedTrack.id, { lyrics: result.lyrics });
      addToast(`Synced lyrics saved for "${selectedTrack.name}".`, 'success');
    } catch (error: any) {
      console.error('[AudioAnalyzerStudio] Lyrics transcription failed:', error);
      addToast(`Lyrics transcription failed: ${error?.message || error}`, 'error');
    } finally {
      setTranscribing(false);
      setAnalysisStatus('');
    }
  };

  const genreState = profile?.genre_confident ? 'High confidence' : 'Review suggested';

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase italic">A&R Music Intelligence</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mt-1">
                One saved song profile used across EZ-WAY
              </p>
            </div>
          </div>
          <p className="text-sm text-zinc-500 max-w-3xl leading-relaxed">
            New uploads are analyzed automatically. Use this screen to review the saved genre, structure,
            mood, production traits, keywords, BPM and key, or deliberately re-analyze a track.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 xl:min-w-[520px]">
          <select
            value={selectedTrackId}
            onChange={(event) => setSelectedTrackId(event.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-300 outline-none focus:border-orange-500/60"
          >
            <option value="">Select Track</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => runSharedAnalysis(true)}
            disabled={!selectedTrack || analyzing}
            className="px-6 py-3 bg-orange-500 disabled:bg-zinc-900 disabled:text-zinc-600 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {analyzing ? 'Analyzing' : profile ? 'Re-Analyze' : 'Analyze'}
          </button>
        </div>
      </div>

      {(analyzing || transcribing) && analysisStatus && (
        <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-300">{analysisStatus}</span>
        </div>
      )}

      {!selectedTrack ? (
        <div className="py-28 border border-dashed border-zinc-900 rounded-[3rem] bg-zinc-950/40 text-center">
          <Music className="w-12 h-12 text-zinc-800 mx-auto mb-5" />
          <p className="text-sm font-black uppercase tracking-widest text-zinc-500">Select a track to review its song profile.</p>
        </div>
      ) : loadingProfile ? (
        <div className="py-28 flex items-center justify-center gap-3 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-xs font-black uppercase tracking-widest">Loading saved analysis…</span>
        </div>
      ) : !profile ? (
        <div className="py-24 border border-dashed border-zinc-800 rounded-[3rem] bg-zinc-950 text-center px-8">
          <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-4" />
          <h2 className="text-xl font-black uppercase tracking-tight">No Music Intelligence profile yet</h2>
          <p className="text-xs text-zinc-500 mt-2 max-w-xl mx-auto leading-relaxed">
            This is usually an older library track created before the new analyzer. Run Analyze once and EZ-WAY will save the result for every feature to reuse.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <MetricCard label="BPM" value={profile.bpm ? String(profile.bpm) : '—'} />
            <MetricCard
              label="Key"
              value={[profile.key, profile.camelot_key].filter(Boolean).join(' · ') || '—'}
            />
            <MetricCard label="Primary Genre" value={profile.primary_genre || 'Unknown'} />
            <MetricCard label="Genre Confidence" value={genreState} positive={Boolean(profile.genre_confident)} />
          </div>

          {profile.warnings.length > 0 && (
            <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-3xl space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Review Notes</span>
              </div>
              {profile.warnings.map((warning) => (
                <p key={warning} className="text-xs text-zinc-400">{warning}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AnalysisCard title="Genre & Subgenre">
              <LabelChips items={displayLabels(profile.genres)} />
            </AnalysisCard>
            <AnalysisCard title="Mood & Style">
              <div className="space-y-4">
                <LabelChips items={displayLabels(profile.moods, 4)} />
                <LabelChips items={displayLabels(profile.styles, 4)} />
              </div>
            </AnalysisCard>
            <AnalysisCard title="Instruments / Production">
              <LabelChips items={displayLabels(profile.instruments, 6)} />
            </AnalysisCard>
            <AnalysisCard title="Reusable Keywords">
              <div className="flex flex-wrap gap-2">
                {profile.keywords.length > 0 ? profile.keywords.map((keyword) => (
                  <span key={keyword} className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-300">
                    {keyword}
                  </span>
                )) : <EmptyValue />}
              </div>
            </AnalysisCard>
          </div>

          <AnalysisCard title="Song Structure / Chapters">
            {profile.chapters.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {profile.chapters.map((chapter, index) => (
                  <div key={`${chapter.start}-${chapter.label}-${index}`} className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-2xl flex items-center gap-4">
                    <span className="font-mono text-xs font-black text-orange-500">{chapter.timestamp}</span>
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-300">{chapter.label}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyValue text="No reliable structure was detected for this track." />}
          </AnalysisCard>

          <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-black uppercase tracking-wide">Synced Lyrics</h3>
              </div>
              <p className="text-xs text-zinc-500 mt-2 max-w-2xl">
                Lyrics remain a separate factual audio tool. It isolates the vocal and transcribes it with timestamps; if no reliable transcript is detected, it fails instead of inventing lyrics.
              </p>
            </div>
            <button
              type="button"
              onClick={generateSyncedLyrics}
              disabled={transcribing}
              className="px-6 py-3 bg-white disabled:bg-zinc-900 disabled:text-zinc-600 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shrink-0"
            >
              {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {transcribing ? 'Transcribing' : selectedTrack.lyrics ? 'Regenerate Lyrics' : 'Generate Synced Lyrics'}
            </button>
          </div>

          <div className="flex items-center gap-2 text-zinc-600 px-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest">
              Saved profile: {profile.version} · analyzed {new Date(profile.analyzed_at).toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">{label}</p>
      <p className={`text-xl font-black mt-2 ${positive ? 'text-emerald-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  );
}

function AnalysisCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-6">
      <h3 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400 mb-5">{title}</h3>
      {children}
    </div>
  );
}

function LabelChips({ items }: { items: RankedLabel[] }) {
  if (!items.length) return <EmptyValue />;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.label}
          title={`Match score: ${item.score.toFixed(3)}`}
          className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-300"
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyValue({ text = 'No reliable label detected.' }: { text?: string }) {
  return <p className="text-xs text-zinc-600 italic">{text}</p>;
}

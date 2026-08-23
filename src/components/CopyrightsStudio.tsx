import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  Music,
  ShieldCheck,
} from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';
import {
  buildCopyrightDraft,
  createCopyrightEvidence,
  type CopyrightDraft,
  type CopyrightEvidenceRecord,
} from '../services/copyrightsCore';
import { browserCopyrightRepository, resolveTrackAudioBlob } from '../services/copyrights';
import { getTrackMusicIntelligence } from '../services/musicIntelligence';
import { canUsePremiumFeature } from '../services/premiumFeatures';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const downloadCertificate = (record: CopyrightEvidenceRecord) => {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>EZ Copyright Evidence - ${escapeHtml(record.title)}</title>
<style>
body{font-family:Arial,sans-serif;background:#09090b;color:#f4f4f5;padding:48px}.card{max-width:900px;margin:auto;border:1px solid #3f3f46;border-radius:28px;padding:42px;background:#18181b}.accent{color:#fb923c}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px}.item{border:1px solid #27272a;border-radius:14px;padding:16px}.label{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#a1a1aa}.value{font-size:15px;margin-top:7px;word-break:break-word}.notice{margin-top:30px;padding:18px;border-radius:14px;background:#27272a;color:#d4d4d8;font-size:13px;line-height:1.6}@media print{body{background:white;color:#111}.card{background:white;border-color:#bbb}.item{border-color:#ddd}.notice{background:#f4f4f5;color:#333}}
</style></head><body><div class="card">
<h1>EZ Copyright Evidence Record</h1><p class="accent">THE EZ WAY • Music evidence certificate</p>
<div class="grid">
<div class="item"><div class="label">Work</div><div class="value">${escapeHtml(record.title)}</div></div>
<div class="item"><div class="label">Artist</div><div class="value">${escapeHtml(record.artist)}</div></div>
<div class="item"><div class="label">Registration Number</div><div class="value">${escapeHtml(record.registrationNumber)}</div></div>
<div class="item"><div class="label">Evidence Timestamp</div><div class="value">${escapeHtml(record.dateRegistered)}</div></div>
<div class="item"><div class="label">SHA-256 File Hash</div><div class="value">${escapeHtml(record.fileHash)}</div></div>
<div class="item"><div class="label">Digital Fingerprint</div><div class="value">${escapeHtml(record.digitalFingerprint)}</div></div>
<div class="item"><div class="label">Audio File</div><div class="value">${escapeHtml(record.fileName)}</div></div>
<div class="item"><div class="label">Genre</div><div class="value">${escapeHtml(record.genre || 'Not specified')}</div></div>
</div>
<div class="notice"><strong>Evidence record only.</strong> This certificate documents the file hash, metadata, and timestamp created inside EZ-WAY. It is not an official registration with the U.S. Copyright Office or any government agency.</div>
</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${record.title || 'work'}-ez-copyright-evidence.html`.replace(/[^a-z0-9._-]+/gi, '-');
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export default function CopyrightsStudio() {
  const { tracks, addToast } = useMediaStore();
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [draft, setDraft] = useState<CopyrightDraft | null>(null);
  const [records, setRecords] = useState<CopyrightEvidenceRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CopyrightEvidenceRecord | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  const enabled = canUsePremiumFeature('copyrights');
  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) || null,
    [tracks, selectedTrackId],
  );
  const registeredTrackIds = useMemo(() => new Set(records.map((record) => record.trackId)), [records]);
  const selectedTrackRecords = useMemo(
    () => records.filter((record) => record.trackId === selectedTrackId),
    [records, selectedTrackId],
  );

  const refreshRecords = async () => {
    setRecords(await browserCopyrightRepository.list());
  };

  useEffect(() => {
    void refreshRecords();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSelectedRecord(null);
    setError('');
    if (!selectedTrack) {
      setDraft(null);
      return () => { cancelled = true; };
    }

    setLoadingProfile(true);
    getTrackMusicIntelligence(selectedTrack.id)
      .catch(() => null)
      .then((profile) => {
        if (!cancelled) setDraft(buildCopyrightDraft(selectedTrack, profile));
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => { cancelled = true; };
  }, [selectedTrack]);

  const updateDraft = (key: keyof CopyrightDraft, value: string) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const handleRegister = async () => {
    if (!draft || !selectedTrack || registering) return;
    if (!draft.title.trim() || !draft.artist.trim()) {
      setError('Title and artist are required before creating an evidence record.');
      return;
    }

    setRegistering(true);
    setError('');
    try {
      const audio = await resolveTrackAudioBlob(selectedTrack);
      const record = await createCopyrightEvidence(draft, audio);
      await browserCopyrightRepository.save(record);
      await refreshRecords();
      setSelectedRecord(record);
      addToast(`Copyright evidence created for “${record.title}”`, 'success');
    } catch (caught: any) {
      const message = caught?.message || 'Copyright evidence could not be created.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setRegistering(false);
    }
  };

  if (!enabled) {
    return (
      <div className="min-h-full p-8 text-white">
        <div className="max-w-3xl mx-auto rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
          <ShieldCheck className="w-12 h-12 text-orange-500 mx-auto mb-5" />
          <h1 className="text-2xl font-black uppercase tracking-tight">Copyrights</h1>
          <p className="text-zinc-500 mt-3">This premium feature is not enabled for this account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-black text-white p-5 sm:p-8 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-7">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 text-orange-500 mb-2">
              <ShieldCheck className="w-6 h-6" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em]">EZ Copyrights</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">Copyright Evidence</h1>
            <p className="text-zinc-500 mt-2 max-w-2xl">Pick a track from your EZ-WAY library. The saved track data fills the form automatically, then you can review it before creating the evidence record.</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 max-w-xl">
            <div className="flex gap-2 items-start"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>This creates a timestamped evidence record, not an official government copyright registration.</span></div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[1.35fr_.65fr] gap-6">
          <section className="rounded-3xl border border-zinc-900 bg-zinc-950 p-5 sm:p-7 space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Select Track</label>
              <select
                value={selectedTrackId}
                onChange={(event) => setSelectedTrackId(event.target.value)}
                className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3.5 text-sm text-white outline-none focus:border-orange-500"
              >
                <option value="">Choose a library track…</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name} — {track.artist || 'Unknown Artist'}{registeredTrackIds.has(track.id) ? ' ✓ Registered' : ''}
                  </option>
                ))}
              </select>
            </div>

            {loadingProfile && (
              <div className="flex items-center gap-3 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading saved track intelligence…</div>
            )}

            {draft && !loadingProfile && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="space-y-2"><span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Title</span><input value={draft.title} onChange={(e) => updateDraft('title', e.target.value)} className="w-full rounded-xl bg-black border border-zinc-800 px-4 py-3 text-sm" /></label>
                  <label className="space-y-2"><span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Artist</span><input value={draft.artist} onChange={(e) => updateDraft('artist', e.target.value)} className="w-full rounded-xl bg-black border border-zinc-800 px-4 py-3 text-sm" /></label>
                  <label className="space-y-2"><span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Co-writers / Contributors</span><input value={draft.coArtists} onChange={(e) => updateDraft('coArtists', e.target.value)} placeholder="Optional" className="w-full rounded-xl bg-black border border-zinc-800 px-4 py-3 text-sm" /></label>
                  <label className="space-y-2"><span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Genre</span><input value={draft.genre} onChange={(e) => updateDraft('genre', e.target.value)} className="w-full rounded-xl bg-black border border-zinc-800 px-4 py-3 text-sm" /></label>
                  <label className="space-y-2"><span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Creation Date</span><input type="date" value={draft.dateCreated} onChange={(e) => updateDraft('dateCreated', e.target.value)} className="w-full rounded-xl bg-black border border-zinc-800 px-4 py-3 text-sm" /></label>
                  <div className="rounded-xl bg-black border border-zinc-800 px-4 py-3"><span className="block text-[9px] uppercase tracking-widest text-zinc-500 font-black mb-1">Audio Master</span><span className="text-sm text-zinc-200 break-all">{draft.fileName}</span><span className="block text-[10px] text-zinc-600 mt-1">{draft.fileType} • {(draft.fileSize / 1024 / 1024).toFixed(2)} MB</span></div>
                </div>
                <label className="space-y-2 block"><span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Description / Saved Music Intelligence</span><textarea value={draft.description} onChange={(e) => updateDraft('description', e.target.value)} rows={4} className="w-full rounded-xl bg-black border border-zinc-800 px-4 py-3 text-sm resize-y" /></label>
                <label className="space-y-2 block"><span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Lyrics</span><textarea value={draft.lyrics} onChange={(e) => updateDraft('lyrics', e.target.value)} rows={7} placeholder="No lyrics saved for this track." className="w-full rounded-xl bg-black border border-zinc-800 px-4 py-3 text-sm resize-y" /></label>

                {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

                <button onClick={handleRegister} disabled={registering} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-black hover:bg-orange-400 disabled:opacity-50">
                  {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                  {registering ? 'Creating Evidence…' : 'Register Copyright Evidence'}
                </button>
              </div>
            )}

            {!selectedTrackId && (
              <div className="py-14 text-center text-zinc-600"><Music className="w-10 h-10 mx-auto mb-4" /><p className="text-sm">Choose a track to fill the copyright evidence form.</p></div>
            )}
          </section>

          <aside className="space-y-6">
            {selectedRecord && (
              <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-4" />
                <h2 className="text-lg font-black uppercase tracking-tight">Evidence Created</h2>
                <p className="text-sm text-zinc-400 mt-1">{selectedRecord.registrationNumber}</p>
                <div className="mt-5 space-y-3 text-xs">
                  <div><span className="text-zinc-600 uppercase tracking-wider">File Hash</span><p className="font-mono text-zinc-300 break-all mt-1">{selectedRecord.fileHash}</p></div>
                  <div><span className="text-zinc-600 uppercase tracking-wider">Fingerprint</span><p className="font-mono text-zinc-300 break-all mt-1">{selectedRecord.digitalFingerprint}</p></div>
                </div>
                <button onClick={() => downloadCertificate(selectedRecord)} className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-black px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:border-orange-500">
                  <Download className="w-4 h-4" /> Download Certificate
                </button>
              </div>
            )}

            <div className="rounded-3xl border border-zinc-900 bg-zinc-950 p-6">
              <h2 className="text-sm font-black uppercase tracking-widest">Registration History</h2>
              <div className="mt-4 space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {(selectedTrackId ? selectedTrackRecords : records).length === 0 ? (
                  <p className="text-sm text-zinc-600 py-6">No evidence records yet.</p>
                ) : (selectedTrackId ? selectedTrackRecords : records).map((record) => (
                  <button key={record.id} onClick={() => setSelectedRecord(record)} className="w-full text-left rounded-2xl border border-zinc-800 bg-black p-4 hover:border-zinc-700">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-sm text-zinc-200">{record.title}</p><p className="text-[10px] text-zinc-500 mt-1">{record.artist}</p></div><ShieldCheck className="w-4 h-4 text-orange-500 shrink-0" /></div>
                    <p className="text-[10px] font-mono text-zinc-600 mt-3">{record.registrationNumber}</p>
                    <p className="text-[9px] text-zinc-700 mt-1">{new Date(record.dateRegistered).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

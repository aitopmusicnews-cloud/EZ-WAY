import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock, Download, Globe, Lock, MessageSquare, Music, Pause, Play,
  Send, Sparkles, ThumbsDown, ThumbsUp, Volume2,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Playlist, ShareLink, Track } from '../types';
import { cn } from '../lib/utils';
import { useMediaStore } from '../context/MediaStoreContext';
import { dataStore } from '../services/dataStore';

interface SharePortalProps {
  track?: Track;
  playlist?: Playlist;
  shareLink: ShareLink;
}

const isPublicPortal = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get('token')?.trim() || params.get('share')?.trim());
};

const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export default function SharePortal({ track: initialTrack, playlist, shareLink }: SharePortalProps) {
  const {
    tracks: allTracks,
    addActivity,
    sendMessage,
    messages,
    updateTrack,
    addToast,
  } = useMediaStore();
  const [activeTrack, setActiveTrack] = useState<Track | null>(initialTrack || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(initialTrack?.duration || 0);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [localComments, setLocalComments] = useState<Array<{ id: string; user: string; text: string; time: string }>>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playlistTracks = useMemo(() => {
    if (!playlist) return [];
    const byId = new Map(allTracks.map((track) => [track.id, track]));
    return playlist.track_ids.map((id) => byId.get(id)).filter(Boolean) as Track[];
  }, [playlist, allTracks]);

  useEffect(() => {
    if (!activeTrack && playlistTracks.length) setActiveTrack(playlistTracks[0]);
  }, [activeTrack, playlistTracks]);

  useEffect(() => {
    const url = activeTrack?.file_url;
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    const onTime = () => setProgress(audio.currentTime || 0);
    const onMeta = () => setDuration(audio.duration || activeTrack.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onError = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [activeTrack?.file_url, activeTrack?.duration]);

  const postPublic = async (event: {
    type: 'play' | 'thumbs_up' | 'thumbs_down' | 'comment';
    track_id?: string;
    content?: string;
  }) => {
    await dataStore.postPublicShareEvent(shareLink.token, event);
  };

  const logTrackPlay = async (track: Track) => {
    try {
      if (isPublicPortal()) {
        await postPublic({ type: 'play', track_id: track.id });
        await updateTrack(track.id, { plays: (track.plays || 0) + 1 });
        return;
      }
      await updateTrack(track.id, { plays: (track.plays || 0) + 1 });
      await addActivity({
        type: 'play',
        user: `Industry Client${shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''}`,
        action: 'streamed track reference',
        target: track.name,
        client_id: shareLink.client_id,
        track_id: track.id,
        playlist_id: playlist?.id,
      });
    } catch (error) {
      console.error('[SharePortal] Play telemetry failed', error);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
        if (activeTrack) void logTrackPlay(activeTrack);
      }
    } catch (error) {
      console.error('[SharePortal] Playback failed', error);
    }
  };

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    if (audioRef.current) audioRef.current.currentTime = pct * duration;
  };

  const handleRating = async (type: 'up' | 'down') => {
    if (!activeTrack) return;
    setRating(type);
    try {
      if (isPublicPortal()) {
        await postPublic({ type: type === 'up' ? 'thumbs_up' : 'thumbs_down', track_id: activeTrack.id });
        if (type === 'up') await updateTrack(activeTrack.id, { likes: (activeTrack.likes || 0) + 1 });
      } else {
        await addActivity({
          type: type === 'up' ? 'social' : 'system',
          user: `Industry Client${shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''}`,
          action: type === 'up' ? 'thumbs_up' : 'thumbs_down',
          target: activeTrack.name,
          details: type === 'up' ? 'High-priority approval.' : 'Requested revision cycle.',
          client_id: shareLink.client_id,
          track_id: activeTrack.id,
          playlist_id: playlist?.id,
        });
        if (shareLink.client_id) {
          const message = type === 'up'
            ? `[Mix Approval]: Approved the mix for reference "${activeTrack.name}"!`
            : `[Revision Request]: Flagged "${activeTrack.name}" for revision adjustments.`;
          await sendMessage(shareLink.client_id, message, null, 'inbound');
        }
        if (type === 'up') await updateTrack(activeTrack.id, { likes: (activeTrack.likes || 0) + 1 });
      }
      addToast(type === 'up' ? 'Mix approval recorded.' : 'Revision request recorded.', 'success');
    } catch (error: any) {
      addToast(`Feedback could not be recorded: ${error?.message || error}`, 'error');
    }
  };

  const handleComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = comment.trim();
    if (!content || !activeTrack) return;
    const optimistic = { id: `local-${Date.now()}`, user: 'Industry Client', text: content, time: 'Just now' };
    setLocalComments((prev) => [optimistic, ...prev]);
    setComment('');
    try {
      if (isPublicPortal()) {
        await postPublic({ type: 'comment', track_id: activeTrack.id, content });
      } else {
        await addActivity({
          type: 'message',
          user: `Industry Client${shareLink.recipient_email ? ` (${shareLink.recipient_email})` : ''}`,
          action: 'commented on',
          target: activeTrack.name,
          details: content,
          client_id: shareLink.client_id,
          track_id: activeTrack.id,
          playlist_id: playlist?.id,
        });
        if (shareLink.client_id) {
          await sendMessage(shareLink.client_id, `[Feedback on ${activeTrack.name}]: ${content}`, null, 'inbound');
        }
      }
    } catch (error: any) {
      addToast(`Comment could not be recorded: ${error?.message || error}`, 'error');
    }
  };

  const historicalComments = useMemo(() => messages
    .filter((message) => {
      const clientMatches = shareLink.client_id ? message.client_id === shareLink.client_id : true;
      const trackMatches = activeTrack ? message.content.includes(activeTrack.name) : true;
      return message.direction === 'inbound' && clientMatches && trackMatches;
    })
    .map((message) => ({
      id: message.id,
      user: 'Industry Client',
      text: message.content
        .replace(/^\[Feedback on [^\]]+\]:\s*/i, '')
        .replace(/^\[Industry Feedback on [^\]]+\]:\s*/i, '')
        .replace(/^\[Mix Approval\]:\s*/i, '👍 ')
        .replace(/^\[Revision Request\]:\s*/i, '👎 '),
      time: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })), [messages, shareLink.client_id, activeTrack]);

  const comments = [...localComments, ...historicalComments.filter((item) => !localComments.some((local) => local.id === item.id))];
  const progressPct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-orange-500 selection:text-black font-sans">
      <div className="fixed inset-0 pointer-events-none opacity-20 blur-[120px] scale-125 bg-center bg-cover"
        style={{ backgroundImage: activeTrack?.image_url ? `url(${activeTrack.image_url})` : undefined }} />
      <div className="fixed inset-0 pointer-events-none bg-black/70" />

      <div className="relative z-10 p-6 md:p-12 lg:p-20">
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-orange-500" />
            </div>
            <div>
              <div className="text-[10px] font-black tracking-[0.4em] text-orange-500 uppercase">Authenticated Delivery</div>
              <h1 className="text-3xl font-black tracking-tighter uppercase italic">THE BEATZ WAY <span className="text-zinc-600">HUB</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:block text-right">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500"><Globe className="w-3 h-3" /> Encrypted Endpoint</div>
              <span className="text-[10px] text-zinc-700 font-mono">TOKEN: {shareLink.token.slice(0, 12)}</span>
            </div>
            {shareLink.expires_at && (
              <div className="px-4 py-2 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-center gap-3">
                <Clock className="w-4 h-4 text-orange-500" />
                <div><div className="text-[8px] uppercase text-zinc-500">Expires</div><div className="text-[10px] font-bold">{new Date(shareLink.expires_at).toLocaleDateString()}</div></div>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-12">
          <section className="xl:col-span-7 space-y-8">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-[minmax(260px,380px)_1fr] gap-10 items-center">
              <div className="aspect-square rounded-[3rem] overflow-hidden border border-white/10 bg-zinc-950 shadow-2xl">
                <img src={activeTrack?.image_url || '/ogbeatz_logo.svg'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="space-y-7">
                <div>
                  <div className="flex items-center gap-3 mb-3"><span className="px-3 py-1 rounded-md bg-orange-500 text-black text-[9px] font-black tracking-widest">MASTER</span><span className="text-[10px] uppercase tracking-widest text-zinc-500 flex items-center gap-2"><Volume2 className="w-3 h-3" /> Reference Mix</span></div>
                  <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none">{activeTrack?.name || 'Untitled'}</h2>
                  <p className="text-xl text-zinc-400 mt-3">{activeTrack?.artist || 'Unknown Artist'}</p>
                </div>
                <div className="flex gap-8 text-sm font-mono">
                  <div><div className="text-[9px] uppercase text-zinc-600">Tempo</div>{activeTrack?.bpm || '--'} BPM</div>
                  <div><div className="text-[9px] uppercase text-zinc-600">Key</div>{activeTrack?.key_signature || '--'}</div>
                  <div><div className="text-[9px] uppercase text-zinc-600">Duration</div>{formatTime(duration || activeTrack?.duration || 0)}</div>
                </div>
                <div className="space-y-3">
                  <div onClick={handleSeek} className="h-2 rounded-full bg-zinc-900 cursor-pointer overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${progressPct}%` }} /></div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-600">{formatTime(progress)}</span>
                    <button onClick={togglePlay} disabled={!activeTrack?.file_url} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-30 hover:scale-105 transition-transform">
                      {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
                    </button>
                    <span className="text-[10px] font-mono text-zinc-600">{formatTime(duration)}</span>
                  </div>
                </div>
                {shareLink.download_enabled && activeTrack?.file_url && (
                  <a href={activeTrack.file_url} download className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-zinc-800 hover:border-orange-500 text-xs font-black uppercase tracking-widest"><Download className="w-4 h-4" /> Download Master</a>
                )}
              </div>
            </motion.div>

            {playlistTracks.length > 1 && (
              <div className="bg-zinc-950/80 border border-zinc-900 rounded-3xl p-5 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2"><Music className="w-4 h-4" /> Collection Tracks</div>
                {playlistTracks.map((track) => (
                  <button key={track.id} onClick={() => { setActiveTrack(track); setIsPlaying(false); setProgress(0); }} className={cn('w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all', activeTrack?.id === track.id ? 'border-orange-500/40 bg-orange-500/5' : 'border-zinc-900 hover:border-zinc-800')}>
                    <div><div className="font-bold">{track.name}</div><div className="text-[10px] text-zinc-600">{track.artist}</div></div>
                    <div className="text-[10px] font-mono text-zinc-500">{track.bpm || '--'} BPM</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="xl:col-span-5 space-y-6">
            <div className="bg-zinc-950/90 border border-zinc-900 rounded-[2rem] p-7 space-y-6">
              <div className="flex items-center gap-3"><Lock className="w-4 h-4 text-orange-500" /><div><h3 className="font-black uppercase tracking-wider">Client Review</h3><p className="text-[10px] text-zinc-600 uppercase tracking-widest">Feedback is token-scoped to this delivery</p></div></div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleRating('up')} disabled={!activeTrack} className={cn('p-5 rounded-2xl border flex flex-col items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all', rating === 'up' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400' : 'border-zinc-800 hover:border-emerald-500/50')}><ThumbsUp className="w-6 h-6" /> Approve</button>
                <button onClick={() => handleRating('down')} disabled={!activeTrack} className={cn('p-5 rounded-2xl border flex flex-col items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all', rating === 'down' ? 'bg-rose-500/15 border-rose-500 text-rose-400' : 'border-zinc-800 hover:border-rose-500/50')}><ThumbsDown className="w-6 h-6" /> Revision</button>
              </div>
              <form onSubmit={handleComment} className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Mix Notes</label>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} rows={4} placeholder="Leave time-stamped creative or revision notes..." className="w-full bg-black border border-zinc-800 rounded-2xl p-4 text-sm outline-none focus:border-orange-500 resize-none" />
                <button type="submit" disabled={!comment.trim() || !activeTrack} className="w-full bg-orange-500 text-black rounded-xl px-4 py-3 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-40"><Send className="w-4 h-4" /> Send Feedback</button>
              </form>
            </div>

            <div className="bg-zinc-950/90 border border-zinc-900 rounded-[2rem] p-7">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4">Review History</div>
              <div className="space-y-3 max-h-[360px] overflow-y-auto">
                {comments.length ? comments.map((item) => (
                  <div key={item.id} className="bg-black/60 border border-zinc-900 rounded-2xl p-4"><div className="flex items-center justify-between mb-2"><span className="text-[10px] font-black uppercase text-orange-500">{item.user}</span><span className="text-[9px] text-zinc-700">{item.time}</span></div><p className="text-sm text-zinc-300 leading-relaxed">{item.text}</p></div>
                )) : <p className="text-xs text-zinc-600 italic">No feedback has been submitted yet.</p>}
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

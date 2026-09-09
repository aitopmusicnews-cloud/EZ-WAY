import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Track } from '../types';
import { useMediaStore } from './MediaStoreContext';
import { refreshTrackAudioSource } from '../services/trackAudioSource';

interface AudioContextType {
  activeTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  playTrack: (track: Track, trackList?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  seek: (time: number) => void;
  queue: Track[];
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const { updateTrack, addActivity, addToast } = useMediaStore();
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [queue, setQueue] = useState<Track[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeTrackRef = useRef<Track | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);
  const playRequestRef = useRef(0);
  const addToastRef = useRef(addToast);

  useEffect(() => {
    activeTrackRef.current = activeTrack;
  }, [activeTrack]);

  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);

  const clearLocalObjectUrl = () => {
    if (!localObjectUrlRef.current) return;
    try {
      URL.revokeObjectURL(localObjectUrlRef.current);
    } catch {
      // Best-effort browser cleanup.
    }
    localObjectUrlRef.current = null;
  };

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onError = (error: Event) => {
      console.warn('Audio Load Error on track:', activeTrackRef.current?.name || 'Unknown', error);
      setIsPlaying(false);
      addToastRef.current('The real track audio could not be loaded. Press play again to refresh its source.', 'error');
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      clearLocalObjectUrl();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const playTrack = (track: Track, trackList: Track[] = []) => {
    const requestId = ++playRequestRef.current;

    void (async () => {
      const audio = audioRef.current;
      if (!audio) return;

      setProgress(0);
      setDuration(track.duration || 0);
      setIsPlaying(false);
      if (trackList.length > 0) setQueue(trackList);

      try {
        const playbackTrack = await refreshTrackAudioSource(track);
        if (requestId !== playRequestRef.current || !audioRef.current) return;

        let source = String(playbackTrack.file_url || '').trim();
        clearLocalObjectUrl();

        if (playbackTrack.file_data) {
          source = URL.createObjectURL(playbackTrack.file_data);
          localObjectUrlRef.current = source;
        }

        if (!source || (source.startsWith('blob:') && !playbackTrack.file_data)) {
          throw new Error('The track has no playable audio source.');
        }

        activeTrackRef.current = playbackTrack;
        setActiveTrack(playbackTrack);

        audio.src = source;
        audio.load();
        audio.volume = volume;
        await audio.play();

        if (requestId !== playRequestRef.current) {
          audio.pause();
          return;
        }

        setIsPlaying(true);

        updateTrack(track.id, { plays: (track.plays || 0) + 1 }).catch(console.error);
        addActivity({
          type: 'play',
          user: 'Producer (Live Console)',
          action: 'streamed track reference',
          target: track.name,
          track_id: track.id,
        }).catch(console.error);
      } catch (error) {
        if (requestId !== playRequestRef.current) return;
        console.warn('Could not start real track playback:', error);
        setIsPlaying(false);
        addToast(
          error instanceof Error ? error.message : 'The track could not be played.',
          'error',
        );
      }
    })();
  };

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const resume = () => {
    const audio = audioRef.current;
    if (!audio || !activeTrackRef.current) return;

    setIsPlaying(true);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.warn('Could not resume real track playback:', error);
        setIsPlaying(false);
        addToast('The track source expired. Select the track again to refresh it.', 'error');
      });
    }
  };

  const stop = () => {
    playRequestRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    clearLocalObjectUrl();
    activeTrackRef.current = null;
    setActiveTrack(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  };

  const seek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setProgress(time);
  };

  return (
    <AudioContext.Provider value={{
      activeTrack,
      isPlaying,
      progress,
      duration,
      volume,
      playTrack,
      pause,
      resume,
      stop,
      setVolume,
      seek,
      queue,
    }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within AudioProvider');
  return context;
}

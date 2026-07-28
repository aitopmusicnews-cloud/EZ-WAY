import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Track } from '../types';
import { useMediaStore } from './MediaStoreContext';

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
  const { updateTrack, addActivity } = useMediaStore();
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [queue, setQueue] = useState<Track[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeTrackRef = useRef<Track | null>(null);

  // Procedural Web Audio Synth Refs
  const synthCtxRef = useRef<AudioContext | null>(null);
  const synthIntervalRef = useRef<number | null>(null);
  const synthIsRunningRef = useRef<boolean>(false);
  const synthGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    activeTrackRef.current = activeTrack;
  }, [activeTrack]);

  // Clean up Web Audio Synth on unmount
  useEffect(() => {
    return () => {
      stopProceduralSynth();
    };
  }, []);

  const stopProceduralSynth = () => {
    synthIsRunningRef.current = false;
    if (synthIntervalRef.current) {
      window.clearInterval(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }
    if (synthCtxRef.current) {
      try {
        synthCtxRef.current.close();
      } catch (e) {
        // ignore
      }
      synthCtxRef.current = null;
    }
    synthGainRef.current = null;
  };

  const startProceduralSynth = (bpm: number, keySignature: string) => {
    stopProceduralSynth();

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      synthCtxRef.current = ctx;
      synthIsRunningRef.current = true;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(volume, ctx.currentTime);
      masterGain.connect(ctx.destination);
      synthGainRef.current = masterGain;

      let currentStep = 0;
      const lookahead = 25.0; // ms
      const scheduleAheadTime = 0.1; // seconds
      let nextNoteTime = ctx.currentTime;

      // Generative White Noise Buffer for Hats/Snare Crispness
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const playKick = (time: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(masterGain);

        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);

        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);

        osc.start(time);
        osc.stop(time + 0.3);
      };

      const playSnare = (time: number) => {
        // Noise part for crisp crack
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = ctx.createGain();
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);

        noiseGain.gain.setValueAtTime(0.25, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

        // Oscillator part for warm transient body
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const oscGain = ctx.createGain();
        osc.connect(oscGain);
        oscGain.connect(masterGain);

        osc.frequency.setValueAtTime(180, time);
        oscGain.gain.setValueAtTime(0.4, time);
        oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

        noise.start(time);
        osc.start(time);

        noise.stop(time + 0.25);
        osc.stop(time + 0.2);
      };

      const playHat = (time: number, accent = false) => {
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 8000;

        const gain = ctx.createGain();
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        gain.gain.setValueAtTime(accent ? 0.12 : 0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

        noise.start(time);
        noise.stop(time + 0.06);
      };

      const playPianoNote = (time: number, freq: number, duration: number, gainValue = 0.12) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 0.5, time); // sub octave base layer

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(700, time);
        filter.frequency.exponentialRampToValueAtTime(250, time + duration);

        const gain = ctx.createGain();
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(gainValue, time + 0.05); // soft velvet attack
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.frequency.setValueAtTime(freq, time);

        osc.start(time);
        osc2.start(time);
        osc.stop(time + duration);
        osc2.stop(time + duration);
      };

      const getChordNotes = (key: string, step: number) => {
        const cleanKey = key.toLowerCase();
        const bar = Math.floor(step / 16) % 4; // 4-bar chord progressions

        if (cleanKey.includes('a minor') || cleanKey.includes('a_minor') || cleanKey.includes('a-minor')) {
          // Beautiful LoFi Progression: Am7 -> Dm7 -> G7 -> Cmaj7
          if (bar === 0) return [220.00, 261.63, 329.63, 392.00]; // Am7
          if (bar === 1) return [146.83, 174.61, 220.00, 261.63]; // Dm7
          if (bar === 2) return [196.00, 246.94, 293.66, 349.23]; // G7
          return [130.81, 164.81, 196.00, 246.94]; // Cmaj7
        } else if (cleanKey.includes('g major') || cleanKey.includes('g_major') || cleanKey.includes('g-major')) {
          // Uplifting Synthwave Progression: Gmaj7 -> Cmaj7 -> D7 -> Em7
          if (bar === 0) return [196.00, 246.94, 293.66, 369.99]; // Gmaj7
          if (bar === 1) return [130.81, 164.81, 196.00, 246.94]; // Cmaj7
          if (bar === 2) return [146.83, 185.00, 220.00, 261.63]; // D7
          return [164.81, 196.00, 246.94, 293.66]; // Em7
        } else {
          // Default Trap/Rap Dark Progression (E Minor / F Major / others)
          // Em7 -> Am7 -> Bm7 -> Cmaj7
          if (bar === 0) return [164.81, 196.00, 246.94, 293.66]; // Em7
          if (bar === 1) return [220.00, 261.63, 329.63, 392.00]; // Am7
          if (bar === 2) return [246.94, 293.66, 369.99, 440.00]; // Bm7
          return [130.81, 164.81, 196.00, 246.94]; // Cmaj7
        }
      };

      const scheduler = () => {
        while (nextNoteTime < ctx.currentTime + scheduleAheadTime) {
          const stepInBar = currentStep % 16;
          const isLofi = bpm < 95;
          const isSynthwave = bpm >= 95 && bpm < 130;
          const isTrap = bpm >= 130;

          if (isTrap) {
            // Hard Trap Drum Sequence
            if (stepInBar === 0 || stepInBar === 8 || stepInBar === 11) {
              playKick(nextNoteTime);
            }
            if (stepInBar === 4 || stepInBar === 12) {
              playSnare(nextNoteTime);
            }
            if (stepInBar % 2 === 0) {
              playHat(nextNoteTime, stepInBar % 4 === 0);
            } else if (stepInBar === 7 || stepInBar === 15) {
              playHat(nextNoteTime, false);
              playHat(nextNoteTime + (60.0 / bpm) / 8, false);
            }
          } else if (isSynthwave) {
            // Driving Retro Synthwave four-on-the-floor
            if (stepInBar % 4 === 0) {
              playKick(nextNoteTime);
            }
            if (stepInBar === 4 || stepInBar === 12) {
              playSnare(nextNoteTime);
            }
            if (stepInBar % 4 === 2) {
              playHat(nextNoteTime, true);
            } else if (stepInBar % 2 === 0) {
              playHat(nextNoteTime, false);
            }
          } else {
            // Laidback Lofi Swing Drums
            if (stepInBar === 0 || stepInBar === 10) {
              playKick(nextNoteTime);
            }
            if (stepInBar === 4 || stepInBar === 12) {
              playSnare(nextNoteTime);
            }
            if (stepInBar % 4 === 0 || stepInBar % 4 === 3) {
              playHat(nextNoteTime, stepInBar % 4 === 0);
            }
          }

          // Chord Progression Strum on Beat 1 (Step 0) & Beat 3 (Step 8)
          if (stepInBar === 0 || stepInBar === 8) {
            const chordNotes = getChordNotes(keySignature, currentStep);
            chordNotes.forEach((freq, idx) => {
              playPianoNote(nextNoteTime + (idx * 0.02), freq, (60.0 / bpm) * 4, 0.12);
            });
          }

          const secondsPerBeat = 60.0 / bpm;
          const secondsPerStep = secondsPerBeat / 4;
          nextNoteTime += secondsPerStep;
          currentStep++;
        }
      };

      const timerID = window.setInterval(scheduler, lookahead);
      synthIntervalRef.current = timerID;

    } catch (err) {
      console.warn("Failed to boot fallback procedural synthesizer:", err);
    }
  };

  // Fallback Progress Simulation for Procedural Synthesizer Playback
  useEffect(() => {
    let interval: number | null = null;
    if (isPlaying && synthIsRunningRef.current) {
      interval = window.setInterval(() => {
        setProgress(prev => {
          const maxDur = activeTrackRef.current?.duration || 180;
          if (prev >= maxDur) {
            if (synthCtxRef.current) {
              startProceduralSynth(activeTrackRef.current?.bpm || 120, activeTrackRef.current?.key_signature || "E minor");
            }
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [isPlaying, activeTrack]);

  // Main Audio Event Listeners Setup
  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    
    const onTimeUpdate = () => {
      if (!synthIsRunningRef.current) {
        setProgress(audio.currentTime);
      }
    };
    
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    
    const onError = (error: any) => {
      console.warn("Audio Load Error on track:", activeTrackRef.current?.name || "Unknown", error);
      // Automatically spin up high-fidelity Web Audio synthesis fallback
      if (activeTrackRef.current) {
        console.info("Activating dynamic high-fidelity procedural synth...");
        startProceduralSynth(activeTrackRef.current.bpm || 120, activeTrackRef.current.key_signature || "E minor");
      } else {
        setIsPlaying(false);
      }
    };
    
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      stopProceduralSynth();
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
    };
  }, []);

  // Update Volumes Instantly
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    if (synthGainRef.current && synthCtxRef.current) {
      try {
        synthGainRef.current.gain.setValueAtTime(volume, synthCtxRef.current.currentTime);
      } catch (e) {
        // ignore
      }
    }
  }, [volume]);

  const playTrack = (track: Track, trackList: Track[] = []) => {
    if (!audioRef.current) return;

    if (activeTrack?.id === track.id) {
      resume();
      return;
    }

    setActiveTrack(track);
    setProgress(0);
    setDuration(track.duration || 180);
    setIsPlaying(true);
    if (trackList.length > 0) setQueue(trackList);

    // Update track plays count and log play activity
    updateTrack(track.id, { plays: (track.plays || 0) + 1 }).catch(console.error);
    addActivity({
      type: 'play',
      user: 'Producer (Live Console)',
      action: 'streamed track reference',
      target: track.name,
      track_id: track.id
    }).catch(console.error);

    // Stop current synth session
    stopProceduralSynth();

    if (track.file_url) {
      audioRef.current.src = track.file_url;
      audioRef.current.load();
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn("HTML5 Play failed or blocked. Activating custom procedural synthesis fallback.", err);
          startProceduralSynth(track.bpm || 120, track.key_signature || "E minor");
        });
      }
    } else {
      // No file URL provided, run the high-fidelity synthesizer immediately!
      startProceduralSynth(track.bpm || 120, track.key_signature || "E minor");
    }
  };

  const pause = () => {
    audioRef.current?.pause();
    stopProceduralSynth();
    setIsPlaying(false);
  };

  const resume = () => {
    if (activeTrack) {
      setIsPlaying(true);
      const playPromise = audioRef.current?.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If HTML5 stream fails, verify synth loop is active
          if (!synthIsRunningRef.current) {
            startProceduralSynth(activeTrack.bpm || 120, activeTrack.key_signature || "E minor");
          }
        });
      } else {
        if (!synthIsRunningRef.current) {
          startProceduralSynth(activeTrack.bpm || 120, activeTrack.key_signature || "E minor");
        }
      }
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    stopProceduralSynth();
    setActiveTrack(null);
    setIsPlaying(false);
    setProgress(0);
  };

  const seek = (time: number) => {
    if (audioRef.current && !synthIsRunningRef.current) {
      audioRef.current.currentTime = time;
    }
    setProgress(time);
  };

  return (
    <AudioContext.Provider value={{
      activeTrack, isPlaying, progress, duration, volume,
      playTrack, pause, resume, stop, setVolume, seek, queue
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

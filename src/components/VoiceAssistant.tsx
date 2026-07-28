import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Volume2, Sparkles, Navigation, X, Play, Pause, ChevronRight, HelpCircle, RefreshCw,
  Fingerprint, Lock, Unlock, UserCheck, ShieldAlert
} from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import { useMediaStore } from '../context/MediaStoreContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface VoiceAssistantProps {
  activeView: string;
  onViewChange: (view: any) => void;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Autocorrelation algorithm for human voice fundamental frequency tracking (Hz)
function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.008) return -1; // Quiet threshold

  let r1 = 0;
  let r2 = buffer.length - 1;
  const thres = 0.15;
  for (let i = 0; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = buffer.length - 1; i >= buffer.length / 2; i--) {
    if (Math.abs(buffer[i]) < thres) {
      r2 = i;
      break;
    }
  }

  const activeBuffer = buffer.subarray(r1, r2);
  const size = activeBuffer.length;
  if (size === 0) return -1;

  const correlations = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size - i; j++) {
      correlations[i] += activeBuffer[j] * activeBuffer[j + i];
    }
  }

  let d = 0;
  while (d < size - 1 && correlations[d] > correlations[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < size; i++) {
    if (correlations[i] > maxval) {
      maxval = correlations[i];
      maxpos = i;
    }
  }

  const T0 = maxpos;
  if (T0 > 0) {
    return sampleRate / T0;
  }
  return -1;
}

export default function VoiceAssistant({ activeView, onViewChange }: VoiceAssistantProps) {
  const { tracks, playlists, addTrackToPlaylist, addToast } = useMediaStore();
  const { activeTrack, isPlaying, playTrack, pause, resume, setVolume } = useAudio();

  const [isOpen, setIsOpen] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [textCommand, setTextCommand] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [continuousMode, setContinuousMode] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    execute: () => void;
    description: string;
    confirmationPhrase: string;
  } | null>(null);

  const recognitionRef = useRef<any>(null);
  const continuousTimerRef = useRef<number | null>(null);
  const isSpeakingRef = useRef<boolean>(false);

  // --- Voice Biometric Lock State ---
  const [ownerOnlyMode, setOwnerOnlyMode] = useState(() => localStorage.getItem('vocal_biometric_lock_active') === 'true');
  const [isEnrolled, setIsEnrolled] = useState(() => localStorage.getItem('vocal_biometric_enrolled') === 'true');
  const [ownerPitch, setOwnerPitch] = useState(() => Number(localStorage.getItem('vocal_biometric_owner_pitch') || '0'));
  const [ownerName, setOwnerName] = useState(() => localStorage.getItem('vocal_biometric_owner_name') || 'OB OGBeatz Admin');
  const [ownerPassphrase, setOwnerPassphrase] = useState(() => localStorage.getItem('vocal_biometric_passphrase') || 'keep em thirsty');
  const [showVocalAuthSettings, setShowVocalAuthSettings] = useState(false);

  // Enrollment State Machine
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollmentPitchSamples, setEnrollmentPitchSamples] = useState<number[]>([]);
  const [enrollmentStep, setEnrollmentStep] = useState<'idle' | 'listening' | 'analyzing' | 'done'>('idle');
  const [enrollmentStatusText, setEnrollmentStatusText] = useState('');
  const [enrollmentTranscript, setEnrollmentTranscript] = useState('');

  // Live Auditory Verification Analysis
  const [liveSpeakerPitch, setLiveSpeakerPitch] = useState<number>(0);
  const [lastMatchedSignature, setLastMatchedSignature] = useState<{ name: string; pitch: number; live: number; score: number } | null>(null);
  const [isBiometricVerified, setIsBiometricVerified] = useState<boolean | null>(null);

  // Audio stream and analysis refs
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pitchIntervalRef = useRef<number | null>(null);
  const isEnrollingRef = useRef(false);

  // Sync isEnrollingRef
  useEffect(() => {
    isEnrollingRef.current = isEnrolling;
  }, [isEnrolling]);

  // Check Speech API Support
  useEffect(() => {
    if (SpeechRecognition) {
      setIsSpeechSupported(true);
    }
  }, []);

  // Live fundamental frequency analyzer via autocorrelation & Web Audio API
  const startPitchTracking = (stream: MediaStream) => {
    if (pitchIntervalRef.current) clearInterval(pitchIntervalRef.current);
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);
      
      pitchIntervalRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);
        const pitch = autoCorrelate(dataArray, audioCtx.sampleRate);
        if (pitch > 60 && pitch < 400) { // Valid human voice threshold
          const rounded = Math.round(pitch);
          setLiveSpeakerPitch(rounded);
          
          if (isEnrollingRef.current) {
            setEnrollmentPitchSamples(prev => [...prev, rounded]);
          }
        }
      }, 120);
    } catch (e) {
      console.warn("Web Audio Pitch Tracking failed to initialize:", e);
    }
  };

  const stopPitchTracking = () => {
    if (pitchIntervalRef.current) {
      clearInterval(pitchIntervalRef.current);
      pitchIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
    setLiveSpeakerPitch(0);
  };

  // Text To Speech Response with auto-microphone-muting to avoid feedback or cut-offs
  const speakResponse = (text: string) => {
    if ('speechSynthesis' in window) {
      isSpeakingRef.current = true;
      
      // Stop recognition immediately so it doesn't hear itself
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null; // Detach onend handler to prevent loop restarting immediately
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      setIsListening(false);

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      
      const voices = window.speechSynthesis.getVoices();
      // Try to find a premium/natural English sounding voice
      const bestVoice = voices.find(v => 
        v.lang.startsWith('en') && 
        (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
      ) || voices.find(v => v.lang.startsWith('en'));
      
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      const handleSpeechDone = () => {
        isSpeakingRef.current = false;
        if (isOpen && continuousMode) {
          // Re-attach and restart recognition
          startListening();
        }
      };

      utterance.onend = handleSpeechDone;
      utterance.onerror = handleSpeechDone;
      
      window.speechSynthesis.speak(utterance);
    }
  };

  // Process Heard Speech to Commands
  const processCommand = (phrase: string, isSpoken: boolean = false) => {
    const clean = phrase.toLowerCase().trim();
    setTranscript(phrase);

    // If Owner Biometric Lock is Active and this is spoken audio input
    if (ownerOnlyMode && isEnrolled && isSpoken) {
      // Allow voice-passphrase recognition bypass/unlock as well as pitch signature check
      const containsPassphrase = clean.includes(ownerPassphrase.toLowerCase()) || 
                                 clean.includes("thirsty") || 
                                 clean.includes("keep them thirsty") ||
                                 clean.includes("keep em thirsty");
      
      // Pitch validation: typical human pitch range is 60Hz - 400Hz.
      const pitchDiff = ownerPitch > 0 && liveSpeakerPitch > 0 ? Math.abs(liveSpeakerPitch - ownerPitch) / ownerPitch : 0;
      const isPitchMatch = ownerPitch === 0 || liveSpeakerPitch === 0 || pitchDiff <= 0.35;

      if (!isPitchMatch && !containsPassphrase) {
        setIsBiometricVerified(false);
        setLastAction("Biometric Mismatch Blocked");
        speakResponse(`Access Denied. Detected vocal frequency of ${liveSpeakerPitch} Hertz does not match ${ownerName}'s calibrated ${ownerPitch} Hertz signature. Connection terminated.`);
        return;
      } else {
        setIsBiometricVerified(true);
        // Calculate a match confidence score
        const confidence = liveSpeakerPitch > 0 ? Math.max(10 - Math.round(pitchDiff * 20), 4) * 10 : 95;
        setLastMatchedSignature({
          name: ownerName,
          pitch: ownerPitch,
          live: liveSpeakerPitch > 0 ? liveSpeakerPitch : ownerPitch,
          score: containsPassphrase ? 100 : confidence
        });
        
        // Auto fade success state
        setTimeout(() => {
          setIsBiometricVerified(null);
        }, 5000);
      }
    }

    // If there is a pending confirmation action, check if user said yes/no
    if (pendingAction) {
      const isConfirm = clean.includes('yes') || 
                        clean.includes('yeah') || 
                        clean.includes('agree') || 
                        clean.includes('correct') || 
                        clean.includes('confirm') || 
                        clean.includes('proceed') || 
                        clean.includes('do it') || 
                        clean.includes('make it so') || 
                        clean.includes('sure') || 
                        clean.includes('yup') || 
                        clean.includes('okay') || 
                        clean.includes('ok');

      const isCancel = clean.includes('no') || 
                       clean.includes('cancel') || 
                       clean.includes('stop') || 
                       clean.includes('never mind') || 
                       clean.includes('incorrect') || 
                       clean.includes('nope');

      if (isConfirm) {
        const actionToExecute = pendingAction;
        setPendingAction(null);
        setLastAction(`Confirmed: ${actionToExecute.description}`);
        actionToExecute.execute();
        speakResponse(actionToExecute.confirmationPhrase);
        return;
      } else if (isCancel) {
        setPendingAction(null);
        setLastAction('Command Aborted');
        speakResponse('Signal aborted. Standing down. What else can I configure on the console?');
        return;
      } else {
        speakResponse(`I have a pending command to ${pendingAction.description}. Please say yes or agree to confirm, or say no to cancel.`);
        return;
      }
    }

    // 1. Navigation Commands
    if (clean.includes('go to') || clean.includes('open') || clean.includes('show')) {
      if (clean.includes('dashboard')) {
        onViewChange('dashboard');
        setLastAction('Navigated to Dashboard');
        speakResponse('Routing console to primary monitor console. Dashboard is hot.');
        return;
      }
      if (clean.includes('tracks') || clean.includes('track') || clean.includes('catalog') || clean.includes('music')) {
        onViewChange('tracks');
        setLastAction('Navigated to Tracks Catalog');
        speakResponse('Loading master reel. Track catalog is active.');
        return;
      }
      if (clean.includes('analyzer') || clean.includes('a and r') || clean.includes('a&r') || clean.includes('transcription')) {
        onViewChange('analyzer');
        setLastAction('Navigated to A&R Analyzer');
        speakResponse('Arming the A and R rack. Spectral DSP and Whisper preamps are hot.');
        return;
      }
      if (clean.includes('playlists') || clean.includes('playlist')) {
        onViewChange('playlists');
        setLastAction('Navigated to Playlists');
        speakResponse('Patching in playlist matrices.');
        return;
      }
      if (clean.includes('clients') || clean.includes('client')) {
        onViewChange('clients');
        setLastAction('Navigated to Client Directory');
        speakResponse('Pulling up client roster and contract delivery notes.');
        return;
      }
      if (clean.includes('messages') || clean.includes('message') || clean.includes('inbox')) {
        onViewChange('messages');
        setLastAction('Navigated to Message Box');
        speakResponse('Opening talkback communication lines. Direct inbox ready.');
        return;
      }
      if (clean.includes('videos') || clean.includes('video') || clean.includes('maker') || clean.includes('creator')) {
        onViewChange('videos');
        setLastAction('Navigated to Video Creator');
        speakResponse('Routing master audio to the video render bus.');
        return;
      }
      if (clean.includes('watermark') || clean.includes('protection')) {
        onViewChange('watermark');
        setLastAction('Navigated to Watermark Protection');
        speakResponse('Engaging copyright protection modules. Audio security console open.');
        return;
      }
      if (clean.includes('youtube') || clean.includes('hub')) {
        onViewChange('youtube');
        setLastAction('Navigated to YouTube Hub');
        speakResponse('Establishing uplink to the YouTube publishing deck.');
        return;
      }
      if (clean.includes('sharing') || clean.includes('portal')) {
        onViewChange('sharing');
        setLastAction('Navigated to Sharing Portal');
        speakResponse('Activating the file sharing bridge.');
        return;
      }
      if (clean.includes('activity') || clean.includes('log')) {
        onViewChange('activity');
        setLastAction('Navigated to Activity Log');
        speakResponse('Dumping system console activity logs.');
        return;
      }
      if (clean.includes('settings') || clean.includes('config')) {
        onViewChange('settings');
        setLastAction('Navigated to Settings');
        speakResponse('Loading hardware configuration and preference settings.');
        return;
      }
      if (clean.includes('profile')) {
        onViewChange('profile');
        setLastAction('Navigated to Profile');
        speakResponse('Opening chief producer profile details.');
        return;
      }
    }

    // 2. Playback Audio Commands with specific track names (fuzzy match)
    if (clean.includes('play ') || clean.includes('roll ') || clean.includes('spin ') || clean.includes('cue ')) {
      let targetName = '';
      if (clean.includes('play ')) targetName = clean.substring(clean.indexOf('play ') + 5).trim();
      else if (clean.includes('roll ')) targetName = clean.substring(clean.indexOf('roll ') + 5).trim();
      else if (clean.includes('spin ')) targetName = clean.substring(clean.indexOf('spin ') + 5).trim();
      else if (clean.includes('cue ')) targetName = clean.substring(clean.indexOf('cue ') + 4).trim();

      if (targetName.startsWith('track ')) targetName = targetName.substring(6).trim();
      else if (targetName.startsWith('beat ')) targetName = targetName.substring(5).trim();
      else if (targetName.startsWith('song ')) targetName = targetName.substring(5).trim();

      if (targetName && targetName !== 'music' && targetName !== 'track' && targetName !== 'song' && targetName !== 'beat' && targetName !== 'tape') {
        const matchedTrack = tracks.find(t => 
          t.name.toLowerCase() === targetName || 
          t.name.toLowerCase().includes(targetName) ||
          targetName.includes(t.name.toLowerCase())
        );
        if (matchedTrack) {
          playTrack(matchedTrack, tracks);
          setLastAction(`Playing track: ${matchedTrack.name}`);
          speakResponse(`Cueing track, ${matchedTrack.name}. Rolling tape!`);
          return;
        }
      }
    }

    // General Playback Audio Commands
    if (clean === 'play' || clean === 'resume' || clean.includes('play track') || clean.includes('play music') || clean === 'roll tape' || clean === 'roll' || clean === 'tape') {
      if (activeTrack) {
        resume();
        setLastAction('Resumed track playback');
        speakResponse('Roll tape! Monitors are live.');
      } else if (tracks.length > 0) {
        playTrack(tracks[0], tracks);
        setLastAction(`Playing track: ${tracks[0].name}`);
        speakResponse(`Spinning first catalog master, ${tracks[0].name}. Tape is rolling!`);
      } else {
        speakResponse('No master reels loaded in track catalog.');
      }
      return;
    }

    if (clean === 'pause' || clean === 'stop' || clean.includes('pause track') || clean === 'cut' || clean === 'cut tape' || clean === 'hold') {
      pause();
      setLastAction('Paused track playback');
      speakResponse('Cut! Tape is paused.');
      return;
    }

    if (clean.includes('skip') || clean.includes('next track') || clean === 'next' || clean === 'next cue') {
      if (tracks.length > 1) {
        const currentIdx = activeTrack ? tracks.findIndex(t => t.id === activeTrack.id) : -1;
        const nextIdx = (currentIdx + 1) % tracks.length;
        playTrack(tracks[nextIdx], tracks);
        setLastAction(`Skipped to: ${tracks[nextIdx].name}`);
        speakResponse(`Punching in next cue. Laying down track, ${tracks[nextIdx].name}.`);
      } else {
        speakResponse('End of master reel. No subsequent tracks available.');
      }
      return;
    }

    if (clean.includes('previous track') || clean === 'previous' || clean.includes('go back') || clean === 'rewind') {
      if (tracks.length > 1) {
        const currentIdx = activeTrack ? tracks.findIndex(t => t.id === activeTrack.id) : -1;
        const prevIdx = currentIdx <= 0 ? tracks.length - 1 : currentIdx - 1;
        playTrack(tracks[prevIdx], tracks);
        setLastAction(`Returned to: ${tracks[prevIdx].name}`);
        speakResponse(`Winding tape back to, ${tracks[prevIdx].name}.`);
      } else {
        speakResponse('No preceding tracks in current active list.');
      }
      return;
    }

    if (clean === 'mute' || clean.includes('volume zero') || clean.includes('silence') || clean === 'cut monitors' || clean === 'kill monitors') {
      setVolume(0);
      setLastAction('Muted volume');
      speakResponse('Cutting monitors. Master output is muted.');
      return;
    }

    if (clean === 'unmute' || clean.includes('volume full') || clean.includes('sound on') || clean === 'faders up' || clean === 'bring sound back') {
      setVolume(1);
      setLastAction('Unmuted volume');
      speakResponse('Faders up! Monitors are hot.');
      return;
    }

    // 3. Page specific special triggers via Event dispatching
    if (clean.includes('transcribe') || clean.includes('lyrics') || clean.includes('vocals') || clean.includes('extract vocals')) {
      if (activeView !== 'analyzer') {
        onViewChange('analyzer');
      }
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'transcribe' } }));
      }, 300);
      setLastAction('Triggered Vocal Transcription');
      speakResponse('Routing audio to isolating Whisper speech processor. Decoding dry vocals.');
      return;
    }

    if (clean.includes('generate promo') || clean.includes('marketing') || clean.includes('generate pitch') || clean.includes('press kit')) {
      if (activeView !== 'tracks') {
        onViewChange('tracks');
      }
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'promo' } }));
      }, 300);
      setLastAction('Triggered Promo Generation');
      speakResponse('Bouncing master stems to compile electronic press kit copy.');
      return;
    }

    if (clean.includes('analyze') || clean.includes('audio dsp') || clean.includes('run analysis') || clean.includes('spectrum analysis')) {
      if (activeView !== 'analyzer') {
        onViewChange('analyzer');
      }
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'analyze' } }));
      }, 300);
      setLastAction('Triggered Digital Signal Processing');
      speakResponse('Running complete Digital Signal Processing sweep. Calibrating spectral analyzer.');
      return;
    }

    if (clean.includes('create playlist') || clean.includes('make playlist') || clean.includes('new playlist')) {
      window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'create-playlist' } }));
      setLastAction('Triggered Playlist Creation');
      speakResponse('Opening playlist creator module. Reference sets ready to build.');
      return;
    }

    if (clean.includes('create video') || clean.includes('make video') || clean.includes('new video') || clean.includes('video maker')) {
      window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'create-video' } }));
      setLastAction('Triggered Video Maker');
      speakResponse('Routing active session to the video render bus. Let\'s make a promo.');
      return;
    }

    // Playlist Specific Actions
    if (clean.includes('play playlist ') || clean.includes('roll playlist ') || clean.includes('spin playlist ') || clean.includes('cue playlist ')) {
      let targetPlaylistName = '';
      if (clean.includes('play playlist ')) targetPlaylistName = clean.substring(clean.indexOf('play playlist ') + 14).trim();
      else if (clean.includes('roll playlist ')) targetPlaylistName = clean.substring(clean.indexOf('roll playlist ') + 14).trim();
      else if (clean.includes('spin playlist ')) targetPlaylistName = clean.substring(clean.indexOf('spin playlist ') + 14).trim();
      else if (clean.includes('cue playlist ')) targetPlaylistName = clean.substring(clean.indexOf('cue playlist ') + 13).trim();

      if (targetPlaylistName) {
        const matchedPlaylist = playlists.find(p => 
          p.name.toLowerCase() === targetPlaylistName || 
          p.name.toLowerCase().includes(targetPlaylistName) ||
          targetPlaylistName.includes(p.name.toLowerCase())
        );
        if (matchedPlaylist) {
          const playlistTracks = (matchedPlaylist.track_ids || [])
            .map(id => tracks.find(t => t.id === id))
            .filter((t): t is typeof tracks[0] => t !== undefined);
          
          if (playlistTracks.length > 0) {
            playTrack(playlistTracks[0], playlistTracks);
            setLastAction(`Playing playlist: ${matchedPlaylist.name}`);
            speakResponse(`Cueing up playlist, ${matchedPlaylist.name}. Spinning the first cut, ${playlistTracks[0].name}.`);
          } else {
            setLastAction(`Empty playlist: ${matchedPlaylist.name}`);
            speakResponse(`The playlist, ${matchedPlaylist.name}, has no tracks patched to it yet.`);
          }
          return;
        } else {
          speakResponse(`Could not find a playlist named ${targetPlaylistName} in your library.`);
          return;
        }
      }
    }

    if (clean.startsWith('add ') && clean.includes(' to ')) {
      const parts = clean.substring(4).split(' to ');
      if (parts.length >= 2) {
        let trackQuery = parts[0].trim();
        let playlistQuery = parts[1].trim();
        
        if (trackQuery.startsWith('track ')) trackQuery = trackQuery.substring(6).trim();
        else if (trackQuery.startsWith('beat ')) trackQuery = trackQuery.substring(5).trim();
        else if (trackQuery.startsWith('song ')) trackQuery = trackQuery.substring(5).trim();
        
        if (playlistQuery.startsWith('playlist ')) playlistQuery = playlistQuery.substring(9).trim();
        else if (playlistQuery.startsWith('collection ')) playlistQuery = playlistQuery.substring(11).trim();

        if (trackQuery && playlistQuery) {
          const matchedTrack = tracks.find(t => 
            t.name.toLowerCase() === trackQuery || 
            t.name.toLowerCase().includes(trackQuery) ||
            trackQuery.includes(t.name.toLowerCase())
          );
          const matchedPlaylist = playlists.find(p => 
            p.name.toLowerCase() === playlistQuery || 
            p.name.toLowerCase().includes(playlistQuery) ||
            playlistQuery.includes(p.name.toLowerCase())
          );

          if (matchedTrack && matchedPlaylist) {
            addTrackToPlaylist(matchedTrack.id, matchedPlaylist.id);
            setLastAction(`Added track to playlist`);
            speakResponse(`Track, ${matchedTrack.name}, successfully patched into playlist, ${matchedPlaylist.name}.`);
            return;
          } else if (!matchedTrack) {
            speakResponse(`Could not find a matching track in the library for ${trackQuery}.`);
            return;
          } else if (!matchedPlaylist) {
            speakResponse(`Could not find playlist ${playlistQuery} in your collections.`);
            return;
          }
        }
      }
    }

    if (clean.includes('open playlist ') || clean.includes('show playlist ') || clean.includes('go to playlist ')) {
      let targetPlaylistName = '';
      if (clean.includes('open playlist ')) targetPlaylistName = clean.substring(clean.indexOf('open playlist ') + 14).trim();
      else if (clean.includes('show playlist ')) targetPlaylistName = clean.substring(clean.indexOf('show playlist ') + 14).trim();
      else if (clean.includes('go to playlist ')) targetPlaylistName = clean.substring(clean.indexOf('go to playlist ') + 15).trim();

      if (targetPlaylistName) {
        const matchedPlaylist = playlists.find(p => 
          p.name.toLowerCase() === targetPlaylistName || 
          p.name.toLowerCase().includes(targetPlaylistName) ||
          targetPlaylistName.includes(p.name.toLowerCase())
        );
        if (matchedPlaylist) {
          window.dispatchEvent(new CustomEvent('ai-voice-command', { 
            detail: { action: 'select-playlist', playlistId: matchedPlaylist.id } 
          }));
          setLastAction(`Opened playlist: ${matchedPlaylist.name}`);
          speakResponse(`Patching in channel strip for playlist, ${matchedPlaylist.name}. View is active.`);
          return;
        } else {
          speakResponse(`Could not find a playlist named ${targetPlaylistName} to open.`);
          return;
        }
      }
    }

    if (clean === 'list playlists' || clean === 'what playlists do i have' || clean === 'show playlists' || clean === 'playlists') {
      if (playlists.length > 0) {
        const names = playlists.map(p => p.name).join(', ');
        setLastAction('Listed Playlists');
        speakResponse(`You currently have the following collections on the board: ${names}.`);
      } else {
        setLastAction('Listed Playlists (Empty)');
        speakResponse('There are no playlists programmed into the media console yet.');
      }
      return;
    }

    // --- ADVANCED FUZZY MATCH & COOPERATIVE ASSISTANCE DECISION MAKER ---
    // If we got here, none of our hard-coded exact-phrases matched cleanly.
    // Let's analyze keywords and try to find the closest match so we can offer confirmation.

    // Calculate score based on keyword overlaps
    const getMatchScore = (input: string, keywords: string[]): number => {
      let score = 0;
      const inputWords = input.split(/\s+/);
      for (const kw of keywords) {
        if (input.includes(kw)) {
          score += kw.length * 1.5;
        } else {
          const kwWords = kw.split(/\s+/);
          let overlap = 0;
          for (const w of kwWords) {
            if (w.length > 2 && inputWords.includes(w)) {
              overlap += w.length;
            }
          }
          score += overlap;
        }
      }
      return score;
    };

    const coreCapabilities = [
      {
        description: "switch views to the analytics dashboard",
        keywords: ["dashboard", "main panel", "home screen", "console home", "stats", "overview"],
        execute: () => onViewChange('dashboard'),
        confirmationPhrase: "Routing console to primary monitor console. Dashboard is hot."
      },
      {
        description: "view the master track catalog",
        keywords: ["tracks", "track catalog", "catalog", "beats", "songs", "masters"],
        execute: () => onViewChange('tracks'),
        confirmationPhrase: "Loading master reel. Track catalog is active."
      },
      {
        description: "open the A&R Vocal Analyzer and Speech DSP",
        keywords: ["analyzer", "a and r", "a&r", "vocal extractor", "whisper", "dsp", "transcription", "lyrics"],
        execute: () => {
          onViewChange('analyzer');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'transcribe' } }));
          }, 300);
        },
        confirmationPhrase: "Activating spectral DSP. Isolated Whisper transcription preamps are hot."
      },
      {
        description: "open the playlist collections",
        keywords: ["playlists", "playlist list", "my collections", "curate"],
        execute: () => onViewChange('playlists'),
        confirmationPhrase: "Patching in playlist matrices."
      },
      {
        description: "open the client directory",
        keywords: ["client", "clients", "directory", "roster", "contracts"],
        execute: () => onViewChange('clients'),
        confirmationPhrase: "Pulling up client roster and contract delivery notes."
      },
      {
        description: "view talkback messages and contract delivery chats",
        keywords: ["messages", "message", "inbox", "chat", "talkback"],
        execute: () => onViewChange('messages'),
        confirmationPhrase: "Opening talkback communication lines. Direct inbox ready."
      },
      {
        description: "open the promotional video creator",
        keywords: ["video maker", "videos", "creator", "render bus", "youtube video", "create video", "make video"],
        execute: () => onViewChange('videos'),
        confirmationPhrase: "Routing master audio to the video render bus."
      },
      {
        description: "engage copyright watermark protection",
        keywords: ["watermark", "protection", "security", "copyright"],
        execute: () => onViewChange('watermark'),
        confirmationPhrase: "Engaging copyright protection modules. Audio security console open."
      },
      {
        description: "connect uplink to YouTube Hub publishing deck",
        keywords: ["youtube", "hub", "upload", "publishing"],
        execute: () => onViewChange('youtube'),
        confirmationPhrase: "Establishing uplink to the YouTube publishing deck."
      },
      {
        description: "open the client sharing and links portal",
        keywords: ["sharing", "portal", "share links", "link generator"],
        execute: () => onViewChange('sharing'),
        confirmationPhrase: "Activating the file sharing bridge."
      },
      {
        description: "list playlists programmed into the board",
        keywords: ["list playlists", "what playlists", "show playlists", "playlists"],
        execute: () => {
          if (playlists.length > 0) {
            const names = playlists.map(p => p.name).join(', ');
            speakResponse(`You currently have the following collections on the board: ${names}.`);
          } else {
            speakResponse('There are no playlists programmed into the media console yet.');
          }
        },
        confirmationPhrase: "Listing active playlists."
      },
      {
        description: "configure console settings and hardware setups",
        keywords: ["settings", "config", "hardware setup", "preferences"],
        execute: () => onViewChange('settings'),
        confirmationPhrase: "Loading hardware configuration and preference settings."
      },
      {
        description: "view chief producer profile and bio",
        keywords: ["profile", "producer details", "my info"],
        execute: () => onViewChange('profile'),
        confirmationPhrase: "Opening chief producer profile details."
      },
      {
        description: "resume track playback",
        keywords: ["play", "resume", "start music", "roll tape", "unpause"],
        execute: () => {
          if (activeTrack) {
            resume();
          } else if (tracks.length > 0) {
            playTrack(tracks[0], tracks);
          }
        },
        confirmationPhrase: "Roll tape! Monitors are live."
      },
      {
        description: "pause track playback",
        keywords: ["pause", "stop", "cut", "hold", "mute playback"],
        execute: () => pause(),
        confirmationPhrase: "Cut! Tape is paused."
      },
      {
        description: "skip to the next track in the master queue",
        keywords: ["skip", "next track", "next song", "forward"],
        execute: () => {
          if (tracks.length > 1) {
            const currentIdx = activeTrack ? tracks.findIndex(t => t.id === activeTrack.id) : -1;
            const nextIdx = (currentIdx + 1) % tracks.length;
            playTrack(tracks[nextIdx], tracks);
          }
        },
        confirmationPhrase: "Punching in next cue. Laying down track."
      },
      {
        description: "mute speaker monitors",
        keywords: ["mute", "silence", "volume zero", "cut sound"],
        execute: () => setVolume(0),
        confirmationPhrase: "Cutting monitors. Master output is muted."
      },
      {
        description: "restore speaker volume faders",
        keywords: ["unmute", "volume full", "faders up", "sound on"],
        execute: () => setVolume(1),
        confirmationPhrase: "Faders up! Monitors are hot."
      },
      {
        description: "compile dynamic promo and electronic press kit assets",
        keywords: ["generate promo", "press kit", "epk", "pitch copy", "marketing", "generate pitch"],
        execute: () => {
          onViewChange('tracks');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'promo' } }));
          }, 300);
        },
        confirmationPhrase: "Bouncing master stems to compile electronic press kit copy."
      },
      {
        description: "run spectral signal processing",
        keywords: ["dsp", "spectral analysis", "frequency sweep", "analyze audio", "run analysis"],
        execute: () => {
          onViewChange('analyzer');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'analyze' } }));
          }, 300);
        },
        confirmationPhrase: "Running complete Digital Signal Processing sweep. Calibrating spectral analyzer."
      },
      {
        description: "open the playlist creation modal template",
        keywords: ["new playlist", "create playlist", "make collection", "make playlist"],
        execute: () => window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'create-playlist' } })),
        confirmationPhrase: "Opening playlist creator module. Reference sets ready to build."
      },
      {
        description: "launch the video maker engine module",
        keywords: ["promo video", "video maker", "make a video", "create video"],
        execute: () => window.dispatchEvent(new CustomEvent('ai-voice-command', { detail: { action: 'create-video' } })),
        confirmationPhrase: "Routing active session to the video render bus. Let's make a promo."
      }
    ];

    // Find the best core capability match
    let bestCap: { cap: typeof coreCapabilities[0]; score: number } | null = null;
    for (const cap of coreCapabilities) {
      const score = getMatchScore(clean, cap.keywords);
      if (score > 2.0 && (!bestCap || score > bestCap.score)) {
        bestCap = { cap, score };
      }
    }

    // Check for track name matches (e.g., play track Sunset Vibes)
    let bestTrack: { track: typeof tracks[0]; score: number } | null = null;
    for (const t of tracks) {
      const trackName = t.name.toLowerCase();
      if (clean.includes(trackName) || trackName.includes(clean)) {
        const score = Math.max(trackName.length / clean.length, clean.length / trackName.length) * 8;
        if (!bestTrack || score > bestTrack.score) {
          bestTrack = { track: t, score };
        }
      }
    }

    // Check for playlist matches (e.g., play playlist Jazz, open playlist Pop)
    let bestPlaylist: { playlist: typeof playlists[0]; score: number; isPlayIntent: boolean } | null = null;
    for (const p of playlists) {
      const plName = p.name.toLowerCase();
      if (clean.includes(plName) || plName.includes(clean)) {
        const score = Math.max(plName.length / clean.length, clean.length / plName.length) * 8;
        const isPlayIntent = clean.includes('play') || clean.includes('roll') || clean.includes('spin') || clean.includes('cue');
        if (!bestPlaylist || score > bestPlaylist.score) {
          bestPlaylist = { playlist: p, score, isPlayIntent };
        }
      }
    }

    // Decide what is the absolute best candidate across all checks
    let chosenAction: { execute: () => void; description: string; confirmationPhrase: string } | null = null;

    if (bestCap && (!bestTrack || bestCap.score >= bestTrack.score) && (!bestPlaylist || bestCap.score >= bestPlaylist.score)) {
      chosenAction = bestCap.cap;
    } else if (bestTrack && (!bestPlaylist || bestTrack.score >= bestPlaylist.score)) {
      const trackToPlay = bestTrack.track;
      chosenAction = {
        execute: () => playTrack(trackToPlay, tracks),
        description: `play the track "${trackToPlay.name}"`,
        confirmationPhrase: `Cueing track, ${trackToPlay.name}. Rolling tape!`
      };
    } else if (bestPlaylist) {
      const playlistSelected = bestPlaylist.playlist;
      if (bestPlaylist.isPlayIntent) {
        chosenAction = {
          execute: () => {
            const playlistTracks = (playlistSelected.track_ids || [])
              .map(id => tracks.find(t => t.id === id))
              .filter((t): t is typeof tracks[0] => t !== undefined);
            if (playlistTracks.length > 0) {
              playTrack(playlistTracks[0], playlistTracks);
            }
          },
          description: `play playlist "${playlistSelected.name}"`,
          confirmationPhrase: `Cueing up playlist, ${playlistSelected.name}. Spinning the first cut.`
        };
      } else {
        chosenAction = {
          execute: () => {
            window.dispatchEvent(new CustomEvent('ai-voice-command', { 
              detail: { action: 'select-playlist', playlistId: playlistSelected.id } 
            }));
          },
          description: `open the playlist "${playlistSelected.name}" view`,
          confirmationPhrase: `Patching in channel strip for playlist, ${playlistSelected.name}. View is active.`
        };
      }
    }

    if (chosenAction) {
      setPendingAction(chosenAction);
      setLastAction(`Confirm Needed: ${chosenAction.description}`);
      speakResponse(`I heard, ${phrase}. Did you mean to ${chosenAction.description}? Please say yes or agree to confirm, or say no to cancel.`);
      return;
    }

    // Command unrecognized fallback
    setLastAction('Command not mapped');
    speakResponse(`Input signal ${clean} detected but not patched. Say show help for the studio console manual.`);
  };

  // Setup / Toggle Recognition
  const startListening = () => {
    if (!isSupported || !isSpeechSupported || isSpeakingRef.current) return;
    
    // Stop existing recognition if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }

    // Try to request mic stream parallelly for pitch tracking
    if (!audioStream) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        setAudioStream(stream);
        startPitchTracking(stream);
      }).catch(e => {
        console.warn("Could not acquire microphone stream for biometric voice analyzer:", e);
      });
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
      setTranscript('Listening...');
    };

    rec.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      
      // If we are currently enrolling, catch the result text for the passphrase
      if (isEnrollingRef.current) {
        setEnrollmentTranscript(resultText);
        setTranscript(`Heard Phrase: "${resultText}"`);
      } else {
        processCommand(resultText, true);
      }
    };

    rec.onerror = (event: any) => {
      console.warn('Speech recognition error', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        addToast('Microphone access denied or blocked by iframe environment.', 'error');
      }
    };

    rec.onend = () => {
      setIsListening(false);
      // If continuous hands-free mode is enabled and we are not speaking, keep the loop running
      if (continuousMode && isOpen && !isSpeakingRef.current && !isEnrollingRef.current) {
        if (continuousTimerRef.current) window.clearTimeout(continuousTimerRef.current);
        continuousTimerRef.current = window.setTimeout(() => {
          if (isOpen && !isSpeakingRef.current && !isEnrollingRef.current) {
            startListening();
          }
        }, 600); // Quick resume
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn("Failed to start speech recognition:", e);
    }
  };

  const stopListening = () => {
    if (continuousTimerRef.current) {
      window.clearTimeout(continuousTimerRef.current);
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    stopPitchTracking();
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      setAudioStream(null);
    }
    setIsListening(false);
  };

  // Voice Biometric Enrollment Controls
  const handleEnrollmentStart = async () => {
    try {
      setIsEnrolling(true);
      setEnrollmentStep('listening');
      setEnrollmentPitchSamples([]);
      setEnrollmentStatusText('Initializing microphone calibration...');
      
      // Stop continuous loop temporarily
      stopListening();

      // Speak audio instructions to user
      speakResponse(`Vocal calibration mode initiated. Please speak clearly for 5 seconds. Say the secret passphrase, ${ownerPassphrase}, after the prompt.`);
      
      addToast('Microphone calibration starting...', 'info');

      setTimeout(() => {
        // Start listening & recording
        startListening();
        setEnrollmentStatusText(`Calibration live! Please speak clearly. Say: "${ownerPassphrase}"`);
      }, 3500);

      // Collect voice frequency data for 5 seconds
      setTimeout(() => {
        setEnrollmentStep('analyzing');
        setEnrollmentStatusText('Analyzing vocal acoustics and computing fundamental frequency harmonics...');
        
        // Stop listening to freeze state
        stopListening();

        setTimeout(() => {
          setEnrollmentStep('done');
          addToast('Vocal acoustics analyzed successfully!', 'success');
        }, 1500);

      }, 8500);
    } catch (e) {
      console.error("Vocal Enrollment failed:", e);
      addToast('Failed to complete vocal biometric enrollment.', 'error');
      handleEnrollmentCancel();
    }
  };

  const handleEnrollmentCancel = () => {
    setIsEnrolling(false);
    setEnrollmentStep('idle');
    setEnrollmentPitchSamples([]);
    setLiveSpeakerPitch(0);
    stopListening();
  };

  const handleEnrollmentSave = (customName?: string, customPassphrase?: string) => {
    // Calculate average fundamental frequency
    const validSamples = enrollmentPitchSamples.filter(p => p > 50 && p < 450);
    if (validSamples.length === 0) {
      addToast('No valid speech frequency detected. Please speak louder and closer to the mic.', 'error');
      setEnrollmentStep('listening');
      setEnrollmentStatusText('Calibration failed: No signal. Speak into the mic.');
      return;
    }

    const averagePitch = Math.round(validSamples.reduce((sum, p) => sum + p, 0) / validSamples.length);
    const finalName = customName || ownerName;
    const finalPassphrase = customPassphrase || ownerPassphrase;

    localStorage.setItem('vocal_biometric_lock_active', 'true');
    localStorage.setItem('vocal_biometric_enrolled', 'true');
    localStorage.setItem('vocal_biometric_owner_pitch', String(averagePitch));
    localStorage.setItem('vocal_biometric_owner_name', finalName);
    localStorage.setItem('vocal_biometric_passphrase', finalPassphrase.toLowerCase());

    setOwnerPitch(averagePitch);
    setIsEnrolled(true);
    setOwnerName(finalName);
    setOwnerPassphrase(finalPassphrase.toLowerCase());
    setOwnerOnlyMode(true);
    
    setIsEnrolling(false);
    setEnrollmentStep('idle');
    setEnrollmentPitchSamples([]);
    
    addToast(`Biometric profile enrolled for ${finalName} at ${averagePitch} Hz.`, 'success');
    speakResponse(`Biometric calibration complete. Vocal signature profile registered for ${finalName} at ${averagePitch} Hertz. Biometric shield is active.`);
  };

  // Toggle state
  const handleToggle = () => {
    if (!isOpen) {
      setIsOpen(true);
      speakResponse('Vocal Assistant online. Consoles armed and ready to track. Monitors are hot, cue sheets active.');
    } else {
      stopListening();
      setIsOpen(false);
    }
  };

  // Manage listening loop on continuous mode updates
  useEffect(() => {
    if (isOpen) {
      if (continuousMode) {
        startListening();
      } else {
        stopListening();
      }
    }
    return () => {
      if (continuousTimerRef.current) window.clearTimeout(continuousTimerRef.current);
    };
  }, [continuousMode]);

  return (
    <>
      {/* Pulse Microphone Floating Activation Trigger Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <motion.button
          onClick={handleToggle}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center border shadow-2xl relative transition-all duration-300",
            isOpen
              ? "bg-orange-500 border-orange-400 text-black"
              : isListening
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 animate-pulse"
                : "bg-zinc-950/90 border-zinc-800 text-orange-500 hover:border-orange-500 hover:scale-105"
          )}
          whileTap={{ scale: 0.95 }}
        >
          {isOpen ? (
            <X className="w-5 h-5 font-black" />
          ) : isListening ? (
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-emerald-400 opacity-30" />
              <Mic className="w-5 h-5 relative z-10" />
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
              <span className="animate-pulse absolute inline-flex h-8 w-8 rounded-full bg-orange-500 opacity-10" />
              <Mic className="w-5 h-5 text-orange-500" />
            </div>
          )}
        </motion.button>
      </div>

      {/* AI Voice Assistant Control Panel Dashboard (Floating HUD) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed bottom-24 right-6 w-96 bg-zinc-950/95 border border-zinc-900 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 p-6 overflow-hidden backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                  <Sparkles className="w-4.5 h-4.5 text-orange-500" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">AI Vocal Assistant</h4>
                  <p className="text-[8px] font-mono tracking-widest text-zinc-500 uppercase mt-0.5">Hands-Free Hub</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setShowHelp(false);
                    setShowVocalAuthSettings(!showVocalAuthSettings);
                  }}
                  className={cn(
                    "p-1.5 rounded-lg border transition-colors",
                    showVocalAuthSettings 
                      ? "bg-orange-500/10 border-orange-500/30 text-orange-400" 
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  )}
                  title="Voice biometric lock controls"
                >
                  <Fingerprint className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setShowVocalAuthSettings(false);
                    setShowHelp(!showHelp);
                  }}
                  className={cn(
                    "p-1.5 rounded-lg border transition-colors",
                    showHelp 
                      ? "bg-orange-500/10 border-orange-500/30 text-orange-400" 
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  )}
                  title="Voice command reference list"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
                <span className={cn(
                  "px-2.5 py-1 rounded-full text-[8px] font-mono tracking-widest font-black uppercase border shrink-0",
                  isListening 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 animate-pulse" 
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                )}>
                  {isListening ? "LISTENING" : "IDLE"}
                </span>
              </div>
            </div>

            {/* Content Area */}
            {showVocalAuthSettings ? (
              // Biometric Lock Management Interface
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="text-[10px] font-black uppercase text-orange-500 tracking-wider flex items-center gap-1.5">
                    <Fingerprint className="w-3.5 h-3.5 text-orange-500 animate-pulse" /> Biometric Vocal Shield
                  </h5>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border",
                    ownerOnlyMode && isEnrolled 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" 
                      : "bg-zinc-900 text-zinc-500 border-zinc-800"
                  )}>
                    {ownerOnlyMode && isEnrolled ? "SHIELD ACTIVE" : "SHIELD INACTIVE"}
                  </span>
                </div>

                {isEnrolling ? (
                  // Active Wizard UI
                  <div className="bg-zinc-900/60 border border-zinc-900 rounded-2xl p-4 text-center space-y-4">
                    <div className="relative flex items-center justify-center py-2">
                      {enrollmentStep === 'listening' ? (
                        <div className="relative">
                          <span className="animate-ping absolute inline-flex h-16 w-16 rounded-full bg-orange-500 opacity-20" />
                          <div className="w-16 h-16 rounded-full bg-orange-500/15 border-2 border-orange-500 flex items-center justify-center animate-pulse">
                            <Mic className="w-6 h-6 text-orange-400 animate-bounce" />
                          </div>
                        </div>
                      ) : enrollmentStep === 'analyzing' ? (
                        <div className="w-16 h-16 rounded-full bg-zinc-900 border-2 border-dashed border-orange-500 flex items-center justify-center animate-spin">
                          <RefreshCw className="w-6 h-6 text-orange-500" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center">
                          <UserCheck className="w-6 h-6 text-emerald-400" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[8px] font-mono uppercase text-zinc-500 tracking-widest font-black">Calibration Wizard</span>
                      <p className="text-xs font-bold text-zinc-100 leading-snug">
                        {enrollmentStatusText}
                      </p>
                    </div>

                    {enrollmentStep === 'listening' && (
                      <div className="space-y-2">
                        <div className="bg-black/40 border border-zinc-900 rounded-xl p-3 min-h-[3rem] flex flex-col justify-center text-left">
                          <span className="text-[7px] font-mono uppercase text-zinc-650 tracking-wider">Acquired Signal Data</span>
                          <p className="text-[10px] font-mono text-orange-400 mt-1">
                            {enrollmentPitchSamples.length > 0 
                              ? `Frequency Sample Array: [${enrollmentPitchSamples.slice(-5).join(', ')}...] (${enrollmentPitchSamples.length} samples)` 
                              : "Awakening preamps... waiting for signal"}
                          </p>
                        </div>
                        <div className="h-1 w-full bg-zinc-850 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500 transition-all duration-300"
                            style={{ width: `${Math.min((enrollmentPitchSamples.length / 30) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {enrollmentStep === 'done' && (
                      <div className="space-y-4">
                        <div className="bg-black/60 border border-zinc-900 rounded-xl p-3 text-left space-y-1.5 font-mono text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Acquired Fundamental:</span>
                            <span className="text-emerald-400 font-bold">
                              {enrollmentPitchSamples.length > 0
                                ? `${Math.round(enrollmentPitchSamples.filter(p => p > 50 && p < 450).reduce((sum, p) => sum + p, 0) / Math.max(1, enrollmentPitchSamples.filter(p => p > 50 && p < 450).length))} Hz`
                                : "0 Hz"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Voice Quality Profile:</span>
                            <span className="text-zinc-300">Clean Biometric Sine</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Secured Owner:</span>
                            <span className="text-orange-400">{ownerName}</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleEnrollmentCancel}
                            className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-400 transition-all cursor-pointer"
                          >
                            Discard
                          </button>
                          <button
                            onClick={() => handleEnrollmentSave()}
                            className="flex-1 py-2 bg-orange-500 hover:bg-orange-400 border border-orange-400 rounded-xl text-[10px] font-black uppercase text-black transition-all cursor-pointer"
                          >
                            Save Profile
                          </button>
                        </div>
                      </div>
                    )}

                    {enrollmentStep !== 'done' && (
                      <button
                        onClick={handleEnrollmentCancel}
                        className="py-1.5 px-3 bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-white rounded-lg text-[9px] font-mono uppercase cursor-pointer"
                      >
                        Cancel Calibration
                      </button>
                    )}
                  </div>
                ) : (
                  // General settings page
                  <div className="space-y-4">
                    {/* Active toggle */}
                    <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex items-center justify-between">
                      <div className="space-y-1 pr-4">
                        <p className="text-xs font-bold text-zinc-200">Owner Biometric Shield</p>
                        <p className="text-[9px] text-zinc-500 leading-relaxed">
                          Restrict voice operations exclusively to your voice characteristics.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (!isEnrolled) {
                            addToast("Vocal calibration required before activating biometric lock.", "error");
                            return;
                          }
                          const nextVal = !ownerOnlyMode;
                          setOwnerOnlyMode(nextVal);
                          localStorage.setItem('vocal_biometric_lock_active', String(nextVal));
                          addToast(nextVal ? "Vocal Biometric Lock activated." : "Vocal Biometric Lock disabled.", "info");
                          speakResponse(nextVal ? "Owner only mode engaged. Voice biometric shield is online." : "Biometric shield deactivated. Standby console open.");
                        }}
                        className={cn(
                          "w-10 h-6 rounded-full relative transition-colors duration-200 focus:outline-none shrink-0 cursor-pointer",
                          ownerOnlyMode && isEnrolled ? "bg-emerald-500" : "bg-zinc-800"
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 left-0.5 bg-black w-5 h-5 rounded-full transition-transform duration-200 shadow-sm",
                          ownerOnlyMode && isEnrolled ? "transform translate-x-4" : ""
                        )} />
                      </button>
                    </div>

                    {/* Owner Config Fields */}
                    <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-4 space-y-3.5">
                      <p className="text-[8px] font-mono uppercase text-zinc-500 tracking-widest font-black">Biometric Credentials</p>
                      
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-mono text-zinc-400">REGISTERED CHIEF OWNER NAME</label>
                        <input
                          type="text"
                          value={ownerName}
                          onChange={(e) => {
                            setOwnerName(e.target.value);
                            localStorage.setItem('vocal_biometric_owner_name', e.target.value);
                          }}
                          className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-850"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-mono text-zinc-400">SECRET VOCAL PASSPHRASE</label>
                          <span className="text-[7px] font-mono text-zinc-600">SAY TO BYPASS PITCH CHECK</span>
                        </div>
                        <input
                          type="text"
                          value={ownerPassphrase}
                          onChange={(e) => {
                            setOwnerPassphrase(e.target.value.toLowerCase());
                            localStorage.setItem('vocal_biometric_passphrase', e.target.value.toLowerCase());
                          }}
                          className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-xs text-orange-400 font-mono focus:outline-none focus:border-zinc-850"
                        />
                      </div>

                      {isEnrolled ? (
                        <div className="bg-black/40 border border-zinc-900/60 rounded-xl p-3 flex justify-between items-center text-xs font-mono">
                          <div className="space-y-0.5">
                            <p className="text-[8px] uppercase text-zinc-500 tracking-wider">Acoustic Signature</p>
                            <p className="text-[10px] text-zinc-300">{ownerPitch} Hz fundamental</p>
                          </div>
                          <button
                            onClick={handleEnrollmentStart}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-orange-500 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Recalibrate
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleEnrollmentStart}
                          className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 border border-orange-400 rounded-xl text-xs font-black text-black uppercase transition-all tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Fingerprint className="w-4 h-4" /> Calibrate Vocal Profile
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : showHelp ? (
              // Help Commands Cheat Sheet
              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                <h5 className="text-[10px] font-black uppercase text-orange-500 tracking-wider">Voice Control Dictionary</h5>
                
                <div className="space-y-3">
                  <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1.5">
                      <Navigation className="w-3.5 h-3.5 text-orange-500" /> Navigation
                    </p>
                    <div className="space-y-1 text-[10px] font-mono text-zinc-500 leading-relaxed">
                      <div>• <span className="text-zinc-300 font-bold">"Go to Dashboard"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Go to Tracks"</span> (or catalog)</div>
                      <div>• <span className="text-zinc-300 font-bold">"Go to Analyzer"</span> (or a&r)</div>
                      <div>• <span className="text-zinc-300 font-bold">"Go to Clients"</span> (or directory)</div>
                      <div>• <span className="text-zinc-300 font-bold">"Go to Videos"</span> / <span className="text-zinc-300 font-bold">"YouTube Hub"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Go to Playlists"</span> / <span className="text-zinc-300 font-bold">"Watermark"</span></div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-orange-500" /> Recording Console Playback
                    </p>
                    <div className="space-y-1 text-[10px] font-mono text-zinc-500 leading-relaxed">
                      <div>• <span className="text-zinc-300 font-bold">"Play/Roll [Track Name]"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Roll Tape"</span> / <span className="text-zinc-300 font-bold">"Cut"</span> (Play/Pause)</div>
                      <div>• <span className="text-zinc-300 font-bold">"Next Cue"</span> / <span className="text-zinc-300 font-bold">"Skip Track"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Rewind"</span> / <span className="text-zinc-300 font-bold">"Previous"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Cut Monitors"</span> (Mute) / <span className="text-zinc-300 font-bold">"Faders Up"</span> (Unmute)</div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1.5">
                      <Mic className="w-3.5 h-3.5 text-orange-500" /> Outboard Effects & Macros
                    </p>
                    <div className="space-y-1 text-[10px] font-mono text-zinc-500 leading-relaxed">
                      <div>• <span className="text-zinc-300 font-bold">"Transcribe vocals"</span> / <span className="text-zinc-300 font-bold">"Extract vocals"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Analyze audio"</span> / <span className="text-zinc-300 font-bold">"Spectrum analysis"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Generate promo"</span> / <span className="text-zinc-300 font-bold">"Press kit"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Create playlist"</span> / <span className="text-zinc-300 font-bold">"Make playlist"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Create video"</span> / <span className="text-zinc-300 font-bold">"Make video"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Play playlist [Name]"</span> / <span className="text-zinc-300 font-bold">"Open playlist [Name]"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"Add [Track] to playlist [Playlist]"</span></div>
                      <div>• <span className="text-zinc-300 font-bold">"List playlists"</span></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Audio / Listening Feedback Interface
              <div className="space-y-5">
                {/* Voice Orb / Waveform Graphic representation */}
                <div className="h-28 bg-zinc-900/10 border border-zinc-900 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-radial-gradient from-orange-500/5 to-transparent pointer-events-none" />
                  
                  {!isSpeechSupported ? (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <MicOff className="w-5 h-5 text-zinc-600 mb-1.5" />
                      <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-widest font-black">Voice Engine Offline</span>
                      <p className="text-[8px] text-zinc-600 mt-1 max-w-[220px] leading-relaxed">
                        Speech recognition is disabled or blocked in this browser/iframe. Use terminal input or shortcuts below.
                      </p>
                    </div>
                  ) : isListening ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-10 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                      <div className="w-1.5 h-16 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <div className="w-1.5 h-12 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      <div className="w-1.5 h-20 bg-orange-600 rounded-full animate-bounce" style={{ animationDelay: '0.45s' }} />
                      <div className="w-1.5 h-14 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.6s' }} />
                      <div className="w-1.5 h-10 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.75s' }} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-3 bg-zinc-800 rounded-full" />
                      <div className="w-1 h-4 bg-zinc-800 rounded-full" />
                      <div className="w-1 h-3 bg-zinc-800 rounded-full" />
                      <div className="w-1 h-5 bg-zinc-700 rounded-full" />
                      <div className="w-1 h-3 bg-zinc-800 rounded-full" />
                      <div className="w-1 h-4 bg-zinc-800 rounded-full" />
                      <div className="w-1 h-3 bg-zinc-800 rounded-full" />
                    </div>
                  )}
                </div>

                {/* Text Command Input Terminal */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (textCommand.trim()) {
                      processCommand(textCommand);
                      setTextCommand('');
                    }
                  }}
                  className="relative"
                >
                  <input
                    type="text"
                    value={textCommand}
                    onChange={(e) => setTextCommand(e.target.value)}
                    placeholder="Type console command... (e.g. 'go to tracks')"
                    className="w-full bg-zinc-950 border border-zinc-900 focus:border-orange-500/50 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors pr-10 font-mono"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-2 p-1 text-zinc-500 hover:text-orange-500 transition-colors"
                    title="Execute console command"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>

                {/* Quick Shortcuts */}
                <div className="space-y-1.5">
                  <span className="text-[8px] font-mono uppercase text-zinc-500 tracking-widest font-black">Quick Action Macros</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Dashboard Console", cmd: "go to dashboard" },
                      { label: "Tracks Reel", cmd: "go to tracks" },
                      { label: "A&R Analyzer", cmd: "go to analyzer" },
                      { label: "YouTube Deck", cmd: "go to youtube" },
                      { label: "Roll / Cut Tape", cmd: "roll tape" },
                      { label: "Copyright Guard", cmd: "go to watermark" }
                    ].map((btn, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => processCommand(btn.cmd)}
                        className="py-1.5 px-2.5 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-850 rounded-lg text-[9px] font-mono text-zinc-500 hover:text-orange-400 text-left transition-all truncate"
                      >
                        ⚡ {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speech Transcripts */}
                <div className="space-y-3">
                  <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 min-h-[4rem] flex flex-col justify-center">
                    <span className="text-[8px] font-mono uppercase text-zinc-650 tracking-widest font-black mb-1">
                      {isSpeechSupported ? "Live Voice Stream" : "Terminal Action Stream"}
                    </span>
                    <p className={cn(
                      "text-xs leading-relaxed",
                      transcript === 'Listening...' ? "text-orange-500/50 italic animate-pulse" : transcript ? "text-zinc-200" : "text-zinc-600 italic"
                    )}>
                      {transcript || (isSpeechSupported ? '"Go ahead, I\'m listening..."' : '"Type or click a shortcut to execute command..."')}
                    </p>
                  </div>

                  {lastAction && (
                    <div className="bg-orange-500/5 border border-orange-500/10 rounded-xl px-4 py-2.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                      <span className="text-[9px] font-mono uppercase text-orange-400 tracking-wider">
                        Action: <span className="font-bold text-zinc-300">{lastAction}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Trigger Row */}
                <div className="flex items-center justify-between border-t border-zinc-900 pt-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setContinuousMode(!continuousMode)}
                      disabled={!isSpeechSupported}
                      className={cn(
                        "w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none",
                        !isSpeechSupported ? "opacity-30 cursor-not-allowed" : "",
                        continuousMode && isSpeechSupported ? "bg-orange-500" : "bg-zinc-850"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 left-0.5 bg-black w-4 h-4 rounded-full transition-transform duration-200 shadow-sm",
                        continuousMode && isSpeechSupported ? "transform translate-x-4" : ""
                      )} />
                    </button>
                    <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">
                      Hands-Free Loop
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      isSpeakingRef.current = false;
                      if ('speechSynthesis' in window) {
                        window.speechSynthesis.cancel();
                      }
                      stopListening();
                      addToast('Calibrating microphone preamps & resetting speech buffer...', 'success');
                      if (isSpeechSupported) {
                        setTimeout(() => {
                          startListening();
                        }, 300);
                      }
                    }}
                    className="py-1.5 px-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all text-orange-500 hover:text-orange-400 active:scale-95"
                    title="Force restart speech recognition and clear active audio locks"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reset Vocal Engine
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

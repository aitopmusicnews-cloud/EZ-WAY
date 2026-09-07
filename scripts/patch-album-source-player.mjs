import { readFileSync, writeFileSync } from 'node:fs';

const replaceOnce = (source, from, to, label) => {
  if (!source.includes(from)) {
    throw new Error(`Could not find patch target: ${label}`);
  }
  const result = source.replace(from, to);
  if (result === source) throw new Error(`Patch made no change: ${label}`);
  return result;
};

// 1) Add a reusable track-audio hydrator for Album Cover Studio.
{
  const path = 'src/services/albumCoverCore.ts';
  let source = readFileSync(path, 'utf8');
  const marker = `export const trackNeedsCoverPrompt = (track: Pick<Track, 'image_url' | 'image_data'>): boolean => {`;
  const helper = `const safeTrackAudioName = (name: string): string => (\n  \`${'${'}name || 'track'}-source.mp3\`.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-')\n);\n\nexport const loadTrackAudioFile = async (\n  track: Pick<Track, 'name' | 'type' | 'file_url' | 'file_data'>,\n  fetchImpl: typeof fetch = fetch,\n): Promise<File | null> => {\n  let source: Blob | null = null;\n\n  if (track.file_data instanceof Blob && track.file_data.size > 0) {\n    source = track.file_data;\n  } else if (track.file_url) {\n    const response = await fetchImpl(track.file_url);\n    if (!response.ok) {\n      throw new Error(\`Could not auto-load the selected track MP3 (${'${'}response.status}).\`);\n    }\n    source = await response.blob();\n  }\n\n  if (!source) return null;\n  if (typeof File !== 'undefined' && source instanceof File) return source;\n\n  return new File([source], safeTrackAudioName(track.name), {\n    type: source.type || track.type || 'audio/mpeg',\n  });\n};\n\n`;
  source = replaceOnce(source, marker, helper + marker, 'album cover audio helper');
  writeFileSync(path, source);
}

// 2) Hydrate selected EZ-WAY track MP3 + lyrics immediately in Album Cover Studio.
{
  const path = 'src/components/AlbumCoverStudio.tsx';
  let source = readFileSync(path, 'utf8');

  source = replaceOnce(
    source,
    `import { canUsePremiumFeature } from '../services/premiumFeatures';`,
    `import { canUsePremiumFeature } from '../services/premiumFeatures';\nimport { loadTrackAudioFile } from '../services/albumCoverCore';`,
    'album cover helper import',
  );

  source = replaceOnce(
    source,
    `  const [audioFile, setAudioFile] = useState<File | null>(null);\n  const [lyricsFile, setLyricsFile] = useState<File | null>(null);`,
    `  const [audioFile, setAudioFile] = useState<File | null>(null);\n  const [autoLoadedAudio, setAutoLoadedAudio] = useState(false);\n  const [lyricsFile, setLyricsFile] = useState<File | null>(null);\n  const [autoLoadedLyrics, setAutoLoadedLyrics] = useState(false);`,
    'source hydration states',
  );

  const oldEffect = `  useEffect(() => {\n    setGeneration(null);\n    setSelectedVariationId('');\n    setError('');\n    setStatusText('');\n    setAudioFile(null);\n    setLyricsFile(null);\n    setParentalAdvisory(false);\n\n    if (selectedTrack) {\n      setTitleInput(selectedTrack.name || '');\n      setArtistInput(selectedTrack.artist || '');\n      setLyricsText(selectedTrack.lyrics || '');\n    } else {\n      setTitleInput('');\n      setArtistInput('');\n      setLyricsText('');\n    }\n\n    refreshCollection(selectedTrack ? \`ezway-${'${'}selectedTrack.id}\`.slice(0, 64) : manualCollectionId.slice(0, 64)).catch(() => undefined);\n    // collection refresh intentionally follows the selected track identity only.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [selectedTrackId]);`;

  const newEffect = `  useEffect(() => {\n    let cancelled = false;\n    setGeneration(null);\n    setSelectedVariationId('');\n    setError('');\n    setStatusText('');\n    setAudioFile(null);\n    setAutoLoadedAudio(false);\n    setLyricsFile(null);\n    setAutoLoadedLyrics(false);\n    setParentalAdvisory(false);\n\n    if (selectedTrack) {\n      setTitleInput(selectedTrack.name || '');\n      setArtistInput(selectedTrack.artist || '');\n      setLyricsText(selectedTrack.lyrics || '');\n      const hasSavedLyrics = Boolean(selectedTrack.lyrics?.trim());\n      setAutoLoadedLyrics(hasSavedLyrics);\n\n      void (async () => {\n        try {\n          const hydratedAudio = await loadTrackAudioFile(selectedTrack);\n          if (cancelled) return;\n          setAudioFile(hydratedAudio);\n          setAutoLoadedAudio(Boolean(hydratedAudio));\n          const loadedSources = [\n            hydratedAudio ? 'Auto-loaded EZ-WAY MP3' : '',\n            hasSavedLyrics ? 'Auto-loaded saved lyrics' : '',\n          ].filter(Boolean);\n          if (loadedSources.length > 0) {\n            setStatusText(\`${'${'}loadedSources.join(' + ')}.\`);\n          }\n        } catch (caught: any) {\n          if (cancelled) return;\n          setAudioFile(null);\n          setAutoLoadedAudio(false);\n          const message = caught?.message || 'Could not auto-load the selected EZ-WAY MP3.';\n          setError(message);\n          addToast(message, 'error');\n        }\n      })();\n    } else {\n      setTitleInput('');\n      setArtistInput('');\n      setLyricsText('');\n    }\n\n    refreshCollection(selectedTrack ? \`ezway-${'${'}selectedTrack.id}\`.slice(0, 64) : manualCollectionId.slice(0, 64)).catch(() => undefined);\n    // collection refresh intentionally follows the selected track identity only.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n    return () => {\n      cancelled = true;\n    };\n  }, [selectedTrackId]);`;
  source = replaceOnce(source, oldEffect, newEffect, 'selected-track source hydration effect');

  const oldAudioStatus = `{audioFile?.name || (selectedTrack?.file_url || selectedTrack?.file_data ? 'Using selected EZ-WAY track audio unless replaced.' : 'Choose an MP3 file.')}`;
  const newAudioStatus = `{autoLoadedAudio && audioFile\n                    ? \`Auto-loaded EZ-WAY MP3: ${'${'}audioFile.name}\`\n                    : audioFile?.name || (selectedTrack?.file_url || selectedTrack?.file_data ? 'Loading selected EZ-WAY track MP3…' : 'Choose an MP3 file.')}`;
  source = replaceOnce(source, oldAudioStatus, newAudioStatus, 'MP3 visible auto-load status');

  source = replaceOnce(
    source,
    `onChange={(event) => setAudioFile(event.target.files?.[0] || null)}`,
    `onChange={(event) => { setAudioFile(event.target.files?.[0] || null); setAutoLoadedAudio(false); }}`,
    'manual MP3 replacement state',
  );

  source = replaceOnce(
    source,
    `<textarea value={lyricsText} onChange={(event) => setLyricsText(event.target.value)} rows={10} placeholder="Paste lyrics here…" className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-orange-500 resize-y" />`,
    `<textarea value={lyricsText} onChange={(event) => { setLyricsText(event.target.value); setAutoLoadedLyrics(false); }} rows={10} placeholder="Paste lyrics here…" className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-orange-500 resize-y" />\n              {autoLoadedLyrics && <p className="text-[10px] font-bold text-emerald-400">Auto-loaded saved lyrics from the selected EZ-WAY track.</p>}`,
    'lyrics visible auto-load status',
  );

  writeFileSync(path, source);
}

// 3) Stop mounting the bottom player on every app page.
{
  const path = 'src/App.tsx';
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    `  const [activeView, setActiveView] = useState<AppView>("dashboard");`,
    `  const [activeView, setActiveView] = useState<AppView>("dashboard");\n  const shouldShowGlobalPlayer = ['dashboard', 'tracks', 'playlists'].includes(activeView);`,
    'global player view scope state',
  );
  source = replaceOnce(
    source,
    `      <AudioPlayer onEdit={(track) => setEditingTrack(track)} />`,
    `      {shouldShowGlobalPlayer && <AudioPlayer onEdit={(track) => setEditingTrack(track)} />}`,
    'conditional global player render',
  );
  writeFileSync(path, source);
}

console.log('Applied Album Cover MP3/lyrics autofill and player-scope production patch.');

import React, { useState } from 'react';
import { X, FileArchive, ArrowRight, Settings, Music, Check, Info } from 'lucide-react';

interface ExportMasterModalProps {
  onClose: () => void;
  onExport: (format: 'MP3' | 'WAV' | 'FLAC', customPrefix: string, usePlaylistOnly: boolean) => Promise<void>;
  defaultFormat: 'MP3' | 'WAV' | 'FLAC';
  onUpdateDefaultFormat: (format: 'MP3' | 'WAV' | 'FLAC') => void;
  selectedPlaylistName: string | null;
  totalLibraryTracksCount: number;
  playlistTracksCount: number;
  key?: string | number;
}

export default function ExportMasterModal({
  onClose,
  onExport,
  defaultFormat,
  onUpdateDefaultFormat,
  selectedPlaylistName,
  totalLibraryTracksCount,
  playlistTracksCount,
}: ExportMasterModalProps) {
  const [format, setFormat] = useState<'MP3' | 'WAV' | 'FLAC'>(defaultFormat);
  const [customPrefix, setCustomPrefix] = useState('');
  const [exportScope, setExportScope] = useState<'all' | 'collection'>(
    selectedPlaylistName ? 'collection' : 'all'
  );
  const [isCompiling, setIsCompiling] = useState(false);

  const handleExportClick = async () => {
    setIsCompiling(true);
    try {
      await onExport(format, customPrefix, exportScope === 'collection');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCompiling(false);
    }
  };

  const placeholderName = exportScope === 'collection' && selectedPlaylistName
    ? selectedPlaylistName.toLowerCase().replace(/[/\\?%*:|"<>\s]/g, '_')
    : 'ogbeatz_masters';

  return (
    <div 
      id="export-master-modal-overlay" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in"
    >
      <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col">
        <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 rounded-full blur-[60px] pointer-events-none" />

        {/* Header */}
        <div className="p-6 border-b border-zinc-900 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500 border border-orange-500/20">
              <FileArchive className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <span className="text-[9px] font-mono text-zinc-550 uppercase tracking-[0.2em] block font-bold">Unified Packaging Suite</span>
              <h3 className="text-sm font-black uppercase text-zinc-200 tracking-wider">Archive Export Compiler</h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all hover:scale-105 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Export Scope Selector (Context-Aware) */}
          {selectedPlaylistName ? (
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">
                Export Source Scope
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setExportScope('collection')}
                  className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
                    exportScope === 'collection'
                      ? 'bg-zinc-900 border-orange-500/50 text-white'
                      : 'bg-zinc-900/40 border-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <Music className={`w-4 h-4 ${exportScope === 'collection' ? 'text-orange-500' : 'text-zinc-600'}`} />
                    {exportScope === 'collection' && (
                      <span className="w-4 h-4 rounded-full bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-500">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white block truncate">
                    Collection View
                  </h4>
                  <p className="text-[8.5px] font-mono text-zinc-500 uppercase mt-0.5 mt-1 block">
                    {selectedPlaylistName} ({playlistTracksCount} Tracks)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('all')}
                  className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
                    exportScope === 'all'
                      ? 'bg-zinc-900 border-orange-500/50 text-white'
                      : 'bg-zinc-900/40 border-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <Settings className={`w-4 h-4 ${exportScope === 'all' ? 'text-orange-500' : 'text-zinc-600'}`} />
                    {exportScope === 'all' && (
                      <span className="w-4 h-4 rounded-full bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-500">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white block truncate">
                    Master Library
                  </h4>
                  <p className="text-[8.5px] font-mono text-zinc-500 uppercase mt-0.5 mt-1 block">
                    All Studio Catalogs ({totalLibraryTracksCount} Tracks)
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl">
              <div className="flex gap-2.5 items-start">
                <Music className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Full Library Compilation</h4>
                  <p className="text-[8.5px] font-mono text-zinc-500 uppercase mt-0.5">
                    Ready to package {totalLibraryTracksCount} active audio tracks, master specifications, and lyric scripts.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Export Audio Format */}
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">
              Audio Resolution Format
            </label>
            <div className="grid grid-cols-3 gap-2.5 bg-zinc-905 border border-zinc-900 rounded-2xl p-1 shadow-inner">
              {(['MP3', 'WAV', 'FLAC'] as const).map((fmt) => (
                <button
                  type="button"
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
                    format === fmt
                      ? 'bg-orange-500 text-black shadow-lg'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                  }`}
                >
                  <span>{fmt}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Filename Prefix */}
          <div className="space-y-2">
            <div className="flex justify-between items-center sm:pr-1">
              <label 
                htmlFor="export-custom-prefix" 
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block"
              >
                Custom Package Prefix
              </label>
              <span className="text-[8px] font-mono text-zinc-650 uppercase tracking-widest block font-bold">Optional</span>
            </div>
            <div className="relative">
              <input
                id="export-custom-prefix"
                type="text"
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                placeholder={placeholderName}
                className="w-full bg-zinc-900 border border-zinc-900 hover:border-zinc-800 focus:border-orange-500/40 text-xs text-white rounded-2xl p-4 pr-12 focus:outline-none transition-all placeholder:text-zinc-650 font-medium"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-mono text-zinc-500 font-bold uppercase select-none pointer-events-none">
                .zip
              </span>
            </div>
          </div>

          {/* Global Export Settings Preference (Persisted in localStorage) */}
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-5 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-[30px] pointer-events-none" />
            
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-zinc-950 border border-zinc-850 rounded-lg flex items-center justify-center">
                <Settings className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-200">Global Export Settings</h4>
                <p className="text-[8px] font-mono text-zinc-500 uppercase">These preferences persist across all bulk and single-track exports</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[8.5px] font-black uppercase tracking-widest text-zinc-400 block">
                Preferred Default Format
              </label>
              <div className="grid grid-cols-3 gap-2 bg-zinc-950 border border-zinc-900 rounded-xl p-1 shadow-inner">
                {(['MP3', 'WAV', 'FLAC'] as const).map((fmt) => {
                  const isCurrentDefault = defaultFormat === fmt;
                  return (
                    <button
                      type="button"
                      key={`pref-${fmt}`}
                      onClick={() => {
                        onUpdateDefaultFormat(fmt);
                        setFormat(fmt); // Automatically aligns the active export selection
                      }}
                      className={`py-2 px-1 rounded-lg text-[9px] uppercase font-black tracking-widest transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 select-none ${
                        isCurrentDefault
                          ? 'bg-zinc-900 border border-zinc-800 text-orange-500 shadow-md'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <span>{fmt}</span>
                      <span className="text-[6.5px] font-mono tracking-normal text-zinc-600 capitalize font-semibold">
                        {isCurrentDefault ? 'Active Default' : 'Set Default'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-[8px] font-mono text-zinc-500 leading-relaxed uppercase border-t border-zinc-950 pt-3">
              {defaultFormat === 'MP3' && (
                <span>⚡ <strong>MP3 (320kbps) Preference</strong>: Compresses file size while maintaining excellent quality. Ideal for swift uploads and client previews.</span>
              )}
              {defaultFormat === 'WAV' && (
                <span>🔊 <strong>WAV (24-bit PCM) Preference</strong>: Uncompressed studio reference waveforms. Direct broadcast format suited for professional mixing.</span>
              )}
              {defaultFormat === 'FLAC' && (
                <span>🎧 <strong>FLAC (Lossless) Preference</strong>: Bit-perfect lossless archive mode with responsive compression spacing. Best of quality and weight.</span>
              )}
            </div>
          </div>

          {/* Live Output Preview */}
          <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-2xl space-y-1">
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block">
              Resulting Export Filename Preview
            </span>
            <span className="text-[10px] font-mono text-orange-500/80 uppercase block truncate">
              {(customPrefix.trim() || placeholderName).toLowerCase().replace(/[/\\?%*:|"<>\s]/g, '_')}_{format.toLowerCase()}_export_2026-06-14.zip
            </span>
          </div>

          {/* Info Warning Banner */}
          <div className="flex gap-2.5 p-4 bg-orange-950/10 border border-orange-500/10 rounded-2xl">
            <Info className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
            <p className="text-[8.5px] text-zinc-400 font-medium leading-relaxed uppercase">
              The studio compiler automatically packages track-sheets, timestamped sync lyrics, metadata logs, index lists, and high-fidelity release artwork inside the master zip archive folder.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-900 flex items-center justify-end gap-3 shrink-0 bg-zinc-950">
          <button
            type="button"
            onClick={onClose}
            disabled={isCompiling}
            className="px-6 py-3.5 text-zinc-400 hover:text-white rounded-2xl font-black tracking-widest uppercase text-[10px] bg-transparent hover:bg-zinc-900 transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExportClick}
            disabled={isCompiling}
            className="px-8 py-3.5 bg-orange-500 hover:bg-orange-600 text-black rounded-2xl font-black tracking-widest uppercase text-[10px] flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-50"
          >
            {isCompiling ? (
              <>Compiling Vault...</>
            ) : (
              <>
                Compile & Export <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

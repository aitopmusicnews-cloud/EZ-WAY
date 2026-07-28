import React, { useState, useRef } from 'react';
import { 
  Upload, X, FileAudio, Music, Image as ImageIcon, 
  ListPlus, CheckCircle, AlertCircle, Loader2, Play, Info 
} from 'lucide-react';
import { useMediaStore } from '../context/MediaStoreContext';

interface BulkFileItem {
  id: string;
  file: File;
  status: 'pending' | 'extracting' | 'analyzing' | 'uploading' | 'completed' | 'failed';
  statusText: string;
  progress: number;
}

export default function UploadZone({ onSuccess }: { onSuccess: () => void }) {
  const [uploadMode, setUploadMode] = useState<'single' | 'bulk'>('single');
  
  // Single Upload States
  const [file, setFile] = useState<File | null>(null);
  const [artwork, setArtwork] = useState<File | null>(null);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<string>('');
  const [lyricsFilename, setLyricsFilename] = useState<string | null>(null);
  
  // Bulk Upload States
  const [bulkFiles, setBulkFiles] = useState<BulkFileItem[]>([]);
  const [bulkArtwork, setBulkArtwork] = useState<File | null>(null);
  const [bulkArtworkUrl, setBulkArtworkUrl] = useState<string | null>(null);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkProgressGlobal, setBulkProgressGlobal] = useState({ successCount: 0, failCount: 0, total: 0 });

  const artworkInputRef = useRef<HTMLInputElement>(null);
  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const bulkArtworkInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  
  const { addTrack, analyzeTrack, uploadFile, addToast } = useMediaStore();

  // Generic File Evaluator
  const handleFileSingle = async (f: File) => {
    if (!f) return;
    if (f.type.startsWith('image/')) {
      setArtwork(f);
      setArtworkUrl(URL.createObjectURL(f));
      return;
    }
    
    if (f.type.startsWith('audio/')) {
      setFile(f);
      return;
    }

    if (f.name.endsWith('.txt') || f.name.endsWith('.lrc') || f.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          setLyrics(text);
          setLyricsFilename(f.name);
        }
      };
      reader.readAsText(f);
    }
  };

  const handleBulkArtwork = (f: File) => {
    if (f && f.type.startsWith('image/')) {
      setBulkArtwork(f);
      setBulkArtworkUrl(URL.createObjectURL(f));
    }
  };

  const handleBulkFilesSelect = (selectedFiles: File[]) => {
    const audioFiles = selectedFiles.filter(f => f.type.startsWith('audio/'));
    const items: BulkFileItem[] = audioFiles.map(f => ({
      id: Math.random().toString(36).substring(7),
      file: f,
      status: 'pending',
      statusText: 'In queue',
      progress: 0
    }));
    setBulkFiles(prev => [...prev, ...items]);
  };

  // Run the Single Upload Workflow
  const handleUploadSingle = async () => {
    if (!file) return;

    try {
      setUploadStatus("Extracting master duration...");
      // Get actual audio duration
      const audioForDuration = new Audio();
      const audioUrlForDuration = URL.createObjectURL(file);
      audioForDuration.src = audioUrlForDuration;
      
      const duration = await new Promise<number>((resolve) => {
        audioForDuration.onloadedmetadata = () => {
          resolve(audioForDuration.duration);
          URL.revokeObjectURL(audioUrlForDuration);
        };
        // Fallback if metadata fails
        setTimeout(() => resolve(0), 4000);
      });

      setUploadStatus("Analyzing BPM and key characteristics...");
      const analysis = await analyzeTrack(file.name, duration, file);

      setUploadStatus("Uploading high-fidelity audio master...");
      const finalAudioUrl = await uploadFile('tracks', file);
      
      let finalArtworkUrl = artworkUrl;
      if (artwork) {
        setUploadStatus("Uploading artwork cover...");
        const uploadedArtUrl = await uploadFile('artwork', artwork);
        if (uploadedArtUrl) {
          finalArtworkUrl = uploadedArtUrl;
        }
      }
      
      setUploadStatus("Committing meta handshake...");
      await addTrack({
        name: file.name.replace(/\.[^/.]+$/, ""),
        size: file.size,
        type: file.type,
        file_url: finalAudioUrl || URL.createObjectURL(file), 
        file_data: file, 
        duration: duration,
        bpm: analysis.bpm,
        key_signature: analysis.key,
        tags: analysis.tags || [],
        image_url: finalArtworkUrl,
        image_data: artwork || undefined,
        lyrics: lyrics || undefined,
      });
      
      setUploadStatus(null);
      addToast(`Track "${file.name.replace(/\.[^/.]+$/, "")}" successfully uploaded`, "success");
      onSuccess();
    } catch (e: any) {
      console.error("Upload process failed:", e);
      setUploadStatus(null);
      alert("Asset shipment aborted. Check network configuration or permissions.");
    }
  };

  // Run the Bulk Upload Workflow (queue-based, sequential to avoid hammering API endpoints)
  const handleUploadBulk = async () => {
    if (bulkFiles.length === 0 || isBulkUploading) return;

    // Filter down to pending or failed items
    const itemsToProcess = bulkFiles.filter(item => item.status === 'pending' || item.status === 'failed');
    if (itemsToProcess.length === 0) return;

    setIsBulkUploading(true);
    setBulkProgressGlobal({
      successCount: 0,
      failCount: 0,
      total: itemsToProcess.length
    });

    // Upload batch artwork if custom cover is loaded
    let bulkUploadedArtUrl: string | null = null;
    if (bulkArtwork) {
      try {
        const uploaded = await uploadFile('artwork', bulkArtwork);
        if (uploaded) bulkUploadedArtUrl = uploaded;
      } catch (err) {
        console.warn("Could not upload bulk cover artwork", err);
      }
    }

    for (let i = 0; i < itemsToProcess.length; i++) {
      const currentItem = itemsToProcess[i];
      const updateItemState = (updater: Partial<BulkFileItem>) => {
        setBulkFiles(prev => prev.map(item => item.id === currentItem.id ? { ...item, ...updater } : item));
      };

      try {
        // Step 1: Extract runtime duration
        updateItemState({ status: 'extracting', statusText: 'Determining duration...', progress: 15 });
        const audioForDuration = new Audio();
        const audioUrlForDuration = URL.createObjectURL(currentItem.file);
        audioForDuration.src = audioUrlForDuration;
        
        const duration = await new Promise<number>((resolve) => {
          audioForDuration.onloadedmetadata = () => {
            resolve(audioForDuration.duration);
            URL.revokeObjectURL(audioUrlForDuration);
          };
          setTimeout(() => resolve(0), 4000);
        });

        // Step 2: Pitch/BPM analysis using framework engine
        updateItemState({ status: 'analyzing', statusText: 'Running wave diagnostics...', progress: 40 });
        const analysis = await analyzeTrack(currentItem.file.name, duration, currentItem.file);

        // Step 3: Cloud upload
        updateItemState({ status: 'uploading', statusText: 'Uploading master WAV/MP3...', progress: 70 });
        const finalAudioUrl = await uploadFile('tracks', currentItem.file);

        // Step 4: Supabase handshake
        updateItemState({ status: 'uploading', statusText: 'Committing to database...', progress: 90 });
        await addTrack({
          name: currentItem.file.name.replace(/\.[^/.]+$/, ""),
          size: currentItem.file.size,
          type: currentItem.file.type,
          file_url: finalAudioUrl || URL.createObjectURL(currentItem.file),
          file_data: currentItem.file, // local cache fallback
          duration: duration,
          bpm: analysis.bpm,
          key_signature: analysis.key,
          tags: analysis.tags || [],
          image_url: bulkUploadedArtUrl || bulkArtworkUrl,
          image_data: bulkArtwork || undefined,
        });

        updateItemState({ status: 'completed', statusText: 'Master Synced!', progress: 100 });
        setBulkProgressGlobal(prev => ({ ...prev, successCount: prev.successCount + 1 }));
      } catch (err: any) {
        console.error(`Bulk item upload failed for ${currentItem.file.name}:`, err);
        updateItemState({ status: 'failed', statusText: err.message || 'Workflow aborted', progress: 0 });
        setBulkProgressGlobal(prev => ({ ...prev, failCount: prev.failCount + 1 }));
      }
    }

    setIsBulkUploading(false);
    addToast("Bulk upload batch process complete!", "success");
  };

  const removeBulkFile = (id: string) => {
    if (isBulkUploading) return;
    setBulkFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearBulkQueue = () => {
    if (isBulkUploading) return;
    setBulkFiles([]);
  };

  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
      
      {/* Tab Select Toolbar */}
      <div className="flex justify-between items-center bg-zinc-900/60 p-2 rounded-2xl border border-zinc-900">
        <div className="flex gap-1.5 w-full sm:w-auto">
          <button 
            type="button"
            onClick={() => { if (!isBulkUploading && !uploadStatus) setUploadMode('single'); }}
            disabled={!!uploadStatus || isBulkUploading}
            className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              uploadMode === 'single' 
                ? 'bg-zinc-950 text-white shadow' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            🎙️ Single Master Upload
          </button>
          <button 
            type="button"
            onClick={() => { if (!isBulkUploading && !uploadStatus) setUploadMode('bulk'); }}
            disabled={!!uploadStatus || isBulkUploading}
            className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              uploadMode === 'bulk' 
                ? 'bg-zinc-950 text-white shadow' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            🎚️ Multi-Track Bulk Upload
          </button>
        </div>

        <button 
          onClick={onSuccess}
          className="hidden sm:flex text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-white px-4 py-2 transition-colors border border-transparent hover:border-zinc-800 rounded-xl"
        >
          Cancel
        </button>
      </div>

      {uploadMode === 'single' ? (
        // ================= SINGLE MODE INTERFACE =================
        <div 
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) handleFileSingle(droppedFiles[0] as File);
          }}
          className="space-y-4"
        >
          {!file ? (
            <div className="border-2 border-dashed border-zinc-800 bg-zinc-950/40 rounded-[2rem] p-12 transition-all flex flex-col items-center justify-center space-y-6 hover:border-zinc-700">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center text-zinc-500">
                <Upload className="w-8 h-8" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-black uppercase tracking-tight text-white">Post your high-fidelity master</h3>
                <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mt-2">WAV, MP3 and Artwork cover accepted</p>
              </div>
              <input 
                type="file" 
                id="file-upload-single" 
                className="hidden" 
                accept="audio/*"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) handleFileSingle(selectedFile);
                }} 
              />
              <label 
                htmlFor="file-upload-single"
                className="px-8 py-3.5 bg-white text-black hover:bg-zinc-200 rounded-2xl text-[9px] font-black uppercase tracking-widest cursor-pointer hover:scale-105 transition-all shadow-lg shadow-white/5"
              >
                Choose Audio Master
              </label>
            </div>
          ) : (
            <div className="w-full space-y-6">
              
              {/* Loaded File summary */}
              <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-900 rounded-3xl shadow-md">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-xl flex items-center justify-center">
                    <Music className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black uppercase tracking-tight text-white truncate">{file.name}</h4>
                    <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">{(file.size / 1024 / 1024).toFixed(1)} MB • Audio Loaded</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setFile(null); setArtwork(null); setArtworkUrl(null); }} 
                  className="p-2.5 hover:bg-zinc-900 rounded-full text-zinc-500 hover:text-white transition-all border border-transparent hover:border-zinc-800"
                >
                  <X className="w-4 h-4"/>
                </button>
              </div>

              {/* Artwork Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 bg-zinc-950/40 border border-zinc-900 p-6 rounded-[2rem] items-center">
                <div className="col-span-1 border-r border-zinc-900/60 pr-2">
                  <div 
                    onClick={() => artworkInputRef.current?.click()}
                    className="w-24 h-24 bg-zinc-950 rounded-2xl border border-zinc-900 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 group overflow-hidden relative"
                  >
                    {artworkUrl ? (
                      <img src={artworkUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <ImageIcon className="text-zinc-650 w-7 h-7 group-hover:text-orange-500 transition-colors" />
                        <span className="text-[8px] font-black text-zinc-500 mt-1.5 uppercase">ADD COVER</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="col-span-11 space-y-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-300">Master Cover Art Assignment</h4>
                  <p className="text-[9px] text-zinc-500 leading-normal uppercase">Assign a cover visual for distribution. Drag cover file over or click block to launch storage navigator.</p>
                </div>
                <input type="file" ref={artworkInputRef} accept="image/*" className="hidden" onChange={(e) => { if(e.target.files?.[0]) handleFileSingle(e.target.files[0]); }} />
              </div>

              {/* Lyrics Field */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-[2rem] p-6 space-y-3 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block">🎙️ Master Lyric Projection Sheet</span>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => lyricsInputRef.current?.click()}
                      className="text-[9px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                    >
                      Browse TXT
                    </button>
                    {lyrics && (
                      <button 
                        type="button"
                        onClick={() => { setLyrics(''); setLyricsFilename(null); }}
                        className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Drop a lyric file, browse for local .txt/.lrc sheets, or compose vocal scripts manually..."
                  className="w-full h-28 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 outline-none focus:border-orange-500 text-xs font-mono leading-relaxed resize-none text-zinc-300 placeholder:text-zinc-600"
                />
                <input 
                  type="file" 
                  ref={lyricsInputRef} 
                  accept=".txt,.lrc,text/plain" 
                  className="hidden" 
                  onChange={(e) => { if (e.target.files?.[0]) handleFileSingle(e.target.files[0]); }} 
                />
              </div>

              {/* Upload Trigger */}
              <button 
                onClick={handleUploadSingle} 
                disabled={!!uploadStatus}
                className="w-full py-4.5 bg-orange-500 disabled:bg-zinc-900 disabled:text-zinc-600 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-orange-500/10 flex items-center justify-center gap-2"
              >
                {uploadStatus ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>{uploadStatus}</span>
                  </>
                ) : (
                  <span>Commit Master to Distribution Hub</span>
                )}
              </button>

            </div>
          )}
        </div>
      ) : (
        // ================= BULK MODE INTERFACE =================
        <div className="space-y-6">
          
          {/* Drop section */}
          <div 
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              handleBulkFilesSelect(Array.from(e.dataTransfer.files));
            }}
            className="border-2 border-dashed border-zinc-800 bg-zinc-950/40 rounded-[2rem] p-10 flex flex-col items-center justify-center space-y-5 hover:border-zinc-700 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 flex items-center justify-center text-zinc-500">
              <ListPlus className="w-7 h-7 text-orange-500" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-black uppercase tracking-tight text-white">Bulk Ingest Audio Masters</h3>
              <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest mt-2">Drag and drop multiple audio WAV/MP3 files into this container</p>
            </div>
            
            <input 
              type="file" 
              ref={bulkFileInputRef}
              className="hidden" 
              accept="audio/*"
              multiple
              onChange={(e) => {
                if (e.target.files) handleBulkFilesSelect(Array.from(e.target.files));
              }}
            />

            <button 
              type="button"
              onClick={() => bulkFileInputRef.current?.click()}
              className="px-6 py-3 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest"
            >
              Select Multiple Audio Files
            </button>
          </div>

          {/* Bulk Settings Option bar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 bg-zinc-950/50 border border-zinc-900 p-5 rounded-3xl items-center">
            <div className="col-span-1 border-r border-zinc-900 pr-2">
              <div 
                onClick={() => bulkArtworkInputRef.current?.click()}
                className="w-16 h-16 bg-zinc-950 rounded-xl border border-zinc-900 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 overflow-hidden relative"
              >
                {bulkArtworkUrl ? (
                  <img src={bulkArtworkUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <>
                    <ImageIcon className="text-zinc-750 w-5 h-5" />
                    <span className="text-[7px] font-black text-zinc-650 mt-1 uppercase">BATCH COV</span>
                  </>
                )}
              </div>
            </div>
            <div className="col-span-11 leading-normal">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Batch Cover Artwork (Optional)</h4>
              <p className="text-[8px] text-zinc-500 leading-normal uppercase">If uploaded, this artwork will be shared by all assets in this bulk batch. If omitted, ogbeatz visual themes will represent your waveforms.</p>
              <input type="file" ref={bulkArtworkInputRef} accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleBulkArtwork(e.target.files[0]); }} />
            </div>
          </div>

          {/* File Queue List */}
          {bulkFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Ingestion Queue ({bulkFiles.length} files)
                </span>
                
                {!isBulkUploading && (
                  <button 
                    onClick={clearBulkQueue}
                    className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400"
                  >
                    Clear Queue
                  </button>
                )}
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 border border-zinc-900 rounded-3xl p-4 bg-zinc-950/60 shadow-inner">
                {bulkFiles.map((item, index) => (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-zinc-950 border border-zinc-900 rounded-2xl gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-[10px] font-mono text-zinc-600 font-bold">#{index + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate max-w-md" title={item.file.name}>{item.file.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8px] font-mono text-zinc-500 uppercase">
                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                          <span className="text-[8px] font-mono text-zinc-600 font-bold">•</span>
                          <span className={`text-[8px] font-black uppercase tracking-widest font-mono ${
                            item.status === 'completed' ? 'text-emerald-500' :
                            item.status === 'failed' ? 'text-rose-500' :
                            'text-zinc-400 animate-pulse'
                          }`}>
                            {item.statusText}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start">
                      {/* Individual Progress line */}
                      {item.status !== 'pending' && item.status !== 'completed' && item.status !== 'failed' && (
                        <div className="w-16 bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-orange-500 h-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}

                      <div>
                        {item.status === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                        {item.status === 'failed' && <AlertCircle className="w-5 h-5 text-rose-500" />}
                        {item.status !== 'pending' && item.status !== 'completed' && item.status !== 'failed' && (
                          <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                        )}
                        {item.status === 'pending' && !isBulkUploading && (
                          <button 
                            onClick={() => removeBulkFile(item.id)}
                            className="p-1 hover:bg-zinc-900 rounded text-zinc-500 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress Summary HUD */}
              {isBulkUploading && (
                <div className="bg-zinc-900/40 p-4 border border-zinc-900 rounded-2xl flex flex-col sm:flex-row justify-between gap-4">
                  <div className="flex gap-4">
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Total Batched: {bulkProgressGlobal.total}</span>
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block">Complete: {bulkProgressGlobal.successCount}</span>
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest block">Failed: {bulkProgressGlobal.failCount}</span>
                  </div>
                  
                  {/* Overall bar */}
                  <div className="flex-1 max-w-xs bg-zinc-950 h-2 rounded-full overflow-hidden self-center border border-zinc-900">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-500" 
                      style={{ width: `${((bulkProgressGlobal.successCount + bulkProgressGlobal.failCount) / bulkProgressGlobal.total) * 100}%` }} 
                    />
                  </div>
                </div>
              )}

              {/* Bulk control trigger */}
              <button 
                type="button"
                onClick={handleUploadBulk}
                disabled={isBulkUploading || bulkFiles.filter(i => i.status === 'pending' || i.status === 'failed').length === 0}
                className="w-full py-4.5 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-900 disabled:text-zinc-650 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-orange-500/5 transition-all flex items-center justify-center gap-2"
              >
                {isBulkUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Bulk Synchronizing waveforms ({bulkProgressGlobal.successCount + bulkProgressGlobal.failCount} / {bulkProgressGlobal.total})</span>
                  </>
                ) : (
                  <span>Inject Waveforms to Cloud Pipeline</span>
                )}
              </button>

            </div>
          )}

        </div>
      )}

    </div>
  );
}

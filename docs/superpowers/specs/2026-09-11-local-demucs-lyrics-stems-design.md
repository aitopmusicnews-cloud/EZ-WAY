# Local HTDemucs Lyrics & Stems Design

Date: 2026-09-11
Status: User-approved
Repository: `aitopmusicnews-cloud/EZ-WAY`
Supersedes the separation/transcription flow in `2026-09-08-browser-local-lyrics-stems-design.md` where that document calls for Spleeter-compatible stems or direct mixed-track Whisper transcription.

## Goal

Use one browser-local HTDemucs separation engine for both Synced Lyrics and Stem Separation. Synced Lyrics must isolate the vocal stem first, then transcribe that vocal stem locally in bounded Whisper chunks. No production lyrics/stems compute may fall back to AWS Audio Tools, Render, or another remote inference service.

## Architecture

```text
Track source
  -> browser decode/resample to 44.1 kHz stereo
  -> HTDemucs ONNX worker
       -> drums
       -> bass
       -> other
       -> vocals
  -> stems flow: encode requested WAVs + ZIP
  -> lyrics flow: vocals -> mono/16 kHz -> chunked Whisper worker -> timestamp merge -> LRC/plain text
  -> optional existing AWS app-data persistence for generated files only
```

The separation model is `StemSplitio/htdemucs-onnx`, using the single-file `htdemucs_fp16weights.onnx` artifact. It accepts stereo 44.1 kHz waveform segments shaped `[1, 2, 343980]` and returns `[drums, bass, other, vocals]`. Longer audio is processed with overlap-add. The artifact is MIT-licensed according to the model card and derives from MIT-licensed HTDemucs.

## HTDemucs Runtime

- Run inside `src/workers/stems.worker.ts` so React stays responsive.
- Load one 4-stem ONNX session lazily on first use; do not preload at app startup.
- Probe WebGPU with `navigator.gpu.requestAdapter()` before selecting the WebGPU execution provider.
- If no usable adapter exists or WebGPU session creation fails, use ONNX Runtime Web WASM.
- Use 44.1 kHz stereo input, segment length 343980 samples (7.8 s), 25% overlap, and overlap-add weighting.
- Model URL: `https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx`.
- Return four stereo stems at 44.1 kHz with source-length output.
- Progress must distinguish model loading from per-segment separation.

## Stem Separation Contract

Preserve the existing UI modes and `AudioToolJobResult` shape.

`vocals_instrumental` returns:
- `vocals`
- `instrumental`, computed as `drums + bass + other`

`full` returns:
- `vocals`
- `drums`
- `bass`
- `other`

The existing local WAV encoding, ZIP building, object URLs, and optional app-data uploads remain in place. No remote audio-processing job is submitted.

## Synced Lyrics Contract

Synced Lyrics must reuse the same HTDemucs separator:

1. Decode source to 44.1 kHz stereo.
2. Run HTDemucs and select the `vocals` stem.
3. Downmix vocals to mono and resample to 16 kHz.
4. Transcribe in explicit 30-second-or-smaller Whisper chunks rather than passing the whole song to one long-audio pipeline invocation.
5. Offset each chunk's timestamps into song time and merge them into one ordered transcript.
6. Build LRC/plain text with the existing `buildLyricsFiles` formatter.
7. Save track lyrics only when a non-empty reliable transcript is produced.

Whisper remains `onnx-community/whisper-tiny` in the current local worker. WebGPU is used only after a successful adapter probe; WASM remains the fallback. The existing FP32 WASM model-session choice stays in place unless a new regression proves it incompatible.

## Whisper Chunking

- Maximum chunk duration: 30 seconds.
- Use a small overlap between adjacent chunks so words at boundaries are not lost.
- Assign each returned timestamped phrase to one chunk acceptance window based on phrase midpoint, preventing duplicate lines in overlap regions.
- Offset accepted timestamps by the chunk start time.
- Emit progress as `Transcribing vocals locally… X/Y`.
- If no chunks contain text, fail without overwriting existing lyrics.

## Source and Persistence

Keep the current browser-local source rules: local `file_data` when available, otherwise refreshed cloud media URL. Generated files may use the existing authenticated AWS app-data upload categories. AWS is persistence only, not the inference runtime.

## UI

Update Lyrics copy so it accurately states that EZ-WAY first isolates vocals locally with Demucs and then transcribes locally. Stem Separation copy should identify Demucs rather than generic/local Spleeter behavior. Existing result/download UI stays unchanged.

## Error Handling

- Model download/session error: report a local Demucs model error.
- No usable WebGPU: automatically use WASM; do not ask the user to enable unsafe Chrome flags.
- Browser memory failure: surface a clear local processing error; do not fall back to Render/AWS Audio Tools.
- Empty transcript: leave existing lyrics unchanged.
- Partial stem failure: do not expose the job as completed.

## Testing

Add regression coverage for:
- Demucs constants, segmenting, overlap weighting, and 4-stem extraction order.
- Worker source uses HTDemucs single-file model and has a WebGPU adapter probe plus WASM fallback.
- Browser Audio Tools lyrics route invokes separation before transcription and transcribes the isolated vocal signal.
- Whisper worker explicitly chunks long PCM and offsets/merges timestamps.
- Existing stem/lyrics result contracts continue to pass.
- TypeScript and production build pass before merge.

## Production Success Criteria

- Stem Separation no longer references or loads the Spleeter model URLs.
- Synced Lyrics reaches Demucs vocal isolation before Whisper.
- Long-track transcription performs multiple bounded Whisper inference calls with progress.
- No lyrics/stem action calls `VITE_AUDIO_TOOLS_URL`, Render, or AWS Audio Tools compute.
- GitHub CI passes and the merged commit completes Amplify BUILD, DEPLOY, and VERIFY.
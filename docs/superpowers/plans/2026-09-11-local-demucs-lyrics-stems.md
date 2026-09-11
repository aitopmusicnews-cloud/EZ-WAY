# Local HTDemucs Lyrics & Stems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EZ-WAY's browser-local Spleeter stem engine with HTDemucs and make Synced Lyrics isolate vocals with HTDemucs before bounded local Whisper transcription.

**Architecture:** `stems.worker.ts` becomes a single-file HTDemucs ONNX overlap-add worker with WebGPU adapter probing and WASM fallback. `browserAudioTools.ts` reuses that separator for both stems and lyrics, converting the Demucs vocal stem to 16 kHz mono for Whisper. `lyrics.worker.ts` performs explicit overlapped time chunks and merges timestamped phrases into global song time.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, `onnxruntime-web` 1.29, Transformers.js 4.2.0, Web Workers, Node 22 test runner.

**Spec:** `docs/superpowers/specs/2026-09-11-local-demucs-lyrics-stems-design.md`

## Global Constraints

- No AWS Audio Tools, Render, or other remote inference fallback for lyrics or stems.
- HTDemucs model: `StemSplitio/htdemucs-onnx/htdemucs_fp16weights.onnx`.
- Demucs input: 44.1 kHz stereo, 343980 samples per segment, 25% overlap.
- Demucs output order: drums, bass, other, vocals.
- Whisper continues to run locally with `onnx-community/whisper-tiny`.
- Preserve existing `AudioToolJobResult`, WAV, ZIP, and generated-file persistence contracts.
- Use TDD: each behavior change gets a failing regression before implementation.

---

### Task 1: Add HTDemucs overlap-add core and regression coverage

**Files:**
- Create: `src/services/demucsCore.ts`
- Create: `src/services/demucsCore.test.ts`
- Modify: `.github/workflows/music-intelligence-verify.yml`

**Interfaces:**
- Produces `DEMUCS_SAMPLE_RATE`, `DEMUCS_SEGMENT_SAMPLES`, `DEMUCS_OVERLAP_SAMPLES`, `DEMUCS_STRIDE_SAMPLES`, `DEMUCS_STEMS`.
- Produces `createDemucsWindow(segmentSamples, overlapSamples)` and `extractDemucsStemRows(data, stemIndex, channels, segmentSamples)` for worker use and deterministic tests.
- Keep `sumStereoStems` behavior available by moving/re-exporting it from the new core or retaining a compatibility export in `spleeterCore.ts` until all consumers migrate.

- [ ] **Step 1: Write the failing test**

Test constants, a linear overlap window, and extraction offsets for `[drums,bass,other,vocals]`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test src/services/demucsCore.test.ts`
Expected: FAIL because `demucsCore.ts` does not exist.

- [ ] **Step 3: Implement the minimal core**

Create pure TypeScript helpers only; no ONNX runtime import in the core.

- [ ] **Step 4: Run the test to verify it passes**

Run the same Node test and expect PASS.

- [ ] **Step 5: Add the test to CI and commit**

Add a `Browser HTDemucs DSP tests` step to the workflow.

### Task 2: Replace Spleeter worker inference with single-file HTDemucs

**Files:**
- Modify: `src/workers/stems.worker.ts`
- Modify: `src/services/stemsWorkerClient.test.ts`
- Modify: `src/services/spleeterCore.ts` only if needed for compatibility cleanup

**Interfaces:**
- `separatePcmLocally(stereo, onProgress)` remains unchanged.
- Worker protocol remains `{ id, type: 'separate', left, right, sampleRate }` -> progress/result/error.
- Result remains `{ vocals, drums, bass, other }` with stereo float32 at 44.1 kHz.

- [ ] **Step 1: Add failing worker-source regression assertions**

Assert the worker references `StemSplitio/htdemucs-onnx`, `htdemucs_fp16weights.onnx`, input name `mix`, output `stems`, `requestAdapter()`, and WASM fallback; assert old `spleeter-4stems-onnx` is absent.

- [ ] **Step 2: Run worker protocol tests and verify RED**

Run: `node --experimental-strip-types --test src/services/stemsWorkerClient.test.ts`
Expected: FAIL on HTDemucs assertions.

- [ ] **Step 3: Implement HTDemucs session and overlap-add**

Use `onnxruntime-web/webgpu`. Probe `navigator.gpu.requestAdapter()`. Try WebGPU only when the probe succeeds, otherwise create a WASM session. Set input tensor shape `[1,2,343980]`, process source in 25%-overlapped segments, apply the deterministic overlap window, extract all four output stem rows, and normalize by accumulated weights.

- [ ] **Step 4: Run worker tests and TypeScript check**

Run worker test, then `npm run lint`; both must pass.

- [ ] **Step 5: Commit**

Commit the worker migration separately from the lyrics integration.

### Task 3: Route Synced Lyrics through Demucs vocals

**Files:**
- Modify: `src/services/browserAudioTools.ts`
- Modify: `src/services/browserAudioTools.test.ts`
- Modify: `src/components/TrackOptionsMenu.tsx`

**Interfaces:**
- `runLocalAudioTool(track, 'lyrics', ..., onProgress)` stays unchanged.
- Lyrics path calls the same `separatePcmLocally` separator used by stems.
- Add a focused helper that downmixes the isolated stereo vocals and resamples them to 16 kHz before calling `transcribe`.

- [ ] **Step 1: Write failing lyrics-flow regression**

Inject fake decode/separate/transcribe dependencies and assert `separate` is called before `transcribe`; assert transcription receives samples derived from the fake vocals stem rather than the original mix.

- [ ] **Step 2: Run browser Audio Tools test and verify RED**

Run: `node --experimental-strip-types --test src/services/browserAudioTools.test.ts`.

- [ ] **Step 3: Implement vocals-first lyrics flow**

Decode the source using the existing 44.1 kHz stereo stem decoder, separate with Demucs, downmix vocals, resample to 16 kHz, then transcribe. Reuse the result formatting/persistence code already present.

- [ ] **Step 4: Update UI copy**

Change Lyrics copy to say vocals are isolated locally with Demucs before transcription; change Stem Separation copy to name Demucs.

- [ ] **Step 5: Run browser Audio Tools test and TypeScript check; commit**

Both must pass.

### Task 4: Make Whisper inference explicitly chunked and timestamp-safe

**Files:**
- Modify: `src/workers/lyrics.worker.ts`
- Modify: `src/services/lyricsWorkerClient.test.ts`

**Interfaces:**
- Worker protocol stays unchanged.
- Output remains `{ language, language_probability, chunks }` where timestamps are absolute seconds in the song.

- [ ] **Step 1: Add failing source/protocol regression**

Assert the worker defines explicit local chunk/overlap constants, loops over PCM slices, emits `Transcribing vocals locally… X/Y`, calls the transcriber per slice without long-audio `chunk_length_s`, and offsets accepted timestamps by each chunk start.

- [ ] **Step 2: Run lyrics worker tests and verify RED**

Run: `node --experimental-strip-types --test src/services/lyricsWorkerClient.test.ts`.

- [ ] **Step 3: Implement bounded chunk inference**

Use <=30 s chunks with a small overlap. Accept returned phrases by timestamp midpoint within each chunk's non-duplicating acceptance window, offset accepted timestamps to absolute song time, and combine ordered chunks. Preserve fallback behavior when the pipeline returns only `text`.

- [ ] **Step 4: Run lyrics worker tests and TypeScript check; commit**

Both must pass.

### Task 5: Full verification, PR, merge, and production deployment

**Files:**
- No feature code unless verification reveals a defect.

**Interfaces:**
- Production remains Amplify app `d1wu55zn1feotm`, branch `main`.

- [ ] **Step 1: Run/verify the full GitHub Actions workflow**

Open a PR to `main` and require all existing tests, new Demucs tests, TypeScript check, and production build to pass.

- [ ] **Step 2: Review PR diff for forbidden legacy behavior**

Confirm `stems.worker.ts` no longer references Spleeter model URLs and lyrics/stem UI execution still calls `runLocalAudioTool`, not `runAudioToolsJob`.

- [ ] **Step 3: Merge only after green CI**

Squash merge to `main`.

- [ ] **Step 4: Verify Amplify production job on the exact merge commit**

Use AWS Amplify `GetJob`/`ListJobs` and require `BUILD`, `DEPLOY`, and `VERIFY` all `SUCCEED`.

- [ ] **Step 5: Report live status with exact PR, merge commit, and Amplify job ID**

Do not claim the feature is live until fresh deployment evidence confirms the exact merged commit.
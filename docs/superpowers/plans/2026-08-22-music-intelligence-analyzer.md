# Music Intelligence Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EZ-WAY's unreliable analyzer selection with one automatic, reusable music-intelligence pipeline for every uploaded track.

**Architecture:** The existing Modal Audio Tools service receives a new `analysis` job action. All-In-One-Infer supplies functional structure and tempo; a CLAP music model supplies ranked genre/mood/instrument labels. The browser uploads the audio first, creates the track, submits one analysis job, saves the canonical profile in Supabase, and copies compact legacy fields back to the Track row.

**Tech Stack:** React 19, TypeScript 5.8, Supabase, Modal Python 3.11, PyTorch, all-in-one-infer, Hugging Face Transformers CLAP, existing Web Audio DSP fallback.

**Spec:** `docs/superpowers/specs/2026-08-22-music-intelligence-analyzer-design.md`

## Global Constraints

- No GPT/OpenAI call in core song analysis.
- No TPU requirement.
- Reuse the existing EZ-WAY Modal Audio Tools deployment and model volume.
- New uploads automatically analyze once.
- Existing saved analysis is reused unless explicitly forced or source audio changes.
- Low-confidence results must be marked uncertain rather than fabricated.
- Existing synced-lyrics and stem-separation behavior must remain functional.

---

### Task 1: Shared profile contract and normalization

**Files:**
- Create: `src/services/musicIntelligence.ts`
- Create: `src/services/musicIntelligence.test.mjs`
- Modify: `src/types.ts`

**Interfaces:**
- Produces `MusicIntelligenceProfile`, `MusicSection`, `RankedLabel`, `profileToLegacyTrackUpdates`, and Audio Tools client helpers.

- [ ] **Step 1: Write a failing normalization test** that asserts a profile with ranked labels produces legacy BPM/key/tag updates without duplicate special tags.
- [ ] **Step 2: Run the test and verify RED.**
- [ ] **Step 3: Implement the minimal profile types, normalization helpers, and `profileToLegacyTrackUpdates` function.**
- [ ] **Step 4: Run the test and verify GREEN.**
- [ ] **Step 5: Extend `Track` with optional analysis status/version fields only if needed by the client; keep the canonical profile in the analysis table.**

### Task 2: Persistent canonical analysis storage

**Files:**
- Modify: `schema.sql`
- Modify: `supabase_schema.sql`
- Modify: `schema.md`
- Modify: `supabase_schema.md`

**Interfaces:**
- Produces table `track_analysis(track_id, analyzer_version, profile, status, error, source_fingerprint, created_at, updated_at)`.

- [ ] **Step 1: Add schema assertions/documentation for the new table and unique `track_id`.**
- [ ] **Step 2: Add idempotent SQL for the table, FK cascade, updated timestamp, and index.**
- [ ] **Step 3: Verify the SQL is syntactically consistent with the existing Supabase schema conventions.**

### Task 3: Modal v5 analysis worker

**Files:**
- Create: `modal/music_intelligence_core.py`
- Create: `modal/test_music_intelligence_core.py`
- Create: `modal/audio_tools_agent_v5.py`
- Modify: `AUDIO_TOOLS.md`

**Interfaces:**
- Consumes existing Audio Tools `file_url` payload and model/output Volumes.
- Produces `action: "analysis"` job results containing a normalized music-intelligence profile.

- [ ] **Step 1: Write failing Python tests** for ranking aggregation, confidence clipping, chapter conversion, and stable profile shape.
- [ ] **Step 2: Run `python -m unittest modal/test_music_intelligence_core.py -v` and verify RED.**
- [ ] **Step 3: Implement pure normalization/ranking helpers in `music_intelligence_core.py`.**
- [ ] **Step 4: Re-run tests and verify GREEN.**
- [ ] **Step 5: Build `audio_tools_agent_v5.py` on top of the existing v4 behavior. Install `all-in-one-infer`, `transformers`, `librosa`, and `soundfile`; cache `laion/larger_clap_music` in the existing model Volume.**
- [ ] **Step 6: Add `analyze_music` Modal method. Run All-In-One-Infer for BPM/segments and CLAP across multiple full-track windows for genre, mood/style, and instrument/production taxonomies. Aggregate window scores through the tested helpers.**
- [ ] **Step 7: Extend `/health` and `/jobs` so `action=analysis` is accepted while `lyrics` and `stems` retain current behavior.**
- [ ] **Step 8: Document deployment and model preparation in `AUDIO_TOOLS.md`.**

### Task 4: App-wide Music Intelligence client

**Files:**
- Modify: `src/services/musicIntelligence.ts`

**Interfaces:**
- `submitMusicAnalysis({trackId, trackName, fileUrl, duration, force?})`
- `pollMusicAnalysis(callId)`
- `saveMusicAnalysis(trackId, profile, sourceFingerprint)`
- `getMusicAnalysis(trackId)`

- [ ] **Step 1: Add tests for payload generation and profile-to-track updates.**
- [ ] **Step 2: Implement Audio Tools URL validation, submit/poll behavior, and Supabase upsert/read helpers.**
- [ ] **Step 3: Ensure an existing completed profile returns without a new job unless `force=true`.**

### Task 5: Automatic upload integration

**Files:**
- Modify: `src/components/UploadZone.tsx`

**Interfaces:**
- Consumes `analyzeAndPersistUploadedTrack(track, file)` from Music Intelligence service.

- [ ] **Step 1: Change the single-upload sequence so audio uploads before analysis and the track row is created in `processing` state.**
- [ ] **Step 2: Submit one analysis job using the final cloud `file_url`.**
- [ ] **Step 3: Persist the profile, apply legacy BPM/key/tags, and mark the track `ready`.**
- [ ] **Step 4: On failure, keep the uploaded track, mark it `error`, and surface a retryable error instead of fabricated metadata.**
- [ ] **Step 5: Apply the same sequence to bulk uploads while preserving sequential queue processing.**

### Task 6: Replace the old MediaStore analyzer entry point

**Files:**
- Modify: `src/context/MediaStoreContext.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `analyzeTrack` becomes a compatibility wrapper over Music Intelligence rather than switching between `ai` and `dsp` genre logic.

- [ ] **Step 1: Remove `analysisEngine` and `setAnalysisEngine` from the public store contract once no visible UI depends on them.**
- [ ] **Step 2: Make manual Analyze/Re-Analyze use the shared Music Intelligence service and canonical saved profile.**
- [ ] **Step 3: Keep local DSP only as a fallback/technical helper, not the canonical genre/mood/instrument classifier.**
- [ ] **Step 4: Remove unused `Cpu`/`Sparkles` imports and the temporary CSS hiding rule after the legacy block is deleted from JSX.**

### Task 7: Verification

**Files:**
- No new production files.

- [ ] **Step 1: Run Python core tests.** Expected: all pass.
- [ ] **Step 2: Run TypeScript tests for pure normalization/client payload helpers.** Expected: all pass.
- [ ] **Step 3: Run `npm run lint`.** Expected: exit 0.
- [ ] **Step 4: Run `npm run build`.** Expected: exit 0.
- [ ] **Step 5: Verify the committed diff contains no new GPT/OpenAI/DataForSEO dependency and preserves existing lyrics/stems actions.**
- [ ] **Step 6: Verify the final deployment health response advertises `analysis`, `synced_lyrics`, `vocals_instrumental`, and `full_stems`.**

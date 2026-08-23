# EZ AI Albumcover Studio Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native EZ AI Albumcover Studio tool that selects an existing EZ-WAY track, sends saved track intelligence to the existing cover-generation backend, returns three cover choices, saves the selected 3000×3000 cover back to the track, and prompts after a track upload when cover art is missing.

**Architecture:** Pure cover mapping and prompt-decision logic lives in `albumCoverCore.ts`; API calls live in `albumCoverStudio.ts`; `AlbumCoverStudio.tsx` owns the native UI. `Shell.tsx` owns native routing and detects newly-added tracks without artwork, keeping `UploadZone.tsx` decoupled from the cover generator. The shared `premiumFeatures.ts` entitlement boundary stays enabled now and can become a subscription gate later.

**Tech Stack:** React 19, TypeScript, node:test, existing MediaStore, existing Music Intelligence service, existing FastAPI EZ AI Album Cover Studio backend.

**Spec:** `docs/superpowers/specs/2026-08-22-ezway-albumcover-studio-integration-design.md`

## Global Constraints

- Implement on `feature/music-intelligence-analyzer`; merge to `main` only after verification and explicit user approval.
- Albumcover Studio is enabled for the current single-user phase; no paywall and no second login.
- Reuse the existing EZ-WAY track library and Music Intelligence profile; do not create a second acoustic-analysis flow in EZ-WAY.
- Default generation count is exactly 3.
- Provider API keys remain server-side; browser code only receives a backend URL.
- A failed generation or skipped prompt must never damage the source track.
- Generated alternatives do not overwrite track art until the user chooses **Save Cover to Track**.

---

### Task 1: Pure cover integration core

**Files:** `src/services/albumCoverCore.test.ts`, `src/services/albumCoverCore.ts`

- [x] Write failing tests.
- [x] Verify RED.
- [x] Implement minimal core.
- [x] Verify GREEN.

### Task 2: Albumcover API client

**Files:** `src/services/albumCoverStudio.ts`

- [x] Implement a browser-safe client using `VITE_ALBUM_COVER_API_URL`.
- [x] Send saved Music Intelligence plus lyrics as text creative context, not a duplicate audio-analysis request.
- [x] Request exactly 3 variations.
- [x] Keep provider secrets server-side.

### Task 3: Native Albumcover Studio UI

**Files:** `src/components/AlbumCoverStudio.tsx`

- [x] Add track dropdown and auto-fill summary.
- [x] Generate exactly three covers.
- [x] Save selected cover to the existing track artwork.
- [x] Add Generate New Options and Parental Advisory toggle.

### Task 4: Missing-cover prompt

**Files:** `src/components/Shell.tsx`

- [x] Detect a newly-added track without artwork.
- [x] Show **No cover art detected** with **Generate Cover** and **Skip for Now**.
- [x] Generate Cover navigates to Albumcover Studio with the track preselected.

### Task 5: Navigation and route wiring

**Files:** `src/components/Shell.tsx`

- [x] Add Albumcover Studio to More Tools.
- [x] Add Copyrights to More Tools.
- [x] Remove Releases from visible navigation.
- [x] Route both new native studios through Shell.

### Task 6: Verification workflow

**Files:** `.github/workflows/music-intelligence-verify.yml`

- [x] Add Copyrights core tests.
- [x] Add Albumcover core tests.
- [x] Keep TypeScript check and production build mandatory.
- [x] Verify Music Intelligence tests, Copyrights tests, Albumcover tests, Python tests/syntax, AWS Lambda syntax, TypeScript, and production build all pass on the implementation head.

### Deployment follow-through

- [x] Trigger the existing EZ-WAY Render preview deployment for the implementation head.
- [x] Confirm the production Albumcover API is AWS-hosted rather than Render-hosted.
- [ ] Set `VITE_ALBUM_COVER_API_URL` in each EZ-WAY deployment environment to the deployed AWS Albumcover API base URL.
- [ ] Configure the AWS Albumcover API CORS allowlist to include `https://ezwaypro.theartistcut.com` plus any required preview/development origins.
- [ ] Apply the slim-mode non-secret backend settings where supported: disable unnecessary concept-ranking/cover-critic/platform-scoring stages while retaining the creative-director stage and exactly three final cover renders.
- [ ] Run one real production Albumcover generation from `https://ezwaypro.theartistcut.com` after the AWS endpoint and CORS settings are confirmed.

# EZ AI Albumcover Studio Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native EZ AI Albumcover Studio tool that selects an existing EZ-WAY track, sends the track data to the existing cover-generation backend, returns three cover choices, saves the selected 3000×3000 cover back to the track, and prompts after a single-track upload when cover art is missing.

**Architecture:** Pure cover mapping and prompt-decision logic lives in `albumCoverCore.ts`; API calls live in `albumCoverStudio.ts`; `AlbumCoverStudio.tsx` owns the native UI. `UploadZone.tsx` only reports the newly created track and whether art is missing; `App.tsx` owns the prompt and navigation so upload remains decoupled from the cover generator. The shared `premiumFeatures.ts` entitlement boundary stays enabled now and can become a subscription gate later.

**Tech Stack:** React 19, TypeScript, node:test, existing MediaStore, existing Music Intelligence service, existing FastAPI EZ AI Album Cover Studio backend.

**Spec:** `docs/superpowers/specs/2026-08-22-ezway-albumcover-studio-integration-design.md`

## Global Constraints

- Work only on `feature/music-intelligence-analyzer`; do not merge to `main`.
- Albumcover Studio is enabled for the current single-user phase; no paywall and no second login.
- Reuse the existing EZ-WAY track library and Music Intelligence profile; do not create a second song-analysis flow in EZ-WAY.
- Default generation count is exactly 3.
- Provider API keys remain server-side; browser code only receives a backend URL.
- A failed generation or skipped prompt must never damage the source track.
- Generated alternatives do not overwrite track art until the user chooses **Save Cover to Track**.

---

### Task 1: Pure cover integration core

**Files:**
- Create: `src/services/albumCoverCore.test.ts`
- Create: `src/services/albumCoverCore.ts`

**Interfaces:**
- Produces: `AlbumCoverDraft`, `buildAlbumCoverDraft`, `trackNeedsCoverPrompt`, `DEFAULT_COVER_VARIATION_COUNT`.

- [ ] **Step 1: Write failing tests**

Cover title/artist/lyrics mapping, Music Intelligence enrichment, exact default variation count of 3, and cover-prompt behavior for absent/present artwork.

- [ ] **Step 2: Run and verify RED**

`node --experimental-strip-types --test src/services/albumCoverCore.test.ts`

- [ ] **Step 3: Implement minimal core**

Create the mapper and missing-cover predicate only.

- [ ] **Step 4: Run and verify GREEN**

`node --experimental-strip-types --test src/services/albumCoverCore.test.ts`

### Task 2: Albumcover API client

**Files:**
- Create: `src/services/albumCoverStudio.ts`

**Interfaces:**
- Consumes: `AlbumCoverDraft`, track audio Blob.
- Produces: `createAlbumCoverGeneration`, `getAlbumCoverGeneration`, `regenerateAlbumCovers`, `downloadAlbumCover` and response types matching the existing FastAPI backend.

- [ ] **Step 1: Implement a browser-safe client**

Use `VITE_ALBUM_COVER_API_URL`, append `/api`, send multipart audio/lyrics/title/artist/parental advisory/collection id, request exactly 3 variations, and expose polling/regeneration/download helpers.

- [ ] **Step 2: Syntax/type-check through the repository verification workflow**

No provider secret is accepted by this module.

### Task 3: Native Albumcover Studio UI

**Files:**
- Create: `src/components/AlbumCoverStudio.tsx`

**Interfaces:**
- Consumes: MediaStore tracks/updateTrack/uploadFile, Music Intelligence profile, album-cover core/client.
- Props: optional `initialTrackId`, optional `onClearInitialTrackId`.

- [ ] **Step 1: Add track dropdown and auto-fill summary**

Selecting a library track loads Music Intelligence and shows title, artist, genre, mood, style, lyrics availability, and current art.

- [ ] **Step 2: Generate exactly three covers**

Resolve the track audio, submit the backend request, poll until terminal, show three generated choices, and surface clear backend-not-configured/errors.

- [ ] **Step 3: Save selected cover**

Download the chosen variation, upload it to the existing `artwork` bucket, update the selected track art, and leave unselected images untouched.

- [ ] **Step 4: Add Generate New Options and parental advisory toggle**

Use the backend regeneration endpoint with three variations.

### Task 4: Upload missing-cover prompt

**Files:**
- Modify: `src/components/UploadZone.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `UploadZone` reports `{ trackId, missingCover }` for a successful single-track upload.
- `App.tsx` owns prompt state and navigation to Albumcover Studio.

- [ ] **Step 1: Change single upload success callback**

After the track is safely created/analyzed, report the track id and whether art is absent. Upload still succeeds even if the user later skips cover generation.

- [ ] **Step 2: Add the no-cover modal in App**

Copy: **No cover art detected** and two actions: **Generate Cover** and **Skip for Now**.

- [ ] **Step 3: Generate Cover navigates with preselection**

Set Albumcover Studio active, pass the new track id, dismiss upload and prompt. Skip only dismisses the prompt.

### Task 5: Navigation and route wiring

**Files:**
- Modify: `src/components/Shell.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `albumcover` sidebar item**

Label it `Albumcover Studio` with an image/palette style icon under More Tools.

- [ ] **Step 2: Add App route/import**

Add `albumcover` to the active-view union and render `AlbumCoverStudio`.

### Task 6: Verification workflow

**Files:**
- Modify: `.github/workflows/music-intelligence-verify.yml`

- [ ] **Step 1: Add Copyrights core test**

`node --experimental-strip-types --test src/services/copyrightsCore.test.ts`

- [ ] **Step 2: Add Albumcover core test**

`node --experimental-strip-types --test src/services/albumCoverCore.test.ts`

- [ ] **Step 3: Keep TypeScript check and production build mandatory**

The push workflow must fail if App/sidebar/upload wiring does not compile.

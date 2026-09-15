# Stable Media + Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make photos, audio, thumbnails, and videos resilient to expiring AWS signed URLs, eliminate Music Video Maker image flicker, and separate the watermark from the default cover.

**Architecture:** Keep AWS object keys as durable identity and refresh signed URLs through the existing `/media/read-url` endpoint immediately before media use. Add a small frontend media-access layer used by audio/video/render consumers; do not change the database schema or Cognito/API ownership model.

**Tech Stack:** React, TypeScript, Vite, Node test runner/tsx, AWS S3 presigned URLs, existing EZ-WAY data API.

**Spec:** `docs/superpowers/specs/2026-09-15-stable-media-branding-design.md`

## Global Constraints

- Do not change existing AWS database schema.
- Do not remove or rename stable media key fields.
- Do not reintroduce Supabase.
- Retry expired media at most once per operation.
- Keep local object URLs session-only and revoke them when replaced/unmounted.
- Use the first uploaded image as the watermark and the second uploaded image as the default cover.
- Do not merge until existing tests, TypeScript, and production build pass.

---

### Task 1: Single-object AWS media resolver

**Files:**
- Create: `src/services/mediaAccess.ts`
- Create: `src/services/mediaAccess.test.ts`
- Modify: `src/services/dataStore.ts`

**Interfaces:**
- Produces: `resolveMediaAccess(input: { objectKey?: string | null; url?: string | null }): Promise<{ url: string; objectKey: string | null }>`
- Uses the existing `dataStore.refreshMediaUrl` API.

- [ ] Write a failing test proving a stable object key is refreshed through `/media/read-url` and that a current URL is preserved only as fallback input.
- [ ] Run the focused test and confirm it fails because `mediaAccess.ts` does not exist.
- [ ] Implement the minimal resolver and expose only the functionality required by downstream consumers.
- [ ] Run the focused test and confirm it passes.

### Task 2: Track audio refresh and one-time retry

**Files:**
- Modify: `src/services/trackAudioSource.ts`
- Modify/Create: focused track-audio regression tests
- Modify: `src/context/AudioContext.tsx`

**Interfaces:**
- `refreshTrackAudioSource(track)` refreshes `file_key` via the single-object resolver instead of downloading `/bootstrap`.
- Audio playback/resume retries once with a newly resolved source if the current signed URL fails.

- [ ] Write failing tests that prove track audio refresh calls the single-object media endpoint and does not fetch `/bootstrap`.
- [ ] Write a failing regression covering one automatic retry after an expired source.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement minimal source refresh/retry logic without changing play-count/activity behavior.
- [ ] Re-run focused tests.

### Task 3: App-wide image/thumbnail/video refresh

**Files:**
- Modify: `src/context/MediaStoreContext.tsx`
- Modify: `src/components/VideoPreviewModal.tsx`
- Add/modify focused media regression tests.

**Interfaces:**
- MediaStore exposes a small refresh helper capable of refreshing a stable key/current URL and optionally updating in-memory entities.
- Video Preview resolves `video_key`, `thumbnail_key`, and associated track `file_key` before use/download and retries once on failure.

- [ ] Write failing tests for video URL and thumbnail URL refresh from stable keys.
- [ ] Write a failing test proving expired cached signed URLs do not become durable persisted identity when a key exists.
- [ ] Run tests and confirm failures.
- [ ] Implement the smallest state/component changes needed for refresh and retry.
- [ ] Re-run focused tests.

### Task 4: Music Video Maker render stability

**Files:**
- Modify: `src/components/MusicVideoMaker.tsx`
- Add/modify a focused video-render regression test.

**Interfaces:**
- A single preloaded image instance is reused by the animation loop.
- Library track audio is refreshed before preview/recording; custom local audio remains session-local.

- [ ] Write a failing regression that rejects per-frame `new Image()` construction in the draw loop and verifies the dedicated preloaded image path.
- [ ] Run the regression and confirm failure against current code.
- [ ] Implement a preloaded image ref/effect and use it in every draw frame.
- [ ] Resolve library audio before preview/export without affecting custom local files.
- [ ] Re-run focused tests.

### Task 5: Separate watermark and default cover assets

**Files:**
- Create: `public/ogbeatz_watermark.jpeg`
- Create: `public/ogbeatz_default_cover.jpeg`
- Modify: `src/components/MusicVideoMaker.tsx`
- Modify any exact fallback consumers discovered during implementation.

**Interfaces:**
- Watermark path: `/ogbeatz_watermark.jpeg`
- Default cover path: `/ogbeatz_default_cover.jpeg`

- [ ] Write a failing source-level regression proving watermark and default-cover paths are distinct and no longer both point at `/ogbeatz_logo.svg` in Music Video Maker.
- [ ] Run the regression and confirm failure.
- [ ] Add both approved user assets and update exact consumers.
- [ ] Re-run the regression.

### Task 6: Full verification and integration

**Files:**
- No new production scope.

- [ ] Run all focused media/audio/video tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Open a PR against `main` and wait for all normal repository checks.
- [ ] Review the final diff for unrelated changes and confirm YouTube/Spotify/AWS app-data behavior is untouched.
- [ ] Merge only if every required check is green.

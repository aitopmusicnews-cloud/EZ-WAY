# EZ AI Album Cover Studio Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EZ-WAY's simplified Album Cover screen with the standalone EZ AI Album Cover Studio workflow while preserving EZ-WAY track auto-fill/save-back actions and removing the obsolete Pollinations/Flux generator from Edit Metadata.

**Architecture:** Keep `EZ-AI-Album-cover-studio` as the dedicated backend and expand `src/services/albumCoverStudio.ts` to expose its existing workflow endpoints and response schema. Rebuild `src/components/AlbumCoverStudio.tsx` as a native React/Tailwind implementation of the standalone workflow. Keep track selection/auto-fill and artwork save-back as EZ-WAY-only integration actions around that workflow.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS, existing EZ-WAY MediaStore, standalone FastAPI Album Cover API.

**Spec:** `docs/superpowers/specs/2026-09-06-album-cover-studio-integration.md`

## Global Constraints

- Preserve the standalone Album Cover Studio workflow; do not simplify it.
- Auto-fill selected EZ-WAY track data but allow manual source replacement.
- Keep provider secrets server-side behind `VITE_ALBUM_COVER_API_URL`.
- Remove Pollinations/Flux cover-generation code from Edit Metadata but keep manual artwork controls.
- Do not alter unrelated EZ-WAY features.

---

### Task 1: Lock the behavior with source-contract tests

**Files:**
- Create: `src/services/albumCoverIntegration.test.ts`
- Modify: `.github/workflows/music-intelligence-verify.yml`

**Interfaces:**
- Consumes: `src/components/AlbumCoverStudio.tsx`, `src/components/EditTrackModal.tsx`, `src/services/albumCoverStudio.ts`
- Produces: regression assertions for standalone workflow coverage and Edit Metadata cleanup.

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Album Cover Studio preserves the standalone workflow and EZ-WAY actions', () => {
  const component = read('../components/AlbumCoverStudio.tsx');
  const service = read('./albumCoverStudio.ts');
  for (const label of ['Release + source material', 'Generated directions', 'Studio metrics', 'Input versions']) {
    assert.match(component, new RegExp(label.replace(/[+]/g, '\\+')));
  }
  assert.match(component, /Analyze and generate/);
  assert.match(component, /Generate Better/);
  assert.match(component, /Fresh blend/);
  assert.match(component, /Fresh audio path/);
  assert.match(component, /Fresh lyric path/);
  assert.match(component, /Save to EZ-WAY Track/);
  assert.match(service, /\/collections\/\$\{encodeURIComponent\(collectionId\)\}\/versions/);
  assert.match(service, /\/collections\/\$\{encodeURIComponent\(collectionId\)\}\/metrics/);
  assert.match(service, /\/generations\/\$\{encodeURIComponent\(generationId\)\}\/improve/);
  assert.match(service, /\/generations\/\$\{encodeURIComponent\(generationId\)\}\/retry/);
});

test('Edit Metadata contains manual artwork only and no Pollinations or Flux generator', () => {
  const modal = read('../components/EditTrackModal.tsx');
  assert.match(modal, />Edit Metadata</);
  assert.doesNotMatch(modal, /Pollinations|POLLINATIONS|flux-realism|flux-anime|handleGenerateAiArt|aiPrompt|aiModel|aiAspect|aiSeed|artStyle/);
  assert.match(modal, /handleDownloadArtwork/);
  assert.match(modal, /imageInputRef/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts
```

Expected: FAIL because the current simplified component lacks the standalone workflow and Edit Metadata still contains Pollinations/Flux code.

- [ ] **Step 3: Add the test to normal CI**

Add:

```yaml
- name: Album Cover integration workflow tests
  run: node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts
```

- [ ] **Step 4: Commit the red test**

```bash
git add src/services/albumCoverIntegration.test.ts .github/workflows/music-intelligence-verify.yml
git commit -m "test: require standalone Album Cover workflow integration"
```

---

### Task 2: Expand the Album Cover API client to the standalone workflow

**Files:**
- Modify: `src/services/albumCoverStudio.ts`
- Test: `src/services/albumCoverIntegration.test.ts`

**Interfaces:**
- Consumes: `AlbumCoverDraft`, browser `File`/`Blob`, standalone FastAPI routes.
- Produces: `createAlbumCoverGeneration`, `runAlbumCoverPath`, `generateBetterAlbumCovers`, `retryAlbumCoverGeneration`, `getAlbumCoverHistory`, `getAlbumCoverMetrics`, `selectAlbumCoverVariation`, `downloadAlbumCover`.

- [ ] **Step 1: Implement the full standalone response types**

Add typed fields for generation `version`, `has_audio`, `has_lyrics`, `analysis`, `conflict`, variation-set `mood_path`, winner/runner-up, critic state, and variation market/score fields plus collection metrics/history types.

- [ ] **Step 2: Accept standalone source material**

```ts
export interface AlbumCoverSourceInput {
  audio?: Blob | File | null;
  lyricsFile?: File | null;
  lyricsText?: string;
  title?: string;
  artist?: string;
  parentalAdvisory?: boolean;
  variationCount?: 3 | 4 | 5;
  collectionId: string;
}
```

`createAlbumCoverGeneration(input)` must POST `audio`, `lyrics_file`, `lyrics_text`, `title`, `artist`, `parental_advisory`, `variation_count`, `mood_path=auto`, `run_async=true` to `/api/generations`.

- [ ] **Step 3: Add workflow endpoint helpers**

```ts
runAlbumCoverPath(generationId, moodPath, variationCount, action)
generateBetterAlbumCovers(generationId, moodPath, variationCount)
retryAlbumCoverGeneration(generationId)
getAlbumCoverHistory(collectionId)
getAlbumCoverMetrics(collectionId)
```

All URLs must continue to use `VITE_ALBUM_COVER_API_URL` through the existing `apiUrl()` helper.

- [ ] **Step 4: Run the integration test**

Expected: service assertions pass; component/Edit Metadata assertions may still fail until Task 3/4.

- [ ] **Step 5: Commit**

```bash
git add src/services/albumCoverStudio.ts
git commit -m "feat: expose standalone Album Cover Studio workflow"
```

---

### Task 3: Replace the main Album Cover Studio UI with the standalone workflow

**Files:**
- Replace: `src/components/AlbumCoverStudio.tsx`
- Test: `src/services/albumCoverIntegration.test.ts`

**Interfaces:**
- Consumes: MediaStore `tracks`, `updateTrack`, `uploadFile`, `addToast`; `buildAlbumCoverDraft`; expanded Album Cover service.
- Produces: native React version of the standalone workflow plus EZ-WAY track integration actions.

- [ ] **Step 1: Add source-material state and auto-fill**

When a track is selected, set title/artist/lyrics from the track, obtain the current Music Intelligence draft for display, and resolve the track audio from `file_data` first or fetch `file_url` into a Blob when generation starts.

- [ ] **Step 2: Recreate section 01 — Release + source material**

Render editable title/artist, Parental Advisory, MP3 upload, lyrics file, pasted lyrics, 3/4/5 variation count, and `Analyze and generate`. Track selection appears as an EZ-WAY integration control above this section and auto-fills the standalone fields.

- [ ] **Step 3: Recreate section 02 — Generated directions**

Render status/version metadata, backend analysis, mood conflict with Audio/Lyrics buttons, error retry, latest variation set, AI winner/runner-up labels, score/market signals, select/download actions, `Generate Better`, `Fresh blend`, `Fresh audio path`, and `Fresh lyric path` using the backend's own route semantics.

- [ ] **Step 4: Add EZ-WAY save-back**

For the selected variation, download the 3000×3000 PNG from the backend, upload it through `uploadFile('artwork', file)`, and call `updateTrack(selectedTrack.id, { image_url, image_data: file })`. Label the action `Save to EZ-WAY Track`.

- [ ] **Step 5: Recreate section 03/04**

Refresh and render `/collections/{id}/metrics` and `/collections/{id}/versions`. Clicking a history version reloads it through `/generations/{id}`.

- [ ] **Step 6: Run the focused integration test**

Expected: Album Cover workflow assertions pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/AlbumCoverStudio.tsx
git commit -m "feat: replace Album Cover Studio with standalone workflow"
```

---

### Task 4: Remove the obsolete Edit Metadata generator

**Files:**
- Modify: `src/components/EditTrackModal.tsx`
- Test: `src/services/albumCoverIntegration.test.ts`

**Interfaces:**
- Preserves: `imageInputRef`, manual artwork upload, `handleDownloadArtwork`, clear artwork, metadata/lyrics/AWS analysis/save/delete.
- Removes: all Pollinations auth/generation state, handlers, model/aspect/seed/style controls and generated-cover UI.

- [ ] **Step 1: Delete obsolete generator state and handlers**

Remove `aiPrompt`, `generatingArt`, Pollinations connection state, `aiModel`, `aiAspect`, `aiSeed`, `lockedSeedValue`, `artStyle`, `addParentalLabel`, `addTypographyOverlay`, `connectPollinations`, `disconnectPollinations`, `handleSuggestPrompt`, and `handleGenerateAiArt`.

- [ ] **Step 2: Delete the associated generator JSX**

Remove the AI Cover Studio/Pollinations/Flux controls while leaving manual upload/replace/download/clear controls intact.

- [ ] **Step 3: Clean imports and heading**

Remove icons/imports now unused by the deleted generator and change the modal title to `Edit Metadata`.

- [ ] **Step 4: Run focused test**

```bash
node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/EditTrackModal.tsx
git commit -m "refactor: remove Edit Metadata cover generator"
```

---

### Task 5: Full verification and branch completion

**Files:**
- Verify all branch changes.

- [ ] **Step 1: Run normal full CI**

The repository verification workflow must pass the new Album Cover integration test, existing Album Cover core/title tests, share tests, TypeScript check, AWS tests and production build.

- [ ] **Step 2: Review final PR diff**

Confirm no temporary workflow/patch scripts remain and only approved Gmail + Album Cover changes/docs/tests are present.

- [ ] **Step 3: Use `superpowers:finishing-a-development-branch`**

After exact-head verification succeeds, present the required integration menu for base branch `main`.

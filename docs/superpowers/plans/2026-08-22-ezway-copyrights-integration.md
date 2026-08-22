# EZ-WAY Copyrights Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Releases with a native Copyrights tool that selects existing EZ-WAY tracks, auto-fills copyright evidence details, hashes the exact track audio, saves evidence records, and displays downloadable certificate information without a second login.

**Architecture:** Pure mapping/evidence logic lives in `copyrightsCore.ts`; browser persistence and audio resolution live in `copyrights.ts`; `CopyrightsStudio.tsx` owns the native UI. A small `premiumFeatures.ts` boundary returns enabled now and later becomes the subscription gate for Copyrights and EZ AI Albumcover Studio.

**Tech Stack:** React 19, TypeScript, node:test, Web Crypto API, browser localStorage, existing EZ-WAY MediaStore and Music Intelligence service.

**Spec:** `docs/superpowers/specs/2026-08-22-ezway-copyrights-integration-design.md`

## Global Constraints

- Work only on `feature/music-intelligence-analyzer`; do not merge to `main`.
- Copyrights is enabled for the current single-user phase; no paywall and no second login.
- Do not claim official U.S. Copyright Office registration.
- Do not invent authorship, contributors, or creation dates.
- Hash exact audio bytes, never a URL or metadata substitute.
- Preserve a future entitlement id named `albumcover-studio` for EZ AI Albumcover Studio.

---

### Task 1: Copyright mapping, evidence, and entitlement core

**Files:**
- Create: `src/services/copyrightsCore.test.ts`
- Create: `src/services/copyrightsCore.ts`
- Create: `src/services/premiumFeatures.ts`

**Interfaces:**
- Produces: `CopyrightDraft`, `CopyrightEvidenceRecord`, `buildCopyrightDraft`, `createCopyrightEvidence`, `canUsePremiumFeature`.

- [ ] **Step 1: Write the failing core tests**

Test track mapping from legacy tags, enrichment from Music Intelligence, blank co-artists, date fallback, deterministic SHA-256 evidence inputs, and enabled premium feature ids. The test must catch a missing module and fail with assertions rather than crash on import.

- [ ] **Step 2: Run the core test and verify RED**

Run: `node --experimental-strip-types --test src/services/copyrightsCore.test.ts`
Expected: FAIL because the core functions are not implemented.

- [ ] **Step 3: Implement minimal core logic**

Create the focused types, pure mapper, SHA-256 evidence builder, and always-enabled entitlement boundary.

- [ ] **Step 4: Run the core test and verify GREEN**

Run: `node --experimental-strip-types --test src/services/copyrightsCore.test.ts`
Expected: all Copyrights core tests pass.

### Task 2: Browser repository and exact audio resolution

**Files:**
- Create: `src/services/copyrights.ts`

**Interfaces:**
- Consumes: `CopyrightEvidenceRecord` from `copyrightsCore.ts`.
- Produces: `CopyrightRepository`, `browserCopyrightRepository`, `resolveTrackAudioBlob`.

- [ ] **Step 1: Add test cases to `copyrightsCore.test.ts` for repository serialization helpers only if pure helpers are introduced**
- [ ] **Step 2: Implement versioned browser persistence and audio resolution**

Use `track.file_data` first, then fetch `track.file_url`, otherwise throw a clear error. Store evidence records in a versioned localStorage key and sort newest first.

- [ ] **Step 3: Type/syntax-check the service**

Run: `node --experimental-strip-types --check src/services/copyrights.ts`
Expected: PASS.

### Task 3: Native Copyrights Studio UI

**Files:**
- Create: `src/components/CopyrightsStudio.tsx`

**Interfaces:**
- Consumes: MediaStore tracks, `getTrackMusicIntelligence`, Copyright core/service functions.
- Produces: native Copyrights UI with track dropdown, editable review form, registration progress, registered state/history, evidence detail, and certificate download.

- [ ] **Step 1: Build the UI around the tested mapper/service interfaces**

Use a top-level Select Track dropdown. On selection, load the Music Intelligence profile when available, populate the draft, and show editable fields. On registration, resolve exact audio, create/save evidence, and display the completed record.

- [ ] **Step 2: Add evidence disclaimer and certificate download**

Certificate copy must say evidence record and must not imply government registration. Generate a printable/downloadable HTML certificate file from the saved record.

- [ ] **Step 3: Syntax-check the component through the production build later in Task 5**

### Task 4: Replace Releases navigation and route

**Files:**
- Modify: `src/components/Shell.tsx`
- Modify: `src/App.tsx`
- Delete if unused: `src/components/ReleasesHub.tsx`

**Interfaces:**
- Produces: `copyrights` app view routed to `CopyrightsStudio`.

- [ ] **Step 1: Replace the sidebar item**

Remove the `Disc` Releases entry and add a `ShieldCheck`/shield-style Copyrights entry with view id `copyrights` for desktop and mobile.

- [ ] **Step 2: Replace App import/render logic**

Remove `ReleasesHub`, add `CopyrightsStudio`, add `copyrights` to the active view type, and render the studio when selected.

- [ ] **Step 3: Delete `ReleasesHub.tsx` if no references remain**

Search references before deletion.

### Task 5: Verification

**Files:**
- Existing Music Intelligence tests plus new Copyrights tests.

- [ ] **Step 1: Run Copyrights core tests**

`node --experimental-strip-types --test src/services/copyrightsCore.test.ts`

- [ ] **Step 2: Run existing Music Intelligence tests**

`node --experimental-strip-types --test src/services/musicIntelligenceCore.test.ts`

- [ ] **Step 3: Syntax-check standalone services**

`node --experimental-strip-types --check src/services/copyrights.ts`

- [ ] **Step 4: Run production build**

`npm run build`

Expected: successful build with no ReleasesHub import/reference errors.

- [ ] **Step 5: Update the draft PR summary**

Document Copyrights integration, Releases removal, single-user/no-paywall behavior, and future `albumcover-studio` entitlement hook. Do not merge.

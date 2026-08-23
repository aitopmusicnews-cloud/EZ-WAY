# EZ-WAY Copyrights Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Releases in visible navigation with a native Copyrights tool that selects existing EZ-WAY tracks, auto-fills copyright evidence details, hashes the exact track audio, saves evidence records, and displays downloadable certificate information without a second login.

**Architecture:** Pure mapping/evidence logic lives in `copyrightsCore.ts`; browser persistence and audio resolution live in `copyrights.ts`; `CopyrightsStudio.tsx` owns the native UI. `Shell.tsx` routes the native studio. A small `premiumFeatures.ts` boundary returns enabled now and later becomes the subscription gate for Copyrights and EZ AI Albumcover Studio.

**Tech Stack:** React 19, TypeScript, node:test, Web Crypto API, browser localStorage, existing EZ-WAY MediaStore and Music Intelligence service.

**Spec:** `docs/superpowers/specs/2026-08-22-ezway-copyrights-integration-design.md`

## Global Constraints

- Work only on `feature/music-intelligence-analyzer`; do not merge to `main`.
- Copyrights is enabled for the current single-user phase; no paywall and no second login.
- Do not claim official U.S. Copyright Office registration.
- Do not invent contributors.
- Hash exact audio bytes, never a URL or metadata substitute.
- Preserve a future entitlement id named `albumcover-studio` for EZ AI Albumcover Studio.

---

### Task 1: Copyright mapping, evidence, and entitlement core

**Files:** `src/services/copyrightsCore.test.ts`, `src/services/copyrightsCore.ts`, `src/services/premiumFeatures.ts`

- [x] Write failing core tests.
- [x] Verify RED.
- [x] Implement mapping/evidence/entitlement core.
- [x] Verify GREEN.

### Task 2: Browser repository and exact audio resolution

**Files:** `src/services/copyrights.ts`

- [x] Implement versioned browser persistence.
- [x] Resolve exact track audio from `file_data` first, then the stored URL/proxy fallback.

### Task 3: Native Copyrights Studio UI

**Files:** `src/components/CopyrightsStudio.tsx`

- [x] Add Select Track dropdown and saved Music Intelligence auto-fill.
- [x] Keep title/artist/genre/date/contributors/description/lyrics reviewable.
- [x] Create exact-audio SHA-256 evidence and registration fingerprint.
- [x] Add evidence disclaimer and downloadable HTML certificate.
- [x] Add per-track and global evidence history.

### Task 4: Visible navigation and routing

**Files:** `src/components/Shell.tsx`

- [x] Remove Releases from visible desktop/mobile navigation.
- [x] Add Copyrights navigation entry.
- [x] Route `copyrights` to `CopyrightsStudio`.

Note: the legacy `ReleasesHub` source/import path remains unreachable dead code in `App.tsx`; it is no longer exposed in navigation. Full physical deletion is separate cleanup because `App.tsx` is a very large legacy file and was intentionally not rewritten as part of this integration.

### Task 5: Verification

- [x] Copyrights core tests pass.
- [x] Music Intelligence core tests pass.
- [x] Python core/syntax checks pass.
- [x] AWS Lambda syntax passes.
- [x] Full TypeScript check passes.
- [x] Production build passes.

Copyrights is fully usable in the current single-user/browser-persistence phase. Future premium/cloud synchronization can replace the repository/auth boundary without redesigning the page.

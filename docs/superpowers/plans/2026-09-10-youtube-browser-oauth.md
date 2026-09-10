# YouTube Browser OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production EZ-WAY YouTube connection work from AWS Amplify without depending on the suspended Render Node server or exposing a Google client secret.

**Architecture:** Keep the existing YouTubeHubLegacy UI unchanged. Add a browser-side YouTube transport that uses Google Identity Services OAuth token flow with the public OAuth client ID, calls YouTube Data API directly, and transparently intercepts the legacy `/api/youtube/*` connection/state/videos/comments/upload requests from the small YouTubeHub wrapper. Amplify injects `VITE_GOOGLE_CLIENT_ID` from the already configured public client ID; `GOOGLE_CLIENT_SECRET` remains unused by browser code.

**Tech Stack:** React, TypeScript, Vite, Google Identity Services OAuth 2.0 token client, YouTube Data API v3, Node test runner, AWS Amplify.

**Spec:** User requested the YouTube connection be hard-wired and carried through production until live.

## Global Constraints

- Production remains `https://ezwaypro.theartistcut.com` on AWS Amplify.
- Never compile `GOOGLE_CLIENT_SECRET` into browser JavaScript.
- Preserve existing YouTubeHubLegacy UI behavior and labels.
- Use Google OAuth token flow with scopes `youtube.readonly` and `youtube.upload`.
- Store short-lived access tokens in session storage only.
- Direct YouTube upload uses the resumable upload protocol.
- All unrelated HTTP requests must continue to the native browser fetch implementation.

---

### Task 1: Browser YouTube transport and regression tests

**Files:**
- Create: `src/services/youtubeBrowser.ts`
- Create: `src/services/youtubeBrowser.test.ts`

**Interfaces:**
- Produces: `createYouTubeBrowserClient`, `createYouTubeFetchBridge`, `preloadGoogleIdentityServices`, and `YOUTUBE_OAUTH_SENTINEL_URL`.

- [ ] **Step 1: Write failing tests** covering configuration errors, state lookup, transparent fetch routing, passthrough behavior, and upload routing.
- [ ] **Step 2: Run tests and confirm they fail because the service does not exist.**
- [ ] **Step 3: Implement the minimal browser OAuth/Data API transport.**
- [ ] **Step 4: Run tests and confirm they pass.**
- [ ] **Step 5: Commit.**

### Task 2: Legacy UI bridge and safe public client configuration

**Files:**
- Modify: `src/components/YouTubeHub.tsx`
- Modify: `vite.config.ts`
- Modify: `src/services/auditedConnections.test.ts`

**Interfaces:**
- Consumes: `createYouTubeFetchBridge`, `preloadGoogleIdentityServices`, `YOUTUBE_OAUTH_SENTINEL_URL`.

- [ ] **Step 1: Add failing audit assertions** requiring the wrapper to install the YouTube browser bridge, requiring `VITE_GOOGLE_CLIENT_` to be an allowed public prefix, and forbidding browser references to `GOOGLE_CLIENT_SECRET`.
- [ ] **Step 2: Run the audit test and confirm failure.**
- [ ] **Step 3: Install and clean up the scoped fetch/window.open bridge from `YouTubeHub.tsx`; add the safe Vite public client-ID prefix.**
- [ ] **Step 4: Run the audit test and full verification workflow.**
- [ ] **Step 5: Commit.**

### Task 3: Production configuration and verification

**Files:**
- No secret-bearing source files.

**Interfaces:**
- Amplify environment supplies `VITE_GOOGLE_CLIENT_ID` with the same value as the existing `GOOGLE_CLIENT_ID` environment variable.

- [ ] **Step 1: Configure the Amplify app-level `VITE_GOOGLE_CLIENT_ID` without exposing its value in logs or source.**
- [ ] **Step 2: Merge the verified branch to `main`.**
- [ ] **Step 3: Confirm Amplify build/deploy/verify succeeds.**
- [ ] **Step 4: Fetch the production bundle and verify the browser YouTube transport is deployed and `/api/youtube/auth-url` no longer depends on a server endpoint.**
- [ ] **Step 5: Verify the production site and document any Google Console origin restriction if Google rejects the existing client ID.**

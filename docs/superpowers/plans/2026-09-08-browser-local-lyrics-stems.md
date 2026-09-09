# Browser-Local Lyrics & Stems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move EZ-WAY Synced Lyrics and Stem Separation from the Render `/jobs` compute path into the browser while preserving existing UI/result contracts and AWS persistence.

**Architecture:** Keep Music Intelligence unchanged. Add a browser-local Audio Tools facade that resolves the track source, runs Whisper transcription and four-stem separation in dedicated Web Workers, builds LRC/text/WAV/ZIP outputs locally, and optionally persists generated files through the authenticated AWS app-data presigned-upload API. Legacy Render/AWS Audio Tools code remains dormant for rollback but no production Lyrics/Stems consumer calls it.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, `@huggingface/transformers@4.2.0`, `onnxruntime-web@1.29.0`, `fourier-transform@2.4.1`, JSZip, Web Audio API, Web Workers, AWS S3 presigned uploads.

**Spec:** `docs/superpowers/specs/2026-09-08-browser-local-lyrics-stems-design.md`

## Global Constraints

- Browser-local Lyrics and Stems are the sole production compute path for these two features.
- Do not change the existing browser-local Music Intelligence analyzer.
- Do not add Modal, Gemini, Render, ECS, Lambda-worker, or other paid inference fallbacks.
- Do not upgrade Render.
- Do not delete legacy Render/AWS Audio Tools infrastructure in this PR.
- Lyrics must never invent text when transcription is empty or unreliable.
- Stems must never expose partial/fake files as complete results.
- Prefer `track.file_data`; otherwise refresh/use the current AWS signed source URL.
- Keep `AudioToolJobResult`, `StemMode`, progress callbacks, LRC/plain downloads, two-stem/full modes, individual downloads, and ZIP behavior compatible with current UI.
- Use `onnx-community/whisper-tiny` for browser transcription. Whisper code/model weights are MIT.
- Do not ship the `bakkot/demucs-js` HTDemucs weights because its repository states those weights are personal/research-only.
- Use the four-stem Spleeter ONNX conversion documented by `Best-Practice/spleeter-4stems-onnx`; include attribution/provenance notice and retain licensing caveat in project documentation.
- Heavy inference and transforms must run outside React rendering code; model loads are lazy and cached after first use.
- TDD: every behavior change begins with a failing automated contract.

---

### Task 1: Establish local Audio Tools contracts and source handling

**Files:**
- Create: `src/services/audioToolTypes.ts`
- Create: `src/services/trackAudioSource.ts`
- Create: `src/services/browserAudioTools.test.ts`
- Modify: `src/services/musicIntelligence.ts`
- Modify: `src/services/musicIntelligenceSourceRefresh.test.ts`
- Modify: `src/services/trackActionButtons.test.ts`

**Interfaces:**
- Produces: `AudioToolAction`, `StemMode`, `AudioToolJobResult` shared types.
- Produces: `trackHasUsableAudioSource(track: Track): boolean`.
- Produces: `refreshTrackAudioSource(track: Track, options?): Promise<Track>`.
- Preserves: `refreshTrackAnalysisSource` as a compatibility export from `musicIntelligence.ts`.

- [ ] **Step 1: Write failing browser-local routing/source tests**

Add tests asserting:

```ts
assert.equal(trackHasUsableAudioSource({ ...track, file_url: null, file_data: new Blob(['x']) } as Track), true);
assert.equal(trackHasUsableAudioSource({ ...track, file_url: null, file_data: undefined } as Track), false);
```

and source-code contracts that `AudioAnalyzerStudio.tsx` / `TrackOptionsMenu.tsx` will use `runLocalAudioTool` and will not use `runAudioToolsJob` after the migration.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --experimental-strip-types --test src/services/browserAudioTools.test.ts src/services/musicIntelligenceSourceRefresh.test.ts src/services/trackActionButtons.test.ts
```

Expected: FAIL because the new local contract/source module does not exist and consumers still reference remote jobs.

- [ ] **Step 3: Add shared types and source resolver**

Move the public result/mode types out of `audioTools.ts`; implement source refresh by reusing the existing authenticated `/bootstrap` pattern. `file_data` must bypass remote refresh and be accepted immediately.

- [ ] **Step 4: Make Music Intelligence reuse the shared source resolver without changing behavior**

`musicIntelligence.ts` should import/re-export the source refresh function so existing callers/tests keep working.

- [ ] **Step 5: Run focused source tests**

Expected: source-resolution tests PASS; routing tests remain RED until the local facade/UI tasks are implemented.

- [ ] **Step 6: Commit**

```bash
git add src/services/audioToolTypes.ts src/services/trackAudioSource.ts src/services/browserAudioTools.test.ts src/services/musicIntelligence.ts src/services/musicIntelligenceSourceRefresh.test.ts src/services/trackActionButtons.test.ts
git commit -m "test: define browser audio tools contracts"
```

### Task 2: Add deterministic lyrics formatting core

**Files:**
- Create: `src/services/lyricsCore.ts`
- Create: `src/services/lyricsCore.test.ts`

**Interfaces:**
- Consumes transcription chunks `{ text: string; timestamp: [number | null, number | null] }`.
- Produces: `formatLrcTime(seconds: number): string`.
- Produces: `buildLyricsFiles(chunks): { lyrics: string; plain: string }`.

- [ ] **Step 1: Write failing timestamp/LRC tests**

Cover `0`, minute rollover, centiseconds, trimming blank chunks, chronological LRC lines, and plain-text output.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test src/services/lyricsCore.test.ts
```

Expected: FAIL because `lyricsCore.ts` is missing.

- [ ] **Step 3: Implement minimal pure formatting functions**

Do not use browser APIs in this module.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --experimental-strip-types --test src/services/lyricsCore.test.ts
git add src/services/lyricsCore.ts src/services/lyricsCore.test.ts
git commit -m "feat: add synced lyrics formatter"
```

### Task 3: Add browser Whisper worker/client

**Files:**
- Create: `src/workers/lyrics.worker.ts`
- Create: `src/services/lyricsWorkerClient.ts`
- Create: `src/services/lyricsWorkerClient.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `transcribePcmLocally(pcm: Float32Array, sampleRate: number, onProgress?): Promise<LocalTranscript>`.
- Worker model: `onnx-community/whisper-tiny`.
- Worker reports progress messages and timestamped chunks.

- [ ] **Step 1: Write a failing worker-client protocol test**

Use an injected/fake worker factory; verify request IDs, progress relay, success, errors, and worker termination/cancel behavior without loading a real model in Node CI.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test src/services/lyricsWorkerClient.test.ts
```

- [ ] **Step 3: Add `@huggingface/transformers@4.2.0` and regenerate lockfile**

```bash
npm install @huggingface/transformers@4.2.0 --save-exact
```

- [ ] **Step 4: Implement lazy worker model loading**

Use `pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', ...)`, prefer WebGPU when available, fall back to supported WASM execution, and request timestamps. Never send audio to a server API.

- [ ] **Step 5: Verify protocol tests, TypeScript, build**

```bash
node --experimental-strip-types --test src/services/lyricsWorkerClient.test.ts
npm run lint
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/workers/lyrics.worker.ts src/services/lyricsWorkerClient.ts src/services/lyricsWorkerClient.test.ts
git commit -m "feat: add browser whisper worker"
```

### Task 4: Add Spleeter DSP core and WAV encoding

**Files:**
- Create: `src/services/spleeterCore.ts`
- Create: `src/services/spleeterCore.test.ts`
- Create: `src/services/wav.ts`
- Create: `src/services/wav.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Spleeter constants: sample rate `44100`, FFT size `4096`, hop `1024`, model bins `1024`, chunk frames `512`.
- Produces periodic Hann/STFT/iSTFT helpers and ratio-mask reconstruction helpers.
- Produces `encodeStereoWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob`.

- [ ] **Step 1: Write failing pure DSP/WAV tests**

Test a short synthetic stereo signal: STFT→iSTFT reconstruction tolerance, periodic Hann shape, ratio masks summing to the input spectrum, and valid RIFF/WAVE header/length.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test src/services/spleeterCore.test.ts src/services/wav.test.ts
```

- [ ] **Step 3: Add pinned dependencies**

```bash
npm install onnxruntime-web@1.29.0 fourier-transform@2.4.1 --save-exact
```

- [ ] **Step 4: Implement the pure Spleeter signal pipeline**

Follow the documented 4-stem contract: periodic Hann, 4096/1024 STFT, first 1024 bins, 512-frame chunks, soft ratio masks, average extension to 2049 bins, original phase, overlap-add inverse.

- [ ] **Step 5: Implement WAV encoder**

Encode 16-bit PCM stereo with clamping and correct RIFF sizes.

- [ ] **Step 6: Verify GREEN and commit**

```bash
node --experimental-strip-types --test src/services/spleeterCore.test.ts src/services/wav.test.ts
npm run lint
git add package.json package-lock.json src/services/spleeterCore.ts src/services/spleeterCore.test.ts src/services/wav.ts src/services/wav.test.ts
git commit -m "feat: add browser stem DSP core"
```

### Task 5: Add four-stem ONNX worker/client

**Files:**
- Create: `src/workers/stems.worker.ts`
- Create: `src/services/stemsWorkerClient.ts`
- Create: `src/services/stemsWorkerClient.test.ts`

**Interfaces:**
- Produces: `separatePcmLocally(stereoPcm, sampleRate, onProgress?): Promise<{ vocals; drums; bass; other }>`.
- Model URLs use `Best-Practice/spleeter-4stems-onnx` fp16 weights.
- Worker prefers WebGPU then WASM.

- [ ] **Step 1: Write failing worker protocol tests**

Verify progress, success result shape, error propagation, cancellation, and that no `/jobs`/Render endpoint exists in the worker/client code.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test src/services/stemsWorkerClient.test.ts
```

- [ ] **Step 3: Implement lazy ONNX model loading and inference**

Cache sessions inside the worker; process each stem model for each chunk; reconstruct outputs via `spleeterCore` helpers. Return transferable PCM buffers.

- [ ] **Step 4: Verify tests/lint/build and commit**

```bash
node --experimental-strip-types --test src/services/stemsWorkerClient.test.ts
npm run lint
npm run build
git add src/workers/stems.worker.ts src/services/stemsWorkerClient.ts src/services/stemsWorkerClient.test.ts
git commit -m "feat: add browser stem separation worker"
```

### Task 6: Build browser-local Audio Tools facade

**Files:**
- Create: `src/services/browserAudioTools.ts`
- Modify: `src/services/browserAudioTools.test.ts`
- Modify: `src/services/audioTools.ts`

**Interfaces:**
- Produces:

```ts
runLocalAudioTool(
  track: Track,
  action: 'lyrics' | 'stems',
  mode?: StemMode,
  onProgress?: (status: string) => void,
): Promise<AudioToolJobResult>
```

- `audioTools.ts` remains legacy remote code only and re-exports shared types where compatibility requires it.

- [ ] **Step 1: Expand failing facade tests**

Inject fake source decode, lyric runtime, stem runtime, object URL factory, and uploader. Assert:
- lyrics output has `lyrics`, `files.lrc`, `files.plain`;
- empty transcript rejects;
- two-stem result has vocals+instrumental and ZIP;
- full result has vocals/drums/bass/other and ZIP;
- progress phases are emitted;
- `file_data` works with no cloud URL;
- no remote job fallback is called;
- cloud upload failure preserves local downloads and sets a warning.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test src/services/browserAudioTools.test.ts
```

- [ ] **Step 3: Implement audio loading/decoding/resampling helpers and facade**

Create local `File`/Blob source, decode via Web Audio, resample lyrics to 16 kHz mono and stems to 44.1 kHz stereo as required, call workers, build output files, create local object URLs, and build ZIP using JSZip.

- [ ] **Step 4: Add optional AWS persistence**

Use the existing `dataStore.uploadFile(category, track.id, file)` for generated files when `dataStore.configured`; upload failures must not discard successful local results.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --experimental-strip-types --test src/services/browserAudioTools.test.ts src/services/lyricsCore.test.ts src/services/spleeterCore.test.ts src/services/wav.test.ts
npm run lint
npm run build
git add src/services/browserAudioTools.ts src/services/browserAudioTools.test.ts src/services/audioTools.ts
git commit -m "feat: run lyrics and stems in browser"
```

### Task 7: Extend AWS app-data generated-output persistence

**Files:**
- Modify: `aws/app-data/api/storage.mjs`
- Modify: `aws/app-data/api/storage.test.mjs`

**Interfaces:**
- New private upload categories:
  - `audio-tools-audio` -> generated audio prefix, `audio/*` only.
  - `audio-tools-text` -> generated lyrics/text prefix, `text/*` only.
  - `audio-tools-bundle` -> generated bundle prefix, exact `application/zip` only.

- [ ] **Step 1: Add failing validation/key tests**

Check valid WAV/LRC/plain/ZIP and invalid executable/wrong MIME/oversize files. Assert generated object-key prefixes.

- [ ] **Step 2: Verify RED**

```bash
node --test aws/app-data/api/storage.test.mjs
```

- [ ] **Step 3: Extend category validation minimally**

Allow category config to express either `family` or exact `contentTypes`; retain current categories unchanged.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test aws/app-data/api/storage.test.mjs
git add aws/app-data/api/storage.mjs aws/app-data/api/storage.test.mjs
git commit -m "feat: persist browser audio tool outputs"
```

### Task 8: Rewire Lyrics/Stems UI to the local facade

**Files:**
- Modify: `src/components/AudioAnalyzerStudio.tsx`
- Modify: `src/components/TrackOptionsMenu.tsx`
- Modify: `src/services/trackActionButtons.test.ts`

**Interfaces:**
- Both consumers call `runLocalAudioTool`.
- Both accept `file_data` even without a cloud URL.
- Existing result display/download UI remains compatible.

- [ ] **Step 1: Update/confirm RED routing tests**

Assertions must require `runLocalAudioTool`, forbid `runAudioToolsJob` in those components, and forbid cloud-URL-only guard wording.

- [ ] **Step 2: Rewire components**

Update progress/copy to accurately say local processing; lyrics copy must not claim vocal isolation. Display non-fatal persistence warnings when provided.

- [ ] **Step 3: Verify UI contract tests, button audit, TypeScript/build**

```bash
node --experimental-strip-types --test src/services/trackActionButtons.test.ts src/services/buttonAudit.test.ts
npm run lint
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/AudioAnalyzerStudio.tsx src/components/TrackOptionsMenu.tsx src/services/trackActionButtons.test.ts
git commit -m "feat: wire browser-local lyrics and stems"
```

### Task 9: Update CI regression coverage and stale architecture assertions

**Files:**
- Modify: `.github/workflows/music-intelligence-verify.yml`
- Modify: `src/services/awsOnlyTrackAnalysis.test.ts`

**Interfaces:**
- CI runs all new browser Audio Tools tests.
- Music Intelligence regression language reflects browser-local PR #26 instead of claiming AWS is the active analyzer.

- [ ] **Step 1: Update CI test steps**

Add separate Node test commands for lyrics core, Spleeter core, WAV, worker clients, and browser facade.

- [ ] **Step 2: Correct stale Analyze regression naming/assertions without changing behavior**

Assert one shared browser Music Intelligence path and no legacy `/api/analyze`/Gemini selector.

- [ ] **Step 3: Run all Node frontend tests represented in workflow**

Run the workflow's Node test commands locally, then `npm run lint && npm run build`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/music-intelligence-verify.yml src/services/awsOnlyTrackAnalysis.test.ts
git commit -m "test: verify browser-local audio tools in CI"
```

### Task 10: Replace stale root documentation and add third-party notices

**Files:**
- Replace: `README.md`
- Replace: `AUDIO_TOOLS.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `docs/superpowers/specs/2026-09-08-browser-local-lyrics-stems-design.md`

**Interfaces:**
- README is the current comprehensive operational guide requested by the user.

- [ ] **Step 1: Replace README with current architecture**

Document: EZ-WAY purpose/features, React/Vite app, browser Music Intelligence, browser-local Lyrics/Stems, AWS Cognito/API Gateway/Lambda/Aurora/S3 app-data, Amplify production hosting, environment variables, local development, test commands, deployment flow, security, troubleshooting, and legacy/dormant Render/AWS Audio Tools notes. Remove false OG BEATZ Vault, old Spotify/Render hosting, and Gemini-as-live-Analyze claims.

- [ ] **Step 2: Rewrite AUDIO_TOOLS.md**

Describe browser-local production compute and mark Render/AWS workers as legacy rollback infrastructure.

- [ ] **Step 3: Add notices/provenance**

Document Transformers.js, Whisper MIT code/weights, ONNX Runtime Web MIT, `fourier-transform` MIT, Spleeter/ONNX conversion Apache/MIT provenance, and the model-weight licensing ambiguity noted by the conversion project. Explicitly state restricted HTDemucs browser weights are not bundled.

- [ ] **Step 4: Update spec terminology from generic Demucs-compatible browser model to the selected Spleeter 4-stem ONNX implementation**

- [ ] **Step 5: Run documentation architecture grep**

```bash
! grep -E "OG BEATZ Vault|Gemini for structured music/audio analysis|Processing audio on AWS" README.md AUDIO_TOOLS.md
```

- [ ] **Step 6: Commit**

```bash
git add README.md AUDIO_TOOLS.md THIRD_PARTY_NOTICES.md docs/superpowers/specs/2026-09-08-browser-local-lyrics-stems-design.md
git commit -m "docs: document current EZ-WAY architecture"
```

### Task 11: Full verification, PR review, merge, and deploy verification

**Files:** No new production files unless verification identifies a defect.

- [ ] **Step 1: Run the full verification suite fresh**

Run all workflow tests, Python Render/AWS tests, syntax checks, TypeScript, and production build. Exact CI is authoritative.

- [ ] **Step 2: Open/update PR to `main` and wait for GitHub Actions**

The PR body must state: browser-local Lyrics/Stems; no Render compute calls from UI; model/license choices; AWS persistence extension; README replacement; legacy remote infrastructure retained.

- [ ] **Step 3: Request code review and resolve findings**

Use the Superpowers requesting-code-review workflow. Re-run affected tests after any change.

- [ ] **Step 4: Verify PR mergeability and all required checks green**

No merge on partial/queued/failing checks.

- [ ] **Step 5: Merge the PR to `main`**

User has explicitly authorized commit and merge for this task.

- [ ] **Step 6: Verify `main` contains the merge commit**

Fetch branch/commit after merge.

- [ ] **Step 7: Verify Amplify production deployment for the merged commit**

Confirm BUILD, DEPLOY, and VERIFY success for the job associated with the merge SHA.

- [ ] **Step 8: Report the verification boundary accurately**

If no authenticated browser/computer session is available to run a real track, state that deployment/CI are verified but the production real-audio Lyrics + 2-stem + 4-stem smoke gate remains to be exercised by the user in the browser. Do not claim those real-audio gates passed without evidence.

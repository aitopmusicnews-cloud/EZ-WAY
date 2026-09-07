# Render Audio Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run EZ-WAY analysis, lyrics, and stem jobs on Render with the existing browser `/jobs` contract while using AWS S3/DynamoDB only for source media, state, and outputs.

**Architecture:** Add a focused FastAPI service under `render_audio_tools/`. It accepts the same job contract as the AWS API, executes one background audio job at a time, prefers permanent S3 `file_key` input over expiring `file_url`, reuses the production Gemini analyzer, and persists job/profile state plus generated files back to existing AWS resources.

**Tech Stack:** Python 3, FastAPI, uvicorn, boto3, google-genai, Demucs, faster-whisper, existing React/Vite Audio Tools client.

**Spec:** `docs/superpowers/specs/2026-09-07-render-audio-tools-design.md`

## Global Constraints

- Keep `analysis`, `lyrics`, and `stems` browser request/response behavior compatible with the current `/jobs` client.
- Prefer `file_key` + `SOURCE_BUCKET`; use `file_url` only as a compatibility fallback.
- Default Gemini model is exactly `gemini-3.8-flash`.
- Do not commit AWS credentials or Gemini keys.
- Do not change messaging, video generation, or App Data CRUD behavior.
- Do not delete the AWS Audio Tools stack; it remains the rollback path.

---

### Task 1: Frontend job source contract

**Files:**
- Modify: `src/services/audioTools.ts`
- Test: `src/services/trackActionButtons.test.ts`

**Interfaces:**
- Consumes: `Track.file_key?: string | null`
- Produces: `/jobs` body containing `file_key` alongside the existing `file_url`.

- [ ] **Step 1: Write the failing test**

Add a source-contract assertion that the Audio Tools job payload includes `file_key: track.file_key`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/services/trackActionButtons.test.ts`
Expected: FAIL because `audioTools.ts` currently sends only `file_url`.

- [ ] **Step 3: Write minimal implementation**

Add exactly this field to the `JSON.stringify` payload in `startAudioToolsJob`:

```ts
file_key: track.file_key || undefined,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/services/trackActionButtons.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/audioTools.ts src/services/trackActionButtons.test.ts
git commit -m "feat: send persistent audio source key"
```

### Task 2: Shared Gemini local-file entry point

**Files:**
- Modify: `aws/audio-tools/worker/analyzer.py`
- Modify: `aws/audio-tools/worker/test_gemini_analyzer.py`

**Interfaces:**
- Produces: `MusicIntelligenceEngine.analyze_file(source: Path) -> dict[str, Any]`
- Preserves: `analyze_url(file_url: str) -> dict[str, Any]`

- [ ] **Step 1: Write the failing test**

Add a test that supplies a temporary audio path, fakes Gemini upload/generate/delete, calls `analyze_file`, and asserts the normalized profile provider is `gemini`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest aws.audio-tools.worker.test_gemini_analyzer -v`
Expected: FAIL because `analyze_file` does not exist.

- [ ] **Step 3: Write minimal implementation**

Move the Files API upload/generate/delete block from `analyze_url` into `analyze_file`. Keep `analyze_url` as download-to-temp followed by `return self.analyze_file(source)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest aws.audio-tools.worker.test_gemini_analyzer -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add aws/audio-tools/worker/analyzer.py aws/audio-tools/worker/test_gemini_analyzer.py
git commit -m "refactor: support local Gemini audio files"
```

### Task 3: Render job contract and AWS state adapter

**Files:**
- Create: `render_audio_tools/__init__.py`
- Create: `render_audio_tools/contract.py`
- Create: `render_audio_tools/state.py`
- Create: `render_audio_tools/test_contract.py`

**Interfaces:**
- Produces: `normalize_job_request(payload)`, `public_job_response(item)`, `poll_http_status(status)`.
- Produces: `AwsStateStore.create_job`, `get_job`, `update_job`, `get_track_analysis`, `save_track_analysis`.

- [ ] **Step 1: Write the failing tests**

Cover required action/file source, allowed stem modes, public response filtering, poll status, and a fake DynamoDB adapter path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m unittest render_audio_tools.test_contract -v`
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Write minimal implementation**

Mirror the AWS job contract fields: `action`, `mode`, `file_url`, `file_key`, `track_name`, `track_id`, `source_fingerprint`. Require at least one of `file_key` or a non-blob `file_url`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m unittest render_audio_tools.test_contract -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add render_audio_tools
git commit -m "feat: add Render audio job contract"
```

### Task 4: Render source resolution and processors

**Files:**
- Create: `render_audio_tools/processor.py`
- Create: `render_audio_tools/test_processor.py`

**Interfaces:**
- Produces: `download_source(payload, target_dir, s3_client)` preferring `file_key`.
- Produces: `AudioProcessor.process(payload) -> dict` for `analysis`, `lyrics`, and `stems`.

- [ ] **Step 1: Write the failing tests**

Test that an item with both a stale URL and `file_key` invokes S3 download and never invokes HTTP download. Test URL fallback when no key exists. Test action dispatch with fake analysis/stems/lyrics collaborators.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m unittest render_audio_tools.test_processor -v`
Expected: FAIL because `processor.py` does not exist.

- [ ] **Step 3: Write minimal implementation**

Use `SOURCE_BUCKET` for S3 input. Copy the proven Demucs/Whisper invocation parameters from `aws/audio-tools/worker/worker.py`, use `MusicIntelligenceEngine.analyze_file` for analysis, upload outputs to `OUTPUT_BUCKET`, and persist a completed analysis record through `AwsStateStore`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m unittest render_audio_tools.test_processor -v`
Expected: PASS without downloading model weights because all heavy imports/calls are lazy or mocked.

- [ ] **Step 5: Commit**

```bash
git add render_audio_tools/processor.py render_audio_tools/test_processor.py
git commit -m "feat: process audio jobs on Render"
```

### Task 5: FastAPI service and deployment contract

**Files:**
- Create: `render_audio_tools/app.py`
- Create: `render_audio_tools/requirements.txt`
- Create: `render_audio_tools/README.md`
- Create: `render_audio_tools/test_app.py`
- Modify: `.github/workflows/music-intelligence-verify.yml`

**Interfaces:**
- Produces: `GET /health`, `POST /jobs`, `GET /jobs/{call_id}`, `GET /track-analysis/{track_id}`.
- Uses: one `ThreadPoolExecutor`, default `RENDER_AUDIO_WORKERS=1`.

- [ ] **Step 1: Write the failing API tests**

Use FastAPI `TestClient` with injected fake state/processor/executor. Assert POST returns 202, active poll returns 202, terminal poll returns 200, missing jobs return 404, health reports provider `render`, and track-analysis returns `{record: ...}`.

- [ ] **Step 2: Run tests to verify they fail**

Run after installing test-only dependencies: `python -m pip install --quiet fastapi httpx && python -m unittest render_audio_tools.test_app -v`
Expected: FAIL because app does not exist.

- [ ] **Step 3: Write minimal implementation**

Create an app factory for dependency injection, CORS middleware from `ALLOWED_ORIGINS`, and background submission that marks failed jobs on exceptions.

Runtime requirements must include:

```text
boto3>=1.40,<2
httpx>=0.27,<1
demucs-infer>=4.2.2
faster-whisper==1.2.1
google-genai>=1.60,<2
soundfile>=0.12.1,<1
fastapi>=0.115,<1
uvicorn[standard]>=0.30,<1
```

Document existing Render-service build/start commands and all required environment variables without secret values.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m unittest discover -s render_audio_tools -p 'test_*.py' -v`
Expected: PASS.

- [ ] **Step 5: Add CI verification**

Add a lightweight Render step that installs only FastAPI/httpx test dependencies, runs Render unit tests, then `python -m py_compile render_audio_tools/*.py`.

- [ ] **Step 6: Run full repository verification**

Run all existing workflow commands plus Render tests, TypeScript, and production build.
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add render_audio_tools .github/workflows/music-intelligence-verify.yml
git commit -m "feat: add Render audio tools API"
```

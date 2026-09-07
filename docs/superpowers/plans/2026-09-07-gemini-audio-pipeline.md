# Gemini Audio Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old All-In-One/CLAP/librosa analysis runtime with Gemini while keeping Demucs for stems and faster-whisper for lyrics.

**Architecture:** Keep the existing AWS job API, SQS worker, DynamoDB persistence, and Song Profile contract. Only the analysis engine changes: the worker downloads audio, uploads it to Gemini, requests schema-constrained music metadata, normalizes that response into the existing profile, and cleans up the temporary Gemini file. Deployment injects the Gemini key from AWS Secrets Manager.

**Tech Stack:** Python 3, google-genai, Demucs, faster-whisper, AWS ECS Fargate, SQS, DynamoDB, S3, Secrets Manager, SAM/CloudFormation.

**Spec:** `docs/superpowers/specs/2026-09-07-gemini-audio-pipeline-design.md`

## Global Constraints

- Do not change the browser/API job contract.
- Do not modify messaging or app-data messaging code.
- Demucs remains the stem separator.
- faster-whisper `large-v3` remains the lyric transcriber.
- Gemini is the only music-analysis provider after this change.
- No Gemini API key may be committed to the repository.

---

### Task 1: Lock the New Runtime Contract With Tests

**Files:**
- Modify: `aws/audio-tools/worker/test_runtime_dependency_contract.py`
- Create: `aws/audio-tools/worker/test_gemini_analyzer.py`

**Interfaces:**
- Consumes: existing `build_profile(...)` Song Profile contract.
- Produces: failing tests requiring `profile_from_gemini_payload(payload, model_name)` and Gemini runtime/deployment wiring.

- [ ] **Step 1: Write the failing analyzer normalization test**

Create a test that supplies Gemini-style JSON with BPM, key, ranked genres/moods/styles/instruments, sections, keywords, and confidence values, then asserts the returned profile preserves the canonical field names and records `provider=gemini`.

- [ ] **Step 2: Write failing dependency/deployment contract tests**

Require `google-genai` in requirements, reject `all-in-one-infer`, `transformers`, `librosa`, and `huggingface-hub`, require Demucs/faster-whisper, and require `GeminiApiKeySecretArn` plus ECS `Secrets` wiring in `template.yaml` and secret provisioning in `deploy.sh`.

- [ ] **Step 3: Run tests and verify RED**

Run: `python -m unittest discover -s aws/audio-tools/worker -p 'test_*.py' -v`

Expected: the new Gemini analyzer/runtime assertions fail against the old analyzer and dependencies.

### Task 2: Replace the Analyzer With Gemini

**Files:**
- Replace: `aws/audio-tools/worker/analyzer.py`
- Keep compatible: `aws/audio-tools/worker/music_intelligence_core.py`

**Interfaces:**
- Consumes: HTTPS `file_url`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`.
- Produces: `MusicIntelligenceEngine.analyze_url(file_url) -> dict` in the existing Song Profile shape and `profile_from_gemini_payload(payload, model_name) -> dict` for deterministic normalization/testing.

- [ ] **Step 1: Implement strict response schema and prompt**

Define a JSON schema containing `bpm`, confidence values, key/Camelot key, ranked labels, sections with timestamps, and keywords. Prompt Gemini to analyze musical/audio traits only and never produce lyric transcription.

- [ ] **Step 2: Implement payload normalization**

Convert Gemini ranked items and sections into `build_profile(...)`, clamp confidences through the existing core, record `provider: gemini`, `semantic_model`, and `analysis_device: remote-api`, and set analyzer version `music-intelligence-gemini-v2`.

- [ ] **Step 3: Implement Gemini file lifecycle**

Download with existing `download_audio`, upload using `client.files.upload`, call `client.models.generate_content` with JSON response schema, parse `response.parsed` or JSON text, and delete the uploaded Gemini file in `finally`.

- [ ] **Step 4: Run worker tests and syntax checks**

Run:
`python -m unittest discover -s aws/audio-tools/worker -p 'test_*.py' -v`
`python -m py_compile aws/audio-tools/worker/*.py`

Expected: PASS.

### Task 3: Slim Dependencies and Secure Gemini Credentials

**Files:**
- Modify: `aws/audio-tools/requirements.txt`
- Modify: `aws/audio-tools/template.yaml`
- Modify: `aws/audio-tools/deploy.sh`

**Interfaces:**
- Consumes: operator environment variable `GEMINI_API_KEY`.
- Produces: AWS Secrets Manager secret ARN passed to SAM as `GeminiApiKeySecretArn`; ECS injects secret as `GEMINI_API_KEY`.

- [ ] **Step 1: Replace analysis dependencies**

Remove All-In-One/CLAP/librosa-related packages and add `google-genai>=1.60,<2`, leaving Demucs and faster-whisper intact.

- [ ] **Step 2: Add SAM parameter and ECS secret injection**

Add required `GeminiApiKeySecretArn` parameter, `secretsmanager:GetSecretValue` permission on that ARN for the ECS execution role, ECS `Secrets` mapping for `GEMINI_API_KEY`, and `GEMINI_MODEL=gemini-3.8-flash` environment value.

- [ ] **Step 3: Provision/update the secret in deploy.sh**

Fail fast when `GEMINI_API_KEY` is empty. Create `ezway/audio-tools/gemini-api-key` when absent or update its value when present, fetch the ARN, and pass it to SAM without printing the key.

- [ ] **Step 4: Run infrastructure checks**

Run:
`bash -n aws/audio-tools/deploy.sh`
`cfn-lint aws/audio-tools/template.yaml`

Expected: PASS.

### Task 4: Update Documentation

**Files:**
- Modify: `AUDIO_TOOLS.md`
- Modify: `aws/audio-tools/README.md`

**Interfaces:**
- Produces: operator documentation describing Demucs, Whisper, Gemini, API key setup, model override, and unchanged job contract.

- [ ] **Step 1: Replace old analyzer documentation**

Document Gemini as the music-analysis provider and remove All-In-One/CLAP/librosa claims.

- [ ] **Step 2: Document secure deployment input**

Require `export GEMINI_API_KEY=...` before `./aws/audio-tools/deploy.sh`; explain that the script stores the value in Secrets Manager and ECS receives it as a secret.

- [ ] **Step 3: Document unchanged lyrics/stems behavior**

State clearly that Demucs handles stems and faster-whisper handles timestamped lyrics.

### Task 5: Full Verification, PR, and Merge

**Files:**
- Verify all changed files and CI.

**Interfaces:**
- Produces: merged PR on `main` with verified commit SHA.

- [ ] **Step 1: Run/inspect complete verification**

Use the repository Music Intelligence verification workflow and confirm worker tests, syntax, infrastructure lint, TypeScript checks, and production build pass.

- [ ] **Step 2: Review the PR diff**

Confirm no messaging/app-data messaging files changed and no secrets are present.

- [ ] **Step 3: Merge**

Merge only after required checks pass; verify `main` points to the merge commit and contains the Gemini analyzer.

# AWS-only Music Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Modal Audio Tools runtime with an AWS `/jobs` API, SQS queue, ECS worker, DynamoDB profile/job persistence, and S3 generated outputs without changing EZ-WAY's upload/analyze user flow.

**Architecture:** API Gateway/Lambda validates and queues jobs. A long-running ECS Fargate Python worker consumes SQS, executes Music Intelligence or the existing lyrics/stems actions, persists terminal results in DynamoDB, and writes generated files to S3. The frontend continues using `VITE_AUDIO_TOOLS_URL` and can read canonical Song Profiles from the same AWS API.

**Tech Stack:** React 19, TypeScript 5.8, Node 22 Lambda, AWS SAM/CloudFormation, API Gateway HTTP API, SQS, DynamoDB, ECS Fargate, ECR, S3, Python 3.11, All-In-One-Infer, CLAP, librosa, Demucs, faster-whisper.

**Spec:** `docs/superpowers/specs/2026-08-27-aws-music-intelligence-design.md`

## Global Constraints

- No Modal production runtime or `.modal.run` URL.
- Preserve `POST /jobs` and `GET /jobs/{call_id}` browser behavior.
- New uploads still automatically run one `analysis` job.
- No GPT/OpenAI call for core acoustic facts.
- Low-confidence analysis stays uncertain rather than fabricated.
- No AWS secret keys in Vite/browser variables.
- Do not set the production Audio Tools hostname until the AWS endpoint is actually deployed and healthy.

---

### Task 1: AWS job contract and tests

**Files:**
- Create: `aws/audio-tools/api/jobContract.mjs`
- Create: `aws/audio-tools/api/jobContract.test.mjs`
- Modify: `.github/workflows/music-intelligence-verify.yml`

**Interfaces:**
- Produces `normalizeJobRequest(payload)`, `publicJobResponse(item)`, and `pollHttpStatus(status)`.

- [ ] **Step 1: Write the failing contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJobRequest, pollHttpStatus } from './jobContract.mjs';

test('AWS Audio Tools accepts the three existing actions', () => {
  for (const action of ['analysis', 'lyrics', 'stems']) {
    const job = normalizeJobRequest({ action, file_url: 'https://example.com/song.wav', track_id: 't1' });
    assert.equal(job.action, action);
  }
});

test('accepted and running jobs poll as 202', () => {
  assert.equal(pollHttpStatus('accepted'), 202);
  assert.equal(pollHttpStatus('running'), 202);
  assert.equal(pollHttpStatus('completed'), 200);
  assert.equal(pollHttpStatus('failed'), 200);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test aws/audio-tools/api/jobContract.test.mjs`
Expected: FAIL because `jobContract.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure contract helpers** with strict HTTPS `file_url` validation, supported action validation, normalized stem mode, and browser-safe result shaping.

- [ ] **Step 4: Run GREEN**

Run: `node --test aws/audio-tools/api/jobContract.test.mjs`
Expected: PASS.

---

### Task 2: Lambda queue API and AWS infrastructure

**Files:**
- Create: `aws/audio-tools/api/handler.mjs`
- Create: `aws/audio-tools/api/package.json`
- Create: `aws/audio-tools/template.yaml`
- Create: `aws/audio-tools/README.md`

**Interfaces:**
- Consumes `normalizeJobRequest`, `publicJobResponse`, `pollHttpStatus`.
- Produces HTTP routes `/health`, `/jobs`, `/jobs/{callId}`, and `/track-analysis/{trackId}`.
- Produces environment variables `JOBS_TABLE`, `TRACK_ANALYSIS_TABLE`, `QUEUE_URL`, `OUTPUT_BUCKET`, `ALLOWED_ORIGINS` for AWS runtime components.

- [ ] **Step 1: Implement POST `/jobs`** to create a UUID job record in DynamoDB and send exactly one SQS message.
- [ ] **Step 2: Implement GET `/jobs/{callId}`** to return 202 for non-terminal jobs and 200 for terminal jobs.
- [ ] **Step 3: Implement GET `/track-analysis/{trackId}`** as read-only browser access to the canonical profile.
- [ ] **Step 4: Define SAM resources** for two DynamoDB tables, SQS/DLQ, S3, Lambda/API Gateway, ECS cluster/service/task roles/task definition/log group, and VPC/subnet parameters.
- [ ] **Step 5: Verify syntax**

Run: `node --check aws/audio-tools/api/handler.mjs && node --check aws/audio-tools/api/jobContract.mjs`
Expected: exit 0.

---

### Task 3: Provider-neutral AWS worker

**Files:**
- Create: `aws/audio-tools/worker/music_intelligence_core.py`
- Create: `aws/audio-tools/worker/test_music_intelligence_core.py`
- Create: `aws/audio-tools/worker/analyzer.py`
- Create: `aws/audio-tools/worker/worker.py`
- Create: `aws/audio-tools/requirements.txt`
- Create: `aws/audio-tools/Dockerfile`

**Interfaces:**
- Consumes SQS messages produced by Task 2.
- Produces DynamoDB terminal job results, canonical analysis records, and S3 generated output files.

- [ ] **Step 1: Port the pure Music Intelligence core tests** from the legacy Modal location to the AWS worker path.
- [ ] **Step 2: Run RED before the core implementation exists**

Run: `python -m unittest discover -s aws/audio-tools/worker -p 'test_music_intelligence_core.py' -v`
Expected: FAIL on missing AWS worker core module.

- [ ] **Step 3: Port the provider-neutral normalization/profile helpers** unchanged in behavior.
- [ ] **Step 4: Port acoustic analysis**: All-In-One sections/BPM, CLAP label ranking, librosa key/Camelot, deterministic keywords.
- [ ] **Step 5: Port lyrics/stems to CPU** using Demucs and faster-whisper int8 so no runtime action points back to Modal.
- [ ] **Step 6: Implement SQS long-poll worker** that marks `running`, persists `completed`/`failed`, writes analysis profiles to the track-analysis table, and deletes a queue message only after terminal persistence.
- [ ] **Step 7: Run GREEN and syntax checks**

Run: `python -m unittest discover -s aws/audio-tools/worker -p 'test_music_intelligence_core.py' -v`
Run: `python -m py_compile aws/audio-tools/worker/*.py`
Expected: all pass.

---

### Task 4: Frontend AWS profile read path and Modal removal

**Files:**
- Modify: `src/services/musicIntelligence.ts`
- Modify: `AUDIO_TOOLS.md`
- Modify: `.github/workflows/music-intelligence-verify.yml`
- Delete: `modal/audio_tools_agent.py`
- Delete: `modal/audio_tools_agent_v2.py`
- Delete: `modal/audio_tools_agent_v3.py`
- Delete: `modal/audio_tools_agent_v4.py`
- Delete: `modal/audio_tools_agent_v5.py`
- Delete: `modal/audio_tools_api_fixed.py`
- Delete: `modal/music_intelligence_core.py`
- Delete: `modal/test_music_intelligence_core.py`

**Interfaces:**
- `getTrackAnalysisRecord(trackId)` may read the canonical profile from `${VITE_AUDIO_TOOLS_URL}/track-analysis/{trackId}` when no explicit `VITE_MUSIC_INTELLIGENCE_API_URL` is set.
- Browser writes remain local unless a separate authenticated profile-write API is explicitly configured.

- [ ] **Step 1: Add a pure frontend URL-resolution test** proving the explicit profile API wins and Audio Tools becomes the read fallback.
- [ ] **Step 2: Implement the read fallback without adding browser AWS credentials.**
- [ ] **Step 3: Replace Modal deployment documentation with AWS build/push/deploy instructions.**
- [ ] **Step 4: Remove all Modal source files and Modal CI references after AWS tests cover the equivalent behavior.**
- [ ] **Step 5: Run full verification**

Run: `node --experimental-strip-types --test src/services/musicIntelligenceCore.test.ts`
Run: `node --test aws/audio-tools/api/jobContract.test.mjs`
Run: `python -m unittest discover -s aws/audio-tools/worker -p 'test_music_intelligence_core.py' -v`
Run: `python -m py_compile aws/audio-tools/worker/*.py`
Run: `node --check aws/audio-tools/api/handler.mjs aws/music-intelligence/handler.mjs`
Run: `npm run lint`
Run: `npm run build`
Expected: all exit 0.

The branch must remain unmerged if the AWS endpoint itself has not been deployed; repository verification proves the migration code, not production availability.
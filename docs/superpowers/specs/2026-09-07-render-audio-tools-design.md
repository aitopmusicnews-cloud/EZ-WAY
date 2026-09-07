# Render Audio Tools Design

## Goal

Move EZ-WAY audio compute from ECS/Fargate to an existing Render service while keeping Amplify for the frontend and AWS for private media storage, job/result persistence, and downloadable outputs.

## Scope

This migration covers the three existing Audio Tools actions only:

- `analysis`: Gemini audio analysis
- `lyrics`: Demucs vocal isolation followed by faster-whisper transcription
- `stems`: Demucs two-stem or full separation

Messaging, video tools, app-data CRUD, and the existing AWS deployment remain out of scope.

## API compatibility

Render must expose the same browser contract already consumed by `src/services/audioTools.ts`:

- `GET /health`
- `POST /jobs`
- `GET /jobs/{call_id}`
- `GET /track-analysis/{track_id}`

`POST /jobs` returns HTTP 202 with an accepted job. Polling returns HTTP 202 while a job is accepted/running and HTTP 200 when it is completed or failed.

## Source audio

The frontend sends both `file_url` and `file_key`. Render must prefer `file_key` when present and download the source directly from the private App Data S3 bucket using AWS credentials configured only on Render. `file_url` remains a fallback for compatibility.

This removes the Render processing path's dependency on a browser-held 30-minute S3 presigned URL and prevents the repeated 403 failures seen on Analyze, Lyrics, and Stems.

## Compute

A dedicated FastAPI service lives under `render_audio_tools/` and runs inside the existing Render web service after its build/start commands are changed.

- Gemini analysis reuses the production Gemini schema and profile normalization from `aws/audio-tools/worker/analyzer.py`.
- `MusicIntelligenceEngine` gains an `analyze_file(Path)` entry point so both AWS and Render use the same Gemini implementation.
- Demucs and faster-whisper run locally inside the Render service.
- A single-process executor defaults to one concurrent audio job to avoid oversubscribing CPU/RAM.

## State and outputs

Render uses the existing AWS resources rather than creating a second data plane:

- `JOBS_TABLE`: job status and poll results
- `TRACK_ANALYSIS_TABLE`: canonical completed analysis records
- `SOURCE_BUCKET`: private uploaded source audio
- `OUTPUT_BUCKET`: generated stems, lyric files, and ZIP bundles

Generated files are uploaded to S3 and returned as presigned download URLs. No generated audio is stored only on Render's ephemeral filesystem.

## Runtime configuration

Required production environment variables:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (default `gemini-3.8-flash`)
- `AWS_REGION` (default `us-west-2`)
- `SOURCE_BUCKET`
- `OUTPUT_BUCKET`
- `JOBS_TABLE`
- `TRACK_ANALYSIS_TABLE`
- AWS credentials with least-privilege access to the two buckets and two DynamoDB tables

Optional:

- `ALLOWED_ORIGINS` (default `https://ezwaypro.theartistcut.com`)
- `RENDER_AUDIO_WORKERS` (default `1`)
- `PRESIGNED_SECONDS` (default `86400`)

No AWS or Gemini secret is committed to the repository or exposed to the browser.

## Render service configuration

Repurpose one existing deployed Music Intelligence preview service. The service remains connected to the EZ-WAY repository but uses:

- Build: `python3 -m pip install -r render_audio_tools/requirements.txt`
- Start: `python3 -m uvicorn render_audio_tools.app:app --host 0.0.0.0 --port $PORT`

A paid Render instance with sufficient memory is required for Demucs and faster-whisper; the existing free preview tier is suitable only for contract/health validation.

## Frontend cutover

The frontend keeps the existing Audio Tools client and only adds `file_key` to the job body. After Render is verified with a real job, Amplify can switch `VITE_AUDIO_TOOLS_URL` from the AWS API Gateway URL to the verified Render service URL and rebuild.

The AWS Audio Tools stack is not deleted as part of this change; it remains a rollback target until the Render path is verified in production.

## Testing

Tests must prove:

1. Browser job requests include `file_key` when available.
2. Render normalizes valid/invalid job requests consistently with the AWS contract.
3. Render returns 202 for queued/running jobs and 200 for terminal jobs.
4. Source resolution prefers S3 `file_key` over a stale `file_url`.
5. Gemini can analyze a local file without changing the existing URL-based AWS path.
6. Existing AWS worker tests, frontend tests, TypeScript checks, and production build still pass.

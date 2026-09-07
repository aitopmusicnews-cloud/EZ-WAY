# EZ-WAY Render Audio Tools

This service runs EZ-WAY audio compute on Render while keeping private media, job state, analysis records, and generated downloads in AWS.

## What runs here

- **Gemini**: complete-audio music analysis using the same schema/profile normalizer as the AWS worker
- **Demucs**: vocals/instrumental or full stem separation
- **faster-whisper**: lyric transcription from the isolated vocal stem

The browser contract remains compatible with the current EZ-WAY Audio Tools client:

- `GET /health`
- `POST /jobs`
- `GET /jobs/{call_id}`
- `GET /track-analysis/{track_id}`

## Why `file_key` matters

The App Data API gives the browser temporary S3 read URLs. Those URLs expire. Render therefore prefers the permanent private S3 object key (`file_key`) and downloads the source directly from `SOURCE_BUCKET`. `file_url` is only a compatibility fallback.

That means a track can sit in the library for hours or days and still be analyzed or separated without reusing an expired browser presigned URL.

## Existing Render service

Repurpose one of the existing EZ-WAY Music Intelligence preview web services after this branch has been verified. Do not point Amplify at the Render URL until a real audio job has completed successfully.

### Build command

```bash
python3 -m pip install -r render_audio_tools/requirements.txt
```

### Start command

```bash
python3 -m uvicorn render_audio_tools.app:app --host 0.0.0.0 --port $PORT
```

A paid Render instance with enough RAM/CPU is required for real Demucs and faster-whisper processing. The current free preview plan is useful for `/health` and API-contract checks, but it is not an appropriate production size for model-heavy audio jobs.

## Required environment variables

Set these in Render as secret/runtime environment variables. Do not put secret values in source control.

```text
GEMINI_API_KEY=<secret>
GEMINI_MODEL=gemini-3.8-flash
AWS_REGION=us-west-2
SOURCE_BUCKET=<EZ-WAY App Data media bucket>
OUTPUT_BUCKET=<EZ-WAY Audio Tools output bucket>
JOBS_TABLE=<EZ-WAY Audio Tools jobs table>
TRACK_ANALYSIS_TABLE=<EZ-WAY track analysis table>
AWS_ACCESS_KEY_ID=<least-privilege Render IAM credential>
AWS_SECRET_ACCESS_KEY=<least-privilege Render IAM credential>
MODEL_ROOT=/tmp/ezway-models
ALLOWED_ORIGINS=https://ezwaypro.theartistcut.com
RENDER_AUDIO_WORKERS=1
PRESIGNED_SECONDS=86400
```

If temporary AWS credentials are used, also set `AWS_SESSION_TOKEN`. Production should use a dedicated least-privilege IAM principal rather than an administrator credential.

The Render AWS principal needs only the operations required by this service:

- `s3:GetObject` on `SOURCE_BUCKET/tracks/audio/*`
- `s3:PutObject` and `s3:GetObject` on `OUTPUT_BUCKET/audio-tools/*`
- `dynamodb:GetItem` and `dynamodb:PutItem` on `JOBS_TABLE`
- `dynamodb:GetItem` and `dynamodb:PutItem` on `TRACK_ANALYSIS_TABLE`

## Health check

```bash
curl -fsS https://<render-service>.onrender.com/health
```

Expected shape:

```json
{
  "status": "ok",
  "provider": "render",
  "tools": ["analysis", "lyrics", "stems"],
  "source_mode": "s3-file-key-first"
}
```

## Real analysis smoke test

Use a real track that already exists in the private App Data S3 bucket. The request should include its `file_key`; the URL is optional for the Render service and may be included for backward compatibility.

```bash
API_BASE="https://<render-service>.onrender.com"

curl -fsS -X POST "$API_BASE/jobs" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "analysis",
    "file_key": "tracks/audio/<track-id>/<file>.mp3",
    "track_id": "<track-id>",
    "track_name": "Render Smoke Test"
  }'
```

Poll the returned `call_id` at `GET /jobs/{call_id}`. HTTP 202 means the job is still accepted/running. HTTP 200 with `status: completed` and `profile.evidence.provider: gemini` is the cutover gate.

## Amplify cutover

Only after a real Render job passes, change the existing Amplify build variable:

```text
VITE_AUDIO_TOOLS_URL=https://<verified-render-service>.onrender.com
```

Then rebuild the `main` branch. Keep the AWS Audio Tools stack intact as a rollback target until Render has been exercised successfully for analysis, lyrics, and stems.

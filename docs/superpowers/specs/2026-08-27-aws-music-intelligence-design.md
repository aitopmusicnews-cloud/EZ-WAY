# AWS-only Music Intelligence Design

## Goal

Remove Modal from the EZ-WAY production Audio Tools path and run the shared Music Intelligence analyzer on AWS while preserving the browser contract already used by upload and Analyze/Re-Analyze.

## Production flow

`EZ-WAY upload -> POST /jobs -> SQS -> ECS worker -> DynamoDB/S3 -> GET /jobs/{id}`

The browser keeps calling a single `VITE_AUDIO_TOOLS_URL`. The AWS API accepts `analysis`, `lyrics`, and `stems` jobs so no feature has to point at Modal. Music Intelligence results are also persisted as canonical track-analysis records in DynamoDB.

## AWS resources

- API Gateway HTTP API + Lambda job API
- DynamoDB jobs table
- DynamoDB track-analysis table
- SQS work queue + DLQ
- ECS Fargate cluster/service for the Python worker
- S3 bucket for generated lyric/stem outputs
- ECR image supplied to the task definition
- CloudWatch Logs for Lambda and worker

## Worker behavior

The worker long-polls SQS, marks the job `running`, downloads the cloud-accessible track source, performs the requested action, writes the final job result to DynamoDB, and deletes the SQS message only after a terminal result is persisted.

### analysis

- All-In-One-Infer `harmonix-all`: BPM + functional sections
- LAION `larger_clap_music`: ranked genre, mood, style, instruments
- librosa chroma: key + Camelot
- deterministic keywords and confidence/warning handling
- writes the canonical Song Profile to the track-analysis table

### lyrics

- Demucs vocal separation on CPU in the first AWS phase
- faster-whisper transcription using CPU/int8
- uploads `.lrc`, plain text, and vocal stem outputs to S3

### stems

- Demucs CPU separation
- supports vocals/instrumental and full four-stem modes
- uploads requested stems and ZIP bundle to S3

CPU is the first supported worker mode. The task definition is intentionally replaceable by a later GPU-backed ECS/EC2 or AWS Batch worker without changing the browser API.

## Browser contract

`POST /jobs` returns HTTP 202 with `call_id`.

`GET /jobs/{call_id}` returns:
- HTTP 202 while `accepted` or `running`
- HTTP 200 with `status: completed` and result payload when done
- HTTP 200 with `status: failed` and error payload when failed

`GET /track-analysis/{trackId}` returns the server-side canonical Song Profile when available.

The frontend remains responsible for its browser-local cache. It may read the AWS canonical profile through the Audio Tools API, but it does not require public browser write access to DynamoDB.

## Security and CORS

The API allows only configured production origins through CORS. CORS is not authentication, so this first single-user phase should also be protected at the AWS edge with API Gateway throttling/WAF before broad public use. No AWS credentials or worker secrets are placed in Vite variables.

## Production domain

The intended stable endpoint is `https://audio-tools-api.theartistcut.com`. The repository must not set that production variable until DNS/TLS and the AWS stack are actually deployed and healthy.

## Modal removal

No production code, environment variable, documentation, or CI verification may require Modal. Legacy Modal source files are removed after equivalent AWS worker coverage exists.
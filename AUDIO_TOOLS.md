# EZ-WAY Audio Tools — AWS Runtime

EZ-WAY Audio Tools runs on AWS. There is no production Modal dependency.

## Music Intelligence

Every newly uploaded track is analyzed once and the saved Song Profile is reused across EZ-WAY.

The analyzer uses:

- **All-In-One-Infer (`harmonix-all`)** for BPM and functional structure.
- **LAION `larger_clap_music`** for genre, style, mood, instrument, and production classification.
- **librosa chroma/key analysis** for musical key and Camelot key.
- Deterministic keywords derived from detected traits.

No GPT/OpenAI call is required for core acoustic facts.

## Synced Lyrics

- Demucs isolates the vocal.
- faster-whisper `large-v3` transcribes the vocal with timestamps.
- EZ-WAY saves timestamped lyrics back to the selected track.
- Generated `.lrc`, plain text, and vocal-stem files are stored in private S3 and returned through presigned URLs.
- If a reliable transcript cannot be produced, the job fails instead of inventing lyrics.

## Stem Separation

- **Vocals + Instrumental** returns vocal and no-vocals stems.
- **Full Separation** returns vocals, drums, bass, and other.
- A ZIP bundle is also written to S3.

## AWS architecture

```text
EZ-WAY
  -> API Gateway / Lambda POST /jobs
  -> SQS
  -> ECS Fargate Audio Tools worker
  -> DynamoDB jobs + track-analysis
  -> S3 generated outputs
  <- API Gateway / Lambda GET /jobs/{call_id}
```

The worker is CPU-backed in the first AWS release. Its ECS task definition can later be replaced with a GPU-backed worker without changing the browser API.

Implementation and deployment files live under:

```text
aws/audio-tools/
```

See `aws/audio-tools/README.md` for the guided CloudShell deployment and smoke test.

## Web application environment

After the AWS endpoint has been deployed and a real analysis job has completed successfully, set:

```env
VITE_AUDIO_TOOLS_URL=https://YOUR-VERIFIED-AWS-AUDIO-TOOLS-ENDPOINT
```

Do not append `/jobs`; the app automatically calls:

- `POST /jobs`
- `GET /jobs/{call_id}`
- `GET /track-analysis/{track_id}`

The intended stable custom hostname is:

```text
https://audio-tools-api.theartistcut.com
```

Do not hard-code that hostname until DNS, TLS, API mapping, `/health`, and a real analysis job are verified.

`VITE_MUSIC_INTELLIGENCE_API_URL` remains optional. When explicitly configured it is treated as a separate authenticated profile-write API. Without it, browser writes stay local while the AWS worker writes successful canonical Song Profiles server-side.

## Automatic upload behavior

1. Read track duration locally.
2. Upload the real audio master to cloud storage.
3. Create the EZ-WAY track in `processing` state.
4. Submit one AWS `analysis` job using the cloud audio URL and source fingerprint.
5. Poll the AWS job until terminal.
6. Reuse the returned Song Profile, copy BPM/key/tags to the track, and mark it `ready`.
7. The AWS worker also persists the canonical Song Profile in DynamoDB.

Bulk uploads stay sequential to avoid flooding the worker. If analysis fails, the uploaded track stays in the library with `error` status and no fabricated metadata.

## Source file requirement

Audio Tools requires an HTTPS cloud-accessible `track.file_url`. Browser-only `blob:` URLs cannot be processed by the AWS worker.

## Security

- No AWS secret keys belong in browser code or Vite variables.
- Worker IAM permissions are scoped to its SQS queue, DynamoDB tables, and S3 output bucket.
- S3 public access is blocked.
- CORS is restricted to the EZ-WAY production and Amplify origins.
- Before broad multi-user exposure, protect the public job API with user authorization plus API Gateway throttling/WAF.

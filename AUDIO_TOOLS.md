# EZ-WAY Audio Tools — AWS Runtime

EZ-WAY Audio Tools runs on AWS. There is no production Modal dependency.

## Music Intelligence

Every newly uploaded track is analyzed once and the saved Song Profile is reused across EZ-WAY.

The analyzer uses **Gemini** for structured music/audio analysis. The worker uploads the downloaded master audio to the Gemini Files API, requests schema-constrained metadata, then converts that response into EZ-WAY's existing canonical Song Profile.

The profile includes BPM, BPM confidence, musical key, Camelot key, key confidence, ranked genre/style/mood/instrument traits, functional song sections, chapters, and deterministic profile warnings. The default model is `gemini-3.8-flash` and can be overridden with `GEMINI_MODEL` in the worker environment.

Gemini is not used for lyric transcription. The analysis prompt explicitly excludes lyric reconstruction so lyrics remain the responsibility of Whisper.

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
       -> Gemini (analysis)
       -> Demucs (stems / vocal isolation)
       -> faster-whisper (lyrics)
  -> DynamoDB jobs + track-analysis
  -> S3 generated outputs
  <- API Gateway / Lambda GET /jobs/{call_id}
```

The worker is CPU-backed for Demucs and Whisper. Gemini analysis runs through the remote Gemini API without changing the browser API.

Implementation and deployment files live under:

```text
aws/audio-tools/
```

See `aws/audio-tools/README.md` for the guided CloudShell deployment and smoke test.

## Gemini API key

The Gemini API key lives in AWS Secrets Manager. The default secret name is:

```text
ezway/audio-tools/gemini-api-key
```

If that secret already exists, deployment reuses it automatically and you do not need to export the key into CloudShell:

```bash
./aws/audio-tools/deploy.sh
```

If the existing secret uses another name, set `GEMINI_SECRET_NAME` for the deployment. Supplying `GEMINI_API_KEY` is only needed when creating or rotating the secret through the deployment script.

The deployment passes only the secret ARN to CloudFormation. ECS injects the secret into the worker as `GEMINI_API_KEY`; the key is never committed to the repository or exposed to browser code.

To change the analysis model, set `GEMINI_MODEL` on the ECS worker task definition; the repository default is `gemini-3.8-flash`.

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

- No AWS or Gemini secret keys belong in browser code or Vite variables.
- Gemini credentials are stored in AWS Secrets Manager and injected into ECS through the task definition `Secrets` field.
- Worker IAM permissions are scoped to its SQS queue, DynamoDB tables, S3 output bucket, and the specific Gemini API-key secret.
- S3 public access is blocked.
- CORS is restricted to the EZ-WAY production and Amplify origins.
- Before broad multi-user exposure, protect the public job API with user authorization plus API Gateway throttling/WAF.

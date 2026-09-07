# Gemini Audio Pipeline Design

## Goal

Replace the existing music-analysis stack with Gemini while preserving the EZ-WAY Audio Tools browser/API contract. Demucs remains the source-separation engine and faster-whisper remains the lyric transcription engine.

## Scope

This change is limited to `aws/audio-tools` plus its documentation and verification tests. It must not modify messaging, app-data messaging routes, client messaging UI, or unrelated frontend behavior.

## Pipeline

### Analysis

1. Download the track from the existing HTTPS `file_url` into the worker temp directory.
2. Upload the local audio file to the Gemini Files API.
3. Ask Gemini for a strict structured music-analysis response containing BPM, BPM confidence, key, Camelot key, key confidence, ranked genres, moods, styles, instruments, section timestamps, and keywords.
4. Convert the structured response into the existing canonical Song Profile shape through `music_intelligence_core.build_profile`.
5. Record Gemini provider/model evidence and persist the profile exactly through the existing DynamoDB path.
6. Delete the temporary Gemini file after the request completes, including on error when a file name was returned.

The browser-facing `analysis` job response stays `{ profile }`, so existing upload/analyze consumers do not need an interface change.

### Lyrics

Keep the existing flow: Demucs isolates vocals, then faster-whisper `large-v3` transcribes the vocal stem with timestamps. Gemini must not be used to invent or replace lyric text.

### Stems

Keep the existing Demucs flow and output contract for vocals/instrumental and full four-stem separation.

## Gemini Configuration

The worker uses the official `google-genai` Python SDK and the Gemini Developer API. The default model is `gemini-3.8-flash`, overridable with `GEMINI_MODEL`.

`GEMINI_API_KEY` must not be committed or stored as a plain repository value. Deployment creates/updates an AWS Secrets Manager secret from the operator-provided `GEMINI_API_KEY`; ECS injects the secret into the worker container through the task definition `Secrets` field. The ECS execution role receives `secretsmanager:GetSecretValue` only for that secret ARN.

## Error Handling

- Missing `GEMINI_API_KEY` fails the analysis action explicitly.
- Missing/invalid structured Gemini output fails the job rather than fabricating metadata.
- Gemini-uploaded files are deleted in a `finally` cleanup path whenever possible.
- Lyrics continue to fail when no reliable Whisper transcript is produced.
- Demucs errors continue to surface as failed jobs with captured stderr/stdout context.

## Dependencies

Remove the analysis-only dependencies `all-in-one-infer`, `transformers`, `librosa`, and `huggingface-hub` from the audio worker image. Add `google-genai`. Keep `demucs-infer`, `faster-whisper`, `httpx`, `boto3`, and `soundfile` as needed by the remaining runtime.

## Compatibility

The canonical Song Profile fields remain unchanged: `version`, `analyzed_at`, `bpm`, confidences, key/Camelot fields, primary genre, ranked tags, sections, chapters, keywords, evidence, and warnings. `ANALYZER_VERSION` advances to `music-intelligence-gemini-v2` so cached profiles can be distinguished from the old analyzer.

## Verification

Tests must prove:

- Gemini payloads normalize into the existing Song Profile shape.
- The analyzer declares Gemini as provider/model evidence.
- Old analysis dependencies and imports are gone.
- Demucs and faster-whisper remain present.
- ECS receives Gemini credentials only through Secrets Manager wiring.
- Deployment requires `GEMINI_API_KEY` and creates/updates the secret before SAM deployment.
- Existing Python worker tests, syntax checks, CloudFormation lint, Node/TypeScript checks, and production build still pass in CI.

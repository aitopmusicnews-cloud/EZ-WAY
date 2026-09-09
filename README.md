# EZ-WAY / The Artist Cut

EZ-WAY is the music workspace behind **The Artist Cut**. The production web app combines catalog management, Music Intelligence, synced lyrics, stem separation, copyright workflows, marketing tools, sharing, YouTube workflows, and client-facing utilities in one React application.

Production: `https://ezwaypro.theartistcut.com`

## Current architecture

```text
Browser / React
  ├─ Music Intelligence -> browser-local analysis
  ├─ Synced Lyrics      -> Whisper Tiny in a Web Worker
  ├─ Stem Separation    -> Spleeter 4-stem ONNX in a Web Worker
  └─ UI / playback / editing
          |
          v
AWS app-data API
  ├─ Cognito authentication
  ├─ private S3 source media
  ├─ private generated audio/text/ZIP outputs
  └─ persistent application data
```

The production audio-analysis path is intentionally **browser-local**. Analyze, Synced Lyrics, and Stem Separation do not require Modal, Gemini, Render inference, ECS workers, or Lambda inference.

Legacy `render_audio_tools/` and `aws/audio-tools/` code remains in the repository as dormant rollback/diagnostic infrastructure. Production Lyrics/Stems UI must not submit remote `/jobs` requests.

## Browser-local audio tools

### Music Intelligence

`src/services/musicIntelligence.ts` and `src/services/localMusicIntelligence.ts` provide the shared browser-local song profile used by EZ-WAY features. The saved profile includes the metadata that downstream workflows consume, such as BPM, key/Camelot information, genre-related metadata, chapters/sections when available, keywords, evidence, and warnings.

A separate Music Intelligence profile API may be configured explicitly, but browser analysis does not depend on the legacy Audio Tools URL.

### Synced Lyrics

Synced Lyrics runs locally in a dedicated Web Worker:

- Runtime: `@huggingface/transformers@4.2.0`
- Model: `onnx-community/whisper-tiny`
- Input: 16 kHz mono PCM decoded in the browser
- Preferred execution: WebGPU
- Fallback: Transformers.js/ONNX WASM
- Output: timestamped LRC-style lyrics plus `.lrc` and plain-text downloads

If no reliable transcript is produced, EZ-WAY leaves existing lyrics unchanged rather than inventing text.

### Stem Separation

Stem Separation also runs locally in a dedicated Web Worker:

- Runtime: `onnxruntime-web@1.29.0`
- Model: `Best-Practice/spleeter-4stems-onnx` fp16 weights
- Input: 44.1 kHz stereo PCM
- Output stems: vocals, drums, bass, other
- `Vocals + Instrumental` is derived from vocals plus the summed non-vocal stems
- Downloads: individual WAV files plus a ZIP bundle

The worker uses Spleeter's 4096-point periodic-Hann STFT, 1024-sample hop, 1024 modeled bins, four-way soft-ratio masks, average high-band extension, and overlap-add reconstruction.

See `AUDIO_TOOLS.md` for the detailed production contract and model provenance.

## AWS responsibilities

AWS remains the persistence and authentication layer, not the audio-inference layer.

The app-data upload API supports the existing source-media categories plus private browser-generated Audio Tools output categories:

- `audio-tools-audio` -> generated WAV/audio files
- `audio-tools-text` -> LRC/plain lyric files
- `audio-tools-bundle` -> stem ZIP bundles

Uploads continue through authenticated presigned URLs. Browser code never receives AWS access keys.

## Source handling

Browser audio tools use the most resilient available source:

1. Prefer `track.file_data` while the local upload is still available.
2. Otherwise use the current `track.file_url`.
3. If a stable `file_key` exists, refresh the signed source through the AWS app-data bootstrap flow before processing.
4. Fail clearly when neither a valid local file nor fetchable cloud source is available.

A valid local `file_data` source is sufficient for Lyrics/Stems; a cloud URL is not required.

## Environment variables

The frontend may use these Vite variables depending on deployment:

```env
VITE_EZWAY_API_URL=...
VITE_MUSIC_INTELLIGENCE_API_URL=...
```

`VITE_AUDIO_TOOLS_URL` is legacy compatibility/rollback configuration. It is not required by the production browser-local Analyze/Lyrics/Stems path.

Never place AWS access keys, Gemini keys, or other provider secrets in Vite/browser environment variables.

## Development

Requirements:

- Node.js 22 recommended (`package.json` supports Node 18+)
- npm
- Python only for the retained backend regression suites

Install and run:

```bash
npm ci
npm run dev
```

Type-check and build:

```bash
npm run lint
npm run build
```

The main verification workflow also runs browser Audio Tools contracts, AWS app-data contracts, legacy AWS/Render regression tests, Python syntax checks, CloudFormation lint, TypeScript, and the production build.

## Important source directories

```text
src/
  components/              React UI
  context/                 application state
  services/                Music Intelligence, browser Audio Tools, persistence helpers
  workers/                 Whisper and Spleeter browser workers

aws/app-data/              active AWS application-data/storage backend
aws/audio-tools/           legacy remote Audio Tools rollback infrastructure
render_audio_tools/        legacy Render Audio Tools rollback infrastructure
docs/superpowers/          approved designs and implementation plans
```

## Audio model licensing and provenance

EZ-WAY does **not** bundle the browser HTDemucs weights whose upstream browser port restricts those weights to personal/research use.

The browser stem path uses the Spleeter 4-stem ONNX conversion from Best-Practice. Its repository/model card documents Apache-2.0 conversion artifacts and the provenance/licensing discussion for Deezer Spleeter weights. Read `THIRD_PARTY_NOTICES.md` and the upstream notices before redistributing or changing the model source.

Whisper/Transformers.js and the stem runtime are loaded lazily only when a user invokes the relevant tool; large models are not downloaded at application startup.

## Deployment

The frontend is deployed through AWS Amplify from `main`, with the production custom origin:

```text
https://ezwaypro.theartistcut.com
```

A merged change is not considered production-verified until the Amplify build/deploy/verify stages succeed and the production app is checked against the intended user workflow.

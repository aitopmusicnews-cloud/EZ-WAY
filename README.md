# EZ-WAY / The Artist Cut

EZ-WAY is the music workspace behind **The Artist Cut**. The production web app combines catalog management, Music Intelligence, synced lyrics, stem separation, copyright workflows, album-cover generation, video/YouTube workflows, sharing, messaging, and client-facing utilities in one React application.

Production: `https://ezwaypro.theartistcut.com`

## Current architecture

```text
Browser / React
  ├─ Music Intelligence -> browser-local analysis
  ├─ Synced Lyrics      -> HTDemucs vocals -> Whisper Tiny Web Worker
  ├─ Stem Separation    -> HTDemucs 4-stem ONNX Web Worker (WASM)
  ├─ YouTube Hub        -> Google Identity Services + YouTube Data API
  ├─ Album Cover Studio -> separate EZ-WAY FastAPI backend
  └─ UI / playback / editing / sharing
          |
          v
AWS app-data API
  ├─ Cognito owner authentication
  ├─ Aurora PostgreSQL application data
  ├─ private S3 source media
  ├─ private generated audio/text/ZIP outputs
  └─ token-scoped public share routes
```

The production Analyze, Synced Lyrics, and Stem Separation paths are intentionally **browser-local**. They do not require Modal, Gemini, Render inference, ECS workers, or Lambda inference.

Legacy `render_audio_tools/`, `aws/audio-tools/`, and `src/services/audioTools.ts` remain in the repository as rollback/diagnostic infrastructure. Production Lyrics/Stems UI uses `runLocalAudioTool(...)` and must not submit remote `/jobs` requests.

`server.ts` is still built and can be used for local/legacy Express workflows, but the AWS Amplify production site is a Vite/React web deployment. Same-origin Express-only routes in `server.ts` should not be assumed to exist in Amplify production unless they are also implemented by an active production backend.

## Application features

The current React application exposes these primary areas and tools:

- Dashboard, Tracks, Playlists, Clients, Messages, Sharing, Activity, Settings, and Profile.
- AI Diagnostics / Music Intelligence with browser-local analysis and persisted track metadata.
- Synced Lyrics using local HTDemucs vocal isolation plus local Whisper transcription.
- Stem Separation with `Vocals + Instrumental` and full four-stem output.
- Copyrights Studio.
- EZ AI Album Cover Studio with a separate FastAPI backend.
- Music Video Maker and video archive workflows.
- YouTube Hub with browser OAuth, channel state, upload listing, comments, and resumable video upload.
- Public share and client-portal workflows backed by token-scoped AWS routes.

The browser YouTube client currently supports connect/disconnect, channel information, recent uploads, recent comments, and video upload. Some older server-side YouTube helper routes remain in `server.ts`; do not assume those legacy Express endpoints are available on the Amplify-hosted frontend.

## Browser-local audio tools

### Music Intelligence

`src/services/musicIntelligence.ts` and `src/services/localMusicIntelligence.ts` provide the shared browser-local song profile used by EZ-WAY features. The saved profile includes the metadata downstream workflows consume, such as BPM, key/Camelot information, genre-related metadata, chapters/sections when available, keywords, evidence, and warnings.

Browser-local analysis is the default source of truth. A separate Music Intelligence profile API may be configured explicitly with `VITE_MUSIC_INTELLIGENCE_API_URL`, but browser analysis does not depend on the legacy Audio Tools URL.

### Synced Lyrics

Synced Lyrics is now a two-stage local pipeline:

1. Decode/resample the source to 44.1 kHz stereo.
2. Run the same HTDemucs four-stem model used by Stem Separation.
3. Select the isolated `vocals` stem.
4. Downmix/resample vocals to 16 kHz mono.
5. Transcribe with Whisper Tiny in bounded chunks.
6. Merge timestamps into LRC-style synced lyrics.

Current transcription details:

- Runtime: `@huggingface/transformers@4.2.0`
- Model: `onnx-community/whisper-tiny`
- Input to Whisper: isolated-vocal 16 kHz mono PCM
- Chunk size: 30 seconds
- Chunk overlap: 5 seconds
- Preferred Whisper execution: WebGPU only when a real adapter is available
- Whisper fallback: ONNX/WASM with explicit FP32 encoder and merged decoder
- Output: timestamped LRC-style lyrics plus `.lrc` and plain-text downloads

If no reliable transcript is produced, EZ-WAY leaves existing lyrics unchanged rather than inventing text.

### Stem Separation

Stem Separation also runs locally in a dedicated Web Worker:

- Runtime: `onnxruntime-web@1.29.0`
- Model repository: `StemSplitio/htdemucs-onnx`
- Model artifact: `htdemucs_fp16weights.onnx`
- Execution provider: WASM
- Input: 44.1 kHz stereo PCM
- Segment size: approximately 7.8 seconds with overlap/add reconstruction
- Output stems: drums, bass, other, vocals
- `Vocals + Instrumental`: vocals plus an instrumental derived by summing drums + bass + other
- `Full`: vocals, drums, bass, other
- Downloads: individual stereo WAV files plus a ZIP bundle

HTDemucs is intentionally run through the WASM execution provider. The current model graph contains inverse-STFT operations that are not reliably supported by the WebGPU execution provider used by ONNX Runtime Web.

The HTDemucs model is fetched lazily from Hugging Face when Synced Lyrics or Stem Separation is first invoked; the approximately 166 MB model binary is not committed to this repository.

See `THIRD_PARTY_NOTICES.md` for the current model/runtime provenance and licensing notes.

## AWS responsibilities

AWS remains the persistence and authentication layer, not the production browser audio-inference layer.

The active app-data stack provides:

- Amazon Cognito owner/admin authentication.
- Aurora PostgreSQL Serverless v2 through the RDS Data API.
- API Gateway + Lambda application-data routes.
- Private S3 media storage with presigned upload/read URLs.
- Token-scoped public-share routes that do not expose general database access.

The app-data upload API supports the existing source-media categories plus private browser-generated Audio Tools output categories:

- `audio-tools-audio` -> generated WAV/audio files
- `audio-tools-text` -> LRC/plain lyric files
- `audio-tools-bundle` -> stem ZIP bundles

Uploads continue through authenticated presigned URLs. Browser code never receives AWS access keys.

The repository still contains AWS Audio Tools and Music Intelligence backend code for rollback/diagnostic purposes. That retained code is not the current production execution path for browser Analyze/Lyrics/Stems.

## Authentication and data persistence

The production owner flow is gated by Cognito through `src/context/AuthContext.tsx`, `src/components/AuthGate.tsx`, and `src/services/auth.ts`.

Current browser auth behavior includes:

- email/password sign-in;
- `NEW_PASSWORD_REQUIRED` completion;
- token persistence in browser storage;
- refresh-token session restoration;
- sign-out.

Do not document self-service sign-up or forgot-password flows as available unless those flows are added to `src/services/auth.ts` and the UI; they are not implemented in the current auth service.

Application CRUD, media signing, public-share resolution, public-share events, and profile persistence are handled by `src/services/dataStore.ts` against `VITE_EZWAY_API_URL`.

A file named `src/lib/supabase.ts` remains as a compatibility facade for existing Settings diagnostics. It does not create a Supabase client or use Supabase credentials for the active application data path. `@supabase/supabase-js` is still declared in `package.json`, but current production data access is AWS-native.

## Source handling

Browser audio tools use the most resilient available source:

1. Prefer `track.file_data` while the local upload is still available.
2. Otherwise use the current `track.file_url`.
3. If a stable `file_key` exists, refresh the signed source through the AWS app-data bootstrap flow before processing.
4. Fail clearly when neither a valid local file nor fetchable cloud source is available.

A valid local `file_data` source is sufficient for Lyrics/Stems; a cloud URL is not required.

Generated local results remain usable even if optional AWS output persistence fails. In that case the browser object URLs are kept and the UI receives a warning instead of discarding the completed files.

## Album Cover Studio

The React UI lives in `src/components/AlbumCoverStudio.tsx`; browser API integration lives in `src/services/albumCoverStudio.ts`; the server-side implementation lives under `album_cover_backend/`.

Frontend configuration:

```env
VITE_ALBUM_COVER_API_URL=...
```

The backend is a Python/FastAPI subproject with its own requirements and environment. Current backend configuration includes Cloudflare Workers AI credentials/settings, storage/database settings, render/concept controls, CORS settings, and compatibility Gemini settings. See `album_cover_backend/.env.example` and `album_cover_backend/README.md` before deploying it.

**Provider-doc caveat:** current `album_cover_backend/app/config.py` marks the Gemini settings as legacy compatibility and enables the Cloudflare creative-director path by default. If another document describes Gemini as the active creative director, verify the current backend code/config before changing production provider settings.

## YouTube integration

The production browser integration is implemented in `src/services/youtubeBrowser.ts` using Google Identity Services and the YouTube Data API.

Frontend configuration:

```env
VITE_GOOGLE_CLIENT_ID=...
```

The Google OAuth client ID is a public browser identifier. Never place a Google client secret in Vite/browser variables.

The current browser scopes include YouTube read, upload, and `youtube.force-ssl`. Authorization alone does not mean every possible write operation is implemented in the UI; document only the operations present in the browser client and current components.

## Environment variables

Vite only exposes explicitly approved public variable prefixes from `vite.config.ts`. Current frontend variables used by active or retained browser code include:

```env
# Active AWS application data/auth
VITE_EZWAY_API_URL=...
VITE_COGNITO_USER_POOL_ID=...
VITE_COGNITO_USER_POOL_CLIENT_ID=...

# Active browser integrations
VITE_GOOGLE_CLIENT_ID=...
VITE_ALBUM_COVER_API_URL=...

# Optional explicit profile API
VITE_MUSIC_INTELLIGENCE_API_URL=...

# Legacy rollback configuration; not required by local Analyze/Lyrics/Stems
VITE_AUDIO_TOOLS_URL=...
```

`.env.production` in the repository currently contains only the Album Cover API URL. Production values for other frontend variables may be supplied by the hosting environment instead, so verify AWS Amplify configuration before assuming a missing repository value is unused.

Never place AWS access keys, database credentials, Cognito client secrets, Google client secrets, Gemini keys, Cloudflare API tokens, or other provider secrets in Vite/browser environment variables.

`server.ts` still reads additional server-side variables for legacy/local Express features, including Gemini, Google/Spotify OAuth, and GhostCut/watermark integrations. Those variables are relevant only when running the Express server path; they are not proof that the corresponding routes are active on the Amplify production frontend.

## Development

Requirements:

- Node.js 18+ (`package.json` engine); Node.js 22 is used by the main GitHub Actions workflow and is recommended for parity.
- npm.
- Python 3.12 for the Album Cover backend and retained Python backend regression suites.

Install and run the development server:

```bash
npm ci
npm run dev
```

`npm run dev` first runs `scripts/copy-transformers-wasm.mjs`, then starts `server.ts` through `tsx`. The server mounts Vite in development mode.

Available npm scripts:

```bash
npm run dev      # copy Transformers.js WASM assets, then run server.ts via tsx
npm run lint     # TypeScript check: tsc --noEmit
npm run build    # copy WASM assets, Vite production build, then bundle server.ts
npm start        # run dist/server.cjs
npm run clean    # remove dist/
```

For frontend-only verification, the normal gate is:

```bash
npm ci
npm run lint
npm run build
```

The main verification workflow also runs browser Audio Tools contracts, lyrics/stem worker regressions, AWS app-data contracts, retained AWS/Render regression tests, Python syntax checks, CloudFormation lint, TypeScript, and the production build.

### Album Cover backend development

From the repository root:

```bash
python -m pip install -r album_cover_backend/requirements.txt
cd album_cover_backend
python -m compileall -q app
python -m pytest -q tests
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The backend runtime file currently specifies Python `3.12.10`.

## Notable runtime dependencies

Key dependencies currently declared in `package.json` include:

- React 19 / React DOM 19
- Vite 6 and TypeScript 5.8
- Tailwind CSS 4
- `@huggingface/transformers@4.2.0`
- `onnxruntime-web@1.29.0`
- Express 5 / `tsx`
- `@google/genai`
- JSZip
- Recharts
- Motion
- LocalForage

`fourier-transform` and `@supabase/supabase-js` are still declared in `package.json`, but the current HTDemucs stem worker and AWS-native app-data path do not rely on them. Treat them as retained/compatibility dependencies until a separate cleanup change verifies they can be removed safely.

## Important source directories

```text
src/
  components/              React UI, portals, studios, Video Maker, YouTube Hub
  context/                 auth, media-store, and audio application state
  lib/                     shared utilities and compatibility facades
  services/                app-data, Music Intelligence, Audio Tools, YouTube, album-cover helpers
  workers/                 Whisper transcription and HTDemucs separation workers

public/transformers-wasm/  copied Transformers.js ONNX/WASM runtime assets
scripts/                   build/dev support scripts

aws/app-data/              active AWS application-data/auth/storage backend
aws/audio-tools/           legacy remote Audio Tools rollback infrastructure
aws/music-intelligence/    retained Music Intelligence backend infrastructure
render_audio_tools/        legacy Render Audio Tools rollback infrastructure
album_cover_backend/       active Album Cover Studio FastAPI backend source

docs/superpowers/          approved designs and implementation plans
server.ts                  local/legacy Express server plus Vite dev middleware
```

## Audio model licensing and provenance

Current browser Audio Tools use:

- Whisper Tiny through `onnx-community/whisper-tiny` and `@huggingface/transformers@4.2.0`.
- HTDemucs four-stem ONNX through `StemSplitio/htdemucs-onnx` / `htdemucs_fp16weights.onnx` and `onnxruntime-web@1.29.0`.

The selected HTDemucs model is used for **both** Stem Separation and the vocal-isolation stage of Synced Lyrics. The model is loaded on demand from Hugging Face; it is not bundled in the Git repository.

Read `THIRD_PARTY_NOTICES.md` before changing, mirroring, redistributing, or replacing browser model weights. Model-weight licensing and provenance must be reviewed separately from the surrounding code license.

Whisper/Transformers.js and HTDemucs are loaded lazily only when a user invokes the relevant tool; large models are not downloaded at application startup.

## Documentation notes and known stale references

A few retained repository documents still describe older remote/Spleeter-era architecture. When documentation conflicts with current production code, use the active browser call sites and workers as the source of truth:

- `src/services/browserAudioTools.ts`
- `src/workers/stems.worker.ts`
- `src/workers/lyrics.worker.ts`
- `src/services/musicIntelligence.ts`

In particular, older references to Spleeter, direct mixed-track lyric transcription, or remote Audio Tools as the production Analyze/Lyrics/Stems path are outdated.

## Deployment

The frontend is deployed through AWS Amplify from `main`, with the production custom origin:

```text
https://ezwaypro.theartistcut.com
```

A merged change is not considered production-verified until the Amplify build/deploy/verify stages succeed and the production app is checked against the intended user workflow.

For app-data deployment details, see `aws/app-data/README.md`. For Album Cover backend deployment details, see `album_cover_backend/README.md`. Treat older Audio Tools deployment guidance as rollback/legacy documentation unless it matches the active browser code paths above.

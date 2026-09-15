# EZ-WAY / The Artist Cut

EZ-WAY is the music workspace behind **The Artist Cut**. The production application combines catalog management, Music Intelligence, synced lyrics, stem separation, copyright workflows, album-cover generation, video/YouTube workflows, sharing, messaging, and client-facing utilities in one React application.

Production: `https://ezwaypro.theartistcut.com`

## Current architecture

```text
Browser / React
  ├─ Music Intelligence -> browser-local analysis
  ├─ Synced Lyrics      -> HTDemucs vocals -> Whisper Web Worker
  ├─ Stem Separation    -> HTDemucs 4-stem ONNX Web Worker (WASM)
  ├─ YouTube Hub        -> Google Identity Services + YouTube Data API
  ├─ Album Cover Studio -> separate EZ-WAY FastAPI backend
  └─ UI / playback / editing / sharing
          |
          v
AWS app-data API
  ├─ Cognito owner authentication
  ├─ Aurora PostgreSQL application data
  ├─ RDS Data API
  ├─ private S3 media storage
  └─ token-scoped public share routes
```

The application-data source of truth is AWS. Frontend persistence goes through `src/services/dataStore.ts`, which calls the AWS app-data API configured by `VITE_EZWAY_API_URL`.

`src/context/MediaStoreContext.tsx` is the application-facing state and mutation boundary. It keeps browser cache/fallback behavior but uses AWS for authoritative cloud data whenever the app-data API is reachable.

## Database and storage

The active application database is Aurora PostgreSQL Serverless v2 accessed through the AWS RDS Data API.

Backend source:

```text
aws/app-data/
  api/
    contract.mjs
    db.mjs
    handler.mjs
    rows.mjs
    storage.mjs
  migrations/
  deploy.sh
  smoke-test.sh
  template.yaml
```

Media is stored privately in S3. Browser uploads use short-lived presigned URLs; AWS credentials and database credentials are never exposed to browser code.

The canonical schema is maintained under `aws/app-data/migrations/`. Do not create or maintain a second root-level database schema.

## Authentication

Owner/admin authentication uses Amazon Cognito through:

- `src/services/auth.ts`
- `src/context/AuthContext.tsx`
- `src/components/AuthGate.tsx`
- `src/components/AdminSignIn.tsx`

Current owner authentication supports email/password sign-in, new-password challenges, token/session restoration, refresh-token handling, and sign-out.

Public share links are intentionally separate from owner authentication and use narrowly scoped token-based AWS endpoints.

## Browser-local audio tools

### Music Intelligence

`src/services/musicIntelligence.ts` and `src/services/localMusicIntelligence.ts` provide browser-local analysis used by EZ-WAY features. Analysis metadata can be persisted back to the AWS application data layer through normal track updates.

### Synced Lyrics

Synced Lyrics runs locally in the browser:

1. Decode/resample the source audio.
2. Run HTDemucs separation.
3. Isolate the vocals stem.
4. Resample vocals for transcription.
5. Run Whisper locally.
6. Produce timestamped lyrics.

If a reliable transcript cannot be produced, existing lyrics should remain unchanged.

### Stem Separation

Stem separation runs locally in a dedicated Web Worker using ONNX Runtime Web. The current flow produces vocals, drums, bass, and other stems, plus derived instrumental output where requested.

Large model files are loaded on demand rather than stored in this repository.

## Album Cover Studio

Frontend:

- `src/components/AlbumCoverStudio.tsx`
- `src/services/albumCoverStudio.ts`

Backend:

- `album_cover_backend/`

Browser-safe configuration:

```env
VITE_ALBUM_COVER_API_URL=...
```

Provider secrets belong only in the backend hosting environment.

## YouTube integration

The browser YouTube integration is implemented in `src/services/youtubeBrowser.ts` using Google Identity Services and the YouTube Data API.

Browser-safe configuration:

```env
VITE_GOOGLE_CLIENT_ID=...
```

Never expose a Google client secret in frontend environment variables.

## Frontend environment variables

Current browser-safe configuration groups are controlled by `vite.config.ts`.

Typical production values include:

```env
VITE_EZWAY_API_URL=...
VITE_COGNITO_USER_POOL_ID=...
VITE_COGNITO_USER_POOL_CLIENT_ID=...
VITE_GOOGLE_CLIENT_ID=...
VITE_ALBUM_COVER_API_URL=...
VITE_MUSIC_INTELLIGENCE_API_URL=...
VITE_AUDIO_TOOLS_URL=...
```

Do not place AWS access keys, database credentials, Cognito client secrets, Google client secrets, model-provider keys, or other private credentials in `VITE_*` variables.

The checked-in `.env.production` is not necessarily the complete production configuration. Hosting environment variables must be verified before diagnosing a missing frontend value.

## Development

Requirements:

- Node.js 18+
- npm
- Python 3.12 for the Album Cover backend and retained Python regression suites

Install and verify:

```bash
npm ci
npm run lint
npm run build
```

Run development mode:

```bash
npm run dev
```

Main npm scripts:

```bash
npm run dev
npm run lint
npm run build
npm start
npm run clean
```

## Production verification

A database or media change is not considered complete until these flows succeed against the intended environment:

1. Cognito owner sign-in.
2. AWS `/health` and authenticated `/bootstrap`.
3. Create, read, update, and delete a track.
4. Upload source media through a presigned S3 URL.
5. Reload and confirm the saved record returns from AWS.
6. Playlist and client CRUD.
7. Share-link creation and public share resolution.
8. Public playback/feedback/comment persistence.
9. Profile persistence.
10. Production build and UI smoke test.

For app-data deployment details, use `aws/app-data/README.md` and `aws/app-data/smoke-test.sh`.

## Repository layout

```text
src/
  components/      React UI and feature screens
  context/         authentication, media-store, and audio state
  lib/             shared utilities
  services/        AWS data, auth, audio, YouTube, and feature services
  workers/         browser audio/transcription workers

aws/app-data/      active AWS application database/auth/storage backend
aws/audio-tools/   retained remote audio tooling infrastructure
aws/music-intelligence/
album_cover_backend/
render_audio_tools/
server.ts          local/legacy Express server plus Vite development middleware
```

## Source-of-truth rule

When documentation and implementation disagree, treat the currently wired application code and active AWS app-data stack as authoritative. Old migration-era architecture should not be reintroduced into production code.

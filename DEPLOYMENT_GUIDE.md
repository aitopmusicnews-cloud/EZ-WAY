# EZ-WAY Production Deployment Guide

EZ-WAY production is an AWS-backed React/Vite application. The application-data stack, Music Intelligence stack, and Album Cover backend are deployed separately and must pass their relevant verification gates before production cutover.

## 1. Frontend

Production site: `https://ezwaypro.theartistcut.com`

Amplify preview/origin: `https://main.d1wu55zn1feotm.amplifyapp.com`

Build verification:

```bash
npm ci
npm run lint
npm run build
```

Do not expose AWS keys, database secrets, Cognito client secrets, RDS credentials, Gemini provider keys, or Cloudflare API tokens through Vite variables.

## 2. AWS application data

Current documentation and scripts live under:

- `aws/app-data/README.md`
- `aws/app-data/deploy.sh`
- `aws/app-data/smoke-test.sh`

The stack provides Aurora PostgreSQL Serverless v2 through RDS Data API, Cognito owner authentication, a private S3 media bucket, and an API Gateway/Lambda data API.

Deploy from AWS CloudShell on `feature/aws-music-intelligence`:

```bash
export AWS_REGION=us-west-2
export STACK_NAME=ezway-app-data
export ADMIN_EMAIL='you@example.com' # optional
bash aws/app-data/deploy.sh
```

The deployment prints these browser-safe values:

```text
VITE_EZWAY_API_URL=<EzwayApiBase>
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_USER_POOL_CLIENT_ID=<UserPoolClientId>
```

Do **not** copy them into Amplify until `aws/app-data/smoke-test.sh` reports `LIVE APP-DATA SMOKE PASSED`.

## 3. Music Intelligence / Audio Tools

Current documentation and infrastructure live under:

- `AUDIO_TOOLS.md`
- `aws/audio-tools/`
- `aws/music-intelligence/`

Production architecture:

```text
EZ-WAY upload
  -> AWS Audio Tools API
  -> SQS
  -> ECS Fargate Music Intelligence worker
  -> DynamoDB canonical analysis profile
  -> EZ-WAY
```

The Audio Tools health endpoint alone is not enough for cutover. A real HTTPS audio file must reach job status `completed`, and the saved canonical track profile must contain useful analysis data.

Only after that gate passes should production receive:

```text
VITE_AUDIO_TOOLS_URL=<verified Audio Tools API base>
```

## 4. Album Cover backend

The Album Cover backend source lives under `album_cover_backend/` in this EZ-WAY repository. The browser integration remains in `src/services/albumCoverStudio.ts` and calls the backend through the browser-safe `VITE_ALBUM_COVER_API_URL` value.

The public API hostname may remain:

```text
https://albumcover-api.theartistcut.com
```

The deployment behind that hostname must be built from the EZ-WAY `album_cover_backend/` subproject. The backend is API-only; the main EZ-WAY React application remains the Album Cover Studio user interface.

Required server-side provider configuration:

```text
CLOUDFLARE_ACCOUNT_ID=<Cloudflare account id>
CLOUDFLARE_API_TOKEN=<secret Workers AI token>
CLOUDFLARE_FLUX_MODEL=@cf/black-forest-labs/flux-1-schnell
CLOUDFLARE_FLUX_STEPS=4
CLOUDFLARE_TIMEOUT_SECONDS=150
GEMINI_API_KEY=<existing server-side Gemini key>
```

`CLOUDFLARE_API_TOKEN` must remain a backend hosting secret. Never add it to `.env.production`, any `VITE_*` variable, frontend TypeScript, or committed source.

Before Album Cover production cutover, run the backend tests, confirm `/health` reports the Cloudflare renderer configuration, and generate a real cover through the EZ-WAY Album Cover Studio. Gemini remains responsible for creative direction/ranking/critique; Cloudflare Workers AI FLUX.1 Schnell performs the final image render.

## 5. Amplify cutover safety

Before modifying Amplify environment variables, retrieve the existing environment-variable map and preserve every unrelated value. Do not use a command that replaces the whole map with only the three new app-data variables.

Required production verification after cutover:

1. Owner Cognito sign-in works.
2. Fresh AWS bootstrap loads the workspace.
3. Track upload reaches private S3 and the new track persists in Aurora.
4. Automatic Analyze reaches completed Music Intelligence and updates the track.
5. Playlist/client/share CRUD persists.
6. Public share opens without owner auth.
7. Public playback, approval/revision, and comments persist through token-scoped endpoints.
8. Album Cover Studio can call the configured Album Cover API without exposing provider secrets to the browser.
9. Reload confirms AWS is authoritative and localStorage is only cache/fallback.

## 6. Merge gate

Keep changes unmerged until the relevant live gates are green:

- app-data CRUD/private-media/public-share smoke test
- real Music Intelligence audio analysis smoke test
- Album Cover backend test suite and Cloudflare renderer regression for Album Cover changes

Production frontend variables and merge approval are final steps, not prerequisites to testing isolated backend stacks.

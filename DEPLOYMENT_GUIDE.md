# EZ-WAY Production Deployment Guide

EZ-WAY production is an AWS-backed React/Vite application. The application-data stack and Music Intelligence stack are deployed separately and must each pass their live smoke gates before frontend cutover or PR merge.

## 1. Frontend

Production site: `https://ezwaypro.theartistcut.com`

Amplify preview/origin: `https://main.d1wu55zn1feotm.amplifyapp.com`

Build verification:

```bash
npm ci
npm run lint
npm run build
```

Do not expose AWS keys, database secrets, Cognito client secrets, or RDS credentials through Vite variables.

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

## 4. Amplify cutover safety

Before modifying Amplify environment variables, retrieve the existing environment-variable map and preserve every unrelated value. Do not use a command that replaces the whole map with only the three new app-data variables.

Required production verification after cutover:

1. Owner Cognito sign-in works.
2. Fresh AWS bootstrap loads the workspace.
3. Track upload reaches private S3 and the new track persists in Aurora.
4. Automatic Analyze reaches completed Music Intelligence and updates the track.
5. Playlist/client/share CRUD persists.
6. Public share opens without owner auth.
7. Public playback, approval/revision, and comments persist through token-scoped endpoints.
8. Reload confirms AWS is authoritative and localStorage is only cache/fallback.

## 5. Merge gate

Keep PR #5 draft and unmerged until both live gates are green:

- app-data CRUD/private-media/public-share smoke test
- real Music Intelligence audio analysis smoke test

Production frontend variables and merge approval are the final steps, not prerequisites to testing the isolated AWS stacks.

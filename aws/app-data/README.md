# EZ-WAY AWS App Data

This stack replaces the removed Supabase application backend with an AWS-native data layer. It is intentionally separate from `aws/audio-tools/`, which continues to own Music Intelligence jobs and DynamoDB analysis profiles.

## Architecture

- Amazon Aurora PostgreSQL Serverless v2 for relational EZ-WAY data.
- RDS Data API for Lambda SQL access without browser database credentials.
- API Gateway HTTP API + Node.js 22 Lambda for all application data access.
- Amazon Cognito User Pool JWT authorization for owner/admin routes.
- Private encrypted Amazon S3 bucket for audio, artwork, video, message images, and profile images.
- Public Share Portal routes are token-scoped and do not expose general table access.

## Fresh-start behavior

The schema starts empty. No Supabase rows, storage objects, or browser cache are imported automatically. New data created after cutover becomes authoritative AWS data.

## Files

- `template.yaml` — infrastructure.
- `migrations/001_init.sql` — empty PostgreSQL schema.
- `scripts/migrate.mjs` — executes each migration statement through RDS Data API.
- `api/` — Lambda API, contract, storage, and serialization modules.
- `deploy.sh` — deployment automation, added later in this migration.
- `smoke-test.sh` — authenticated live verification, added later in this migration.

## Deployment safety

Do not set production `VITE_EZWAY_API_URL` or Cognito variables until the stack has passed live CRUD, private upload/read, public-share feedback, and cleanup smoke tests. Do not expose the RDS master secret, AWS access keys, or any Cognito client secret to Vite/browser code.

The stack retains the S3 media bucket on stack deletion and snapshots Aurora on replacement/deletion to reduce accidental data loss.

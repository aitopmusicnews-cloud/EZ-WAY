# EZ-WAY Music Intelligence on AWS

This folder replaces the new analyzer's Supabase `track_analysis` dependency with an AWS-native storage path.

## What AWS stores

DynamoDB stores one canonical analysis record per `track_id`:

- analyzer version
- processing / ready / error status
- audio source fingerprint
- BPM and confidence
- key and Camelot notation
- ranked genre / style / mood labels
- ranked instrument / production labels
- detected song sections and chapter timestamps
- reusable keywords and evidence
- timestamps and error state

The audio analyzer itself remains separate from this storage layer. The current feature branch still runs the Music Intelligence models through Audio Tools / Modal; moving that worker to AWS can happen independently later.

## Security model

The included AWS SAM template creates an API Gateway HTTP API with `AWS_IAM` authorization enabled by default. Do not put long-lived AWS access keys or secret keys in the Vite/browser bundle.

During the transition, keep `VITE_MUSIC_INTELLIGENCE_API_URL` unset unless EZ-WAY has an authenticated server/proxy that can invoke the IAM-protected AWS API. With the variable unset, the feature branch uses its browser-local cache for development while the rest of EZ-WAY is migrated.

After the EZ-WAY backend is running on AWS with an IAM role, proxy the profile API through the backend and set:

```env
VITE_MUSIC_INTELLIGENCE_API_URL=/api/music-intelligence
```

The frontend expects that base to expose:

```text
GET    <base>/{trackId}
PUT    <base>/{trackId}
DELETE <base>/{trackId}
```

The AWS Lambda in this folder exposes the same record contract at `/track-analysis/{trackId}`.

## Deploy the AWS storage stack

From this folder, with AWS SAM configured for the target AWS account:

```bash
sam build
sam deploy --guided
```

The stack creates:

- a DynamoDB table with `track_id` as the partition key
- point-in-time recovery
- on-demand billing
- a Node.js Lambda CRUD function
- an IAM-protected API Gateway HTTP API

Use the stack output `MusicIntelligenceApiBase` from an authenticated EZ-WAY backend. Do not wire that IAM endpoint straight into an unsigned browser client.

## Migration sequence

1. Deploy this DynamoDB/Lambda stack.
2. Move or deploy the EZ-WAY backend to AWS and give its execution role permission to invoke the Music Intelligence API (or call the DynamoDB table through a server-side adapter).
3. Set the frontend profile API base to the authenticated same-origin EZ-WAY backend route.
4. Backfill existing tracks by running Music Intelligence once per unique audio fingerprint.
5. Move audio storage to S3 separately when the wider EZ-WAY AWS migration reaches file storage.

This keeps the analyzer profile contract stable while allowing Supabase, file storage, and compute to be migrated independently.
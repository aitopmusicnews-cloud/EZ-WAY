# EZ-WAY Fresh AWS Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the removed Supabase backend with a fresh AWS-native application data layer while preserving EZ-WAY's current UI, domain types, offline cache behavior, public share workflow, and separate Music Intelligence architecture.

**Architecture:** Add an independently deployable `aws/app-data` stack containing Aurora PostgreSQL Serverless v2 with RDS Data API, a private S3 media bucket, a Node 22 Lambda behind API Gateway HTTP API, and a Cognito User Pool authorizer. The React app keeps `MediaStoreContext` as its public data boundary but calls a new backend-neutral `dataStore` service; public share links use token-scoped endpoints while owner CRUD requires Cognito authentication.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Node 22, AWS SAM/CloudFormation, API Gateway HTTP API, Lambda, Aurora PostgreSQL Serverless v2, RDS Data API, Cognito User Pools, S3, AWS SDK v3, localStorage/localforage.

**Spec:** `docs/superpowers/specs/2026-08-28-ezway-aws-data-layer-design.md`

## Global Constraints

- Fresh start: do not import or silently upload old Supabase rows, storage objects, or browser-cached records.
- Preserve the existing `MediaStoreContext` component-facing method names and the current `Track`, `Playlist`, `Client`, `Activity`, `ShareLink`, `UserProfile`, `Message`, and `PromoVideo` shapes.
- Keep Music Intelligence on the existing Audio Tools API -> SQS -> Fargate -> DynamoDB path.
- No database password, AWS access key, RDS secret, Cognito client secret, or administrative credential in browser/Vite code.
- S3 application media remains private; browser upload/download uses time-limited presigned URLs.
- Owner CRUD routes require Cognito JWT authorization. Public share routes are limited to a valid share token and the content/actions authorized by that token.
- Preserve public Share Portal playback, play counting, approvals/revisions, and comments through token-scoped public feedback operations; do not expose general table mutation to anonymous callers.
- `tags`, `track_ids`, and other frontend arrays are stored as JSONB rather than PostgreSQL array columns so RDS Data API never depends on unsupported array parameters; API responses restore normal JavaScript arrays.
- RDS Data API `ExecuteStatement` calls contain one SQL statement each. Migrations use explicit statement boundaries and execute statements separately.
- Keep localStorage/localforage as fallback/cache only. When AWS is reachable, AWS is authoritative for new cloud data.
- Do not merge PR #5 or switch production environment variables until live CRUD, upload, public-share, and Music Intelligence smoke tests pass.

---

## File Structure

### New AWS application-data stack

- `aws/app-data/template.yaml` — Aurora, Data API, S3, Lambda, API Gateway, Cognito, IAM, outputs.
- `aws/app-data/api/package.json` — Lambda runtime dependencies.
- `aws/app-data/api/db.mjs` — parameter conversion and single-statement RDS Data API execution.
- `aws/app-data/api/rows.mjs` — database-row/domain-object serialization and media URL resolution hooks.
- `aws/app-data/api/storage.mjs` — S3 key validation and presign helpers.
- `aws/app-data/api/contract.mjs` — route input validation, patch allowlists, public feedback validation.
- `aws/app-data/api/handler.mjs` — HTTP route dispatch and orchestration only.
- `aws/app-data/api/contract.test.mjs` — pure API contract tests.
- `aws/app-data/api/rows.test.mjs` — JSONB/domain mapping tests.
- `aws/app-data/migrations/001_init.sql` — empty production schema, no seed rows, explicit `-- statement-breakpoint` separators.
- `aws/app-data/scripts/migrate.mjs` — reads migration files and invokes AWS CLI `rds-data execute-statement` once per statement.
- `aws/app-data/deploy.sh` — deploy stack, run schema migration, optionally create initial admin, print frontend variables.
- `aws/app-data/smoke-test.sh` — authenticated CRUD/upload/share cleanup smoke test.
- `aws/app-data/README.md` — deployment and recovery instructions.

### New frontend boundary

- `src/services/auth.ts` — Cognito session/sign-in/sign-out helpers.
- `src/services/auth.test.ts` — pure token/session/config tests.
- `src/context/AuthContext.tsx` — owner session state.
- `src/components/AdminSignIn.tsx` — compact sign-in/new-password challenge UI.
- `src/components/AuthGate.tsx` — allows valid public share URLs without owner login, gates normal workspace.
- `src/services/dataStore.ts` — typed EZ-WAY API client.
- `src/services/dataStore.test.ts` — request/response contract tests.

### Existing files to modify

- `src/context/MediaStoreContext.tsx` — replace Supabase operations with `dataStore` operations while preserving public context interface.
- `src/App.tsx` — replace direct Supabase database status/inspection calls; route public Share Portal feedback through token-scoped dataStore calls.
- `src/main.tsx` — add AuthProvider/AuthGate without blocking `?token=` / `?share=` public links.
- `src/types.ts` — only additive internal media-key fields if required; do not rename current public fields.
- `src/components/UploadZone.tsx` — no UI redesign; continue using `uploadFile()` and current analysis sequence.
- `vite.config.ts` — remove Supabase environment replacement.
- `.env.production` — add verified AWS URLs only at cutover stage.
- `package.json`, `package-lock.json` — remove Supabase SDK, add Cognito browser auth dependency.
- `.github/workflows/music-intelligence-verify.yml` — add app-data tests/lint/security guards.
- `README.md`, `DEPLOYMENT_GUIDE.md` — make AWS app-data stack current documentation.

### Files to remove/archive after callers are migrated

- `src/lib/supabase.ts`
- `supabase_dev_guide.md`
- `supabase_schema.md`
- `supabase_schema.sql`

Keep `schema.sql` only if renamed/reframed as historical reference; it must not remain presented as the production deployment path.

---

### Task 1: Fresh PostgreSQL schema and migration runner

**Files:**
- Create: `aws/app-data/migrations/001_init.sql`
- Create: `aws/app-data/scripts/migrate.mjs`
- Create: `aws/app-data/api/rows.mjs`
- Create: `aws/app-data/api/rows.test.mjs`

**Interfaces:**
- Produces empty tables: `tracks`, `playlists`, `clients`, `share_links`, `activities`, `messages`, `promo_videos`, `promo_packs`, `profiles`, `todos`.
- Produces `parseJsonArray(value)`, `rowToTrack(row)`, `rowToPlaylist(row)`, `rowToClient(row)`, `rowToShareLink(row)`, `rowToActivity(row)`, `rowToMessage(row)`, `rowToPromoVideo(row)`, and `rowToProfile(row)`.
- `migrate.mjs` consumes `DB_CLUSTER_ARN`, `DB_SECRET_ARN`, `DB_NAME`, `AWS_REGION` and migration files separated by `-- statement-breakpoint`.

- [ ] **Step 1: Write the RED row-mapping tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { rowToTrack, rowToPlaylist } from './rows.mjs';

test('JSONB arrays return normal frontend arrays', () => {
  assert.deepEqual(rowToTrack({ id: 't1', name: 'Song', tags: '["R&B","Smooth"]' }).tags, ['R&B', 'Smooth']);
  assert.deepEqual(rowToPlaylist({ id: 'p1', name: 'Set', track_ids: '["t1","t2"]' }).track_ids, ['t1', 't2']);
});

test('missing JSONB arrays become empty arrays', () => {
  assert.deepEqual(rowToTrack({ id: 't1', name: 'Song', tags: null }).tags, []);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test aws/app-data/api/rows.test.mjs`
Expected: FAIL because `rows.mjs` does not exist.

- [ ] **Step 3: Create `001_init.sql`** with no seed/truncate/Supabase storage/RLS-role statements. Use `UUID PRIMARY KEY`, JSONB arrays (`tags`, `track_ids`), existing foreign-key delete semantics, current status checks, indexes, and stable media-key columns such as `tracks.file_key`, `tracks.image_key`, `playlists.image_key`, `clients.avatar_key`, `messages.image_key`, `promo_videos.video_key`, `promo_videos.thumbnail_key`, and `profiles.avatar_key`.

Each DDL unit ends with:

```sql
-- statement-breakpoint
```

Example table pattern:

```sql
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'OGBeatz',
  duration INTEGER NOT NULL DEFAULT 0,
  bpm INTEGER NOT NULL DEFAULT 0,
  key_signature TEXT NOT NULL DEFAULT '',
  file_key TEXT,
  image_key TEXT,
  size BIGINT NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'audio/mpeg',
  plays INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  lyrics TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready','processing','error')) DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint
```

- [ ] **Step 4: Implement minimal row mapping** that accepts RDS formatted JSON values and always emits the existing frontend shape. Media key fields remain additive/internal; expiring URL fields are populated later by the storage resolver.

- [ ] **Step 5: Implement migration runner** that splits only on the explicit breakpoint marker and executes each non-empty statement separately through:

```js
spawnSync('aws', [
  'rds-data', 'execute-statement',
  '--region', region,
  '--resource-arn', clusterArn,
  '--secret-arn', secretArn,
  '--database', database,
  '--sql', statement,
], { stdio: 'inherit' });
```

Abort on the first non-zero exit status.

- [ ] **Step 6: Run GREEN and syntax checks**

Run: `node --test aws/app-data/api/rows.test.mjs`
Run: `node --check aws/app-data/api/rows.mjs aws/app-data/scripts/migrate.mjs`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add aws/app-data/migrations aws/app-data/scripts aws/app-data/api/rows.mjs aws/app-data/api/rows.test.mjs
git commit -m "feat: add fresh AWS app data schema"
```

---

### Task 2: Aurora, S3, Cognito, API Gateway, and Lambda infrastructure

**Files:**
- Create: `aws/app-data/template.yaml`
- Create: `aws/app-data/api/package.json`
- Create: `aws/app-data/README.md`
- Modify: `.github/workflows/music-intelligence-verify.yml`

**Interfaces:**
- Produces stack outputs `EzwayApiBase`, `DatabaseClusterArn`, `DatabaseSecretArn`, `DatabaseName`, `MediaBucketName`, `UserPoolId`, `UserPoolClientId`.
- Lambda receives `DB_CLUSTER_ARN`, `DB_SECRET_ARN`, `DB_NAME`, `MEDIA_BUCKET`, `ALLOWED_ORIGINS`.
- HTTP API JWT authorizer accepts the Cognito user-pool issuer and the generated app-client audience.

- [ ] **Step 1: Add an infrastructure contract test to CI** before the template exists:

```bash
cfn-lint aws/app-data/template.yaml
```

and deployment-script syntax check later:

```bash
bash -n aws/app-data/deploy.sh aws/app-data/smoke-test.sh
```

Run the workflow locally equivalent and verify RED because `template.yaml` is absent.

- [ ] **Step 2: Define Aurora Serverless v2** using an encrypted `AWS::RDS::DBCluster` with `Engine: aurora-postgresql`, `DatabaseName: ezway`, `EnableHttpEndpoint: true`, `ManageMasterUserPassword: true`, a DB subnet group, and `ServerlessV2ScalingConfiguration` of `MinCapacity: 0.5`, `MaxCapacity: 2`. Add one `AWS::RDS::DBInstance` with `DBInstanceClass: db.serverless` and `PubliclyAccessible: false`.

- [ ] **Step 3: Define the private media bucket** with public-access block enabled, encryption, lifecycle cleanup for incomplete multipart uploads, and CORS allowing `PUT/GET/HEAD` from `https://ezwaypro.theartistcut.com` and `https://main.d1wu55zn1feotm.amplifyapp.com`.

- [ ] **Step 4: Define Cognito** with email sign-in, an app client with no secret, `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`, and `PreventUserExistenceErrors: ENABLED`.

- [ ] **Step 5: Define Lambda + HTTP API** using Node.js 22 arm64. Default-protect owner routes with JWT auth, then explicitly set `Authorizer: NONE` for `GET /health`, `GET /public/share/{token}`, and `POST /public/share/{token}/events`.

- [ ] **Step 6: Give Lambda least privilege** for `rds-data:ExecuteStatement`, transaction actions, `secretsmanager:GetSecretValue` on only the managed master secret, and S3 object read/write/delete on only the media bucket.

- [ ] **Step 7: Add API package metadata**

```json
{
  "name": "ezway-app-data-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-rds-data": "^3.0.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0"
  }
}
```

Use the resolved lockfile produced by `npm install --package-lock-only` in `aws/app-data/api`; do not hand-edit dependency resolutions.

- [ ] **Step 8: Verify GREEN**

Run: `cfn-lint aws/app-data/template.yaml`
Run: `sam validate --lint --template-file aws/app-data/template.yaml`
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add aws/app-data/template.yaml aws/app-data/api/package.json aws/app-data/api/package-lock.json aws/app-data/README.md .github/workflows/music-intelligence-verify.yml
git commit -m "feat: add AWS app data infrastructure"
```

---

### Task 3: RDS Data API helpers and owner CRUD contract

**Files:**
- Create: `aws/app-data/api/db.mjs`
- Create: `aws/app-data/api/contract.mjs`
- Create: `aws/app-data/api/contract.test.mjs`
- Create: `aws/app-data/api/handler.mjs`

**Interfaces:**
- `execute(sql, params = [], options = {}) -> Promise<any[]>`
- `executeTransaction(statements) -> Promise<void>` where each item is `{ sql, params }`.
- `normalizeTrackCreate(body)`, `normalizePatch(entity, body)`, `normalizeShareCreate(body)`, `normalizePublicEvent(body)`.
- Owner routes: `GET /health`, `GET /bootstrap`, CRUD routes from the spec, `POST /uploads/presign`.

- [ ] **Step 1: Write RED validation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrackCreate, normalizePatch } from './contract.mjs';

test('track create serializes tags as JSON text', () => {
  const track = normalizeTrackCreate({ id: '00000000-0000-4000-8000-000000000001', name: 'Song', tags: ['R&B'] });
  assert.equal(track.tagsJson, '["R&B"]');
});

test('track patch rejects database/internal fields', () => {
  assert.throws(() => normalizePatch('tracks', { created_at: 'forged', file_key: '../../bad' }), /not allowed/i);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test aws/app-data/api/contract.test.mjs`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement `db.mjs`** using `ExecuteStatementCommand({ formatRecordsAs: 'JSON' })`. Parameters support strings, booleans, integers, doubles, UUID strings, timestamps as strings, and JSON strings. SQL identifiers are never supplied by user input.

- [ ] **Step 4: Implement contract allowlists** for patchable fields per entity. Build dynamic `SET` clauses only from server-owned allowlists, e.g. tracks may patch `name`, `artist`, `duration`, `bpm`, `key_signature`, `size`, `type`, `plays`, `likes`, `tags`, `lyrics`, `status`, `file_key`, `image_key`.

- [ ] **Step 5: Implement `/health` and `/bootstrap`**. `/bootstrap` performs fixed selects, maps JSONB arrays to existing frontend arrays, signs private media keys through Task 4 helper, and returns exactly:

```json
{
  "tracks": [],
  "playlists": [],
  "clients": [],
  "activities": [],
  "share_links": [],
  "messages": [],
  "promo_videos": [],
  "profile": null
}
```

- [ ] **Step 6: Implement owner CRUD** for tracks, playlists, clients, share links, activities, messages, profile, promo videos. Create calls use frontend UUIDs when supplied. Delete calls return `204`. Missing records return `404`. Database exceptions are logged server-side and return a generic `500` JSON message.

- [ ] **Step 7: Run GREEN/syntax**

Run: `node --test aws/app-data/api/contract.test.mjs aws/app-data/api/rows.test.mjs`
Run: `node --check aws/app-data/api/db.mjs aws/app-data/api/contract.mjs aws/app-data/api/handler.mjs`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add aws/app-data/api
git commit -m "feat: add EZ-WAY app data API"
```

---

### Task 4: Private S3 upload and media URL resolution

**Files:**
- Create: `aws/app-data/api/storage.mjs`
- Create: `aws/app-data/api/storage.test.mjs`
- Modify: `aws/app-data/api/handler.mjs`
- Modify: `aws/app-data/api/rows.mjs`

**Interfaces:**
- `normalizeUploadRequest(body) -> { category, relatedId, filename, contentType, size }`
- `buildObjectKey(input) -> string`
- `presignUpload(input) -> { upload_url, object_key, headers }`
- `presignRead(objectKey) -> string`

- [ ] **Step 1: Write RED storage tests** proving path traversal is rejected, only known categories are accepted, and claimed size limits are enforced.

```js
test('audio upload gets a server-owned key', () => {
  const key = buildObjectKey({ category: 'tracks', relatedId: 't1', filename: 'master.wav' });
  assert.match(key, /^tracks\/audio\/t1\//);
});

test('unsafe filenames are rejected', () => {
  assert.throws(() => buildObjectKey({ category: 'tracks', relatedId: 't1', filename: '../secret' }), /filename/i);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test aws/app-data/api/storage.test.mjs`
Expected: FAIL because storage module is absent.

- [ ] **Step 3: Implement categories and limits**: `tracks` audio <= 500 MiB, `artwork` image <= 20 MiB, `promo-video` video <= 2 GiB, `message-image` image <= 20 MiB, `profile-image` image <= 20 MiB. Reject content types outside the category family.

- [ ] **Step 4: Implement PUT presigning** for 10 minutes using bucket from `MEDIA_BUCKET`; include the validated content type in the signed request. Return only the presigned URL, stable object key, and required headers.

- [ ] **Step 5: Implement GET presigning** for 30 minutes and make row serializers populate `file_url`, `image_url`, `video_url`, `thumbnail_url`, and avatar URLs from stable object keys. Never persist the generated URL back into PostgreSQL.

- [ ] **Step 6: Run GREEN**

Run: `node --test aws/app-data/api/storage.test.mjs aws/app-data/api/rows.test.mjs`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add aws/app-data/api
git commit -m "feat: add private S3 media flow"
```

---

### Task 5: Token-scoped public Share Portal API

**Files:**
- Modify: `aws/app-data/api/contract.mjs`
- Modify: `aws/app-data/api/contract.test.mjs`
- Modify: `aws/app-data/api/handler.mjs`

**Interfaces:**
- `GET /public/share/{token}` resolves only the token's track or playlist plus playlist tracks and token-scoped inbound message history needed by SharePortal.
- `POST /public/share/{token}/events` accepts only `{ type: 'play' | 'thumbs_up' | 'thumbs_down' | 'comment', track_id?, content? }`.

- [ ] **Step 1: Add RED public-event tests**

```js
test('public feedback accepts only the four share event types', () => {
  assert.equal(normalizePublicEvent({ type: 'play', track_id: 't1' }).type, 'play');
  assert.throws(() => normalizePublicEvent({ type: 'delete_track', track_id: 't1' }), /event/i);
});
```

- [ ] **Step 2: Implement share resolution** with one fixed query for `share_links.token`, reject expired links, then fetch only the referenced track/playlist and permitted playlist tracks. Increment `access_count` server-side on successful resolution so anonymous clients do not need a general access-counter mutation endpoint.

- [ ] **Step 3: Implement public events**. Before any write, load the share by token and verify `track_id` belongs to that share. Server derives `client_id`, `recipient_email`, and playlist context from the share row rather than trusting caller-supplied ownership fields.

Behavior:
- `play`: atomically `plays = plays + 1` and insert an activity.
- `thumbs_up`: atomically `likes = likes + 1`, insert activity, insert inbound approval message when `client_id` exists.
- `thumbs_down`: insert revision activity/message only.
- `comment`: require non-empty content <= 4000 chars; insert activity/message only.

- [ ] **Step 4: Run GREEN**

Run: `node --test aws/app-data/api/contract.test.mjs`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add aws/app-data/api
git commit -m "feat: preserve secure public share feedback"
```

---

### Task 6: Cognito browser authentication and public-share bypass

**Files:**
- Create: `src/services/auth.ts`
- Create: `src/services/auth.test.ts`
- Create: `src/context/AuthContext.tsx`
- Create: `src/components/AdminSignIn.tsx`
- Create: `src/components/AuthGate.tsx`
- Modify: `src/main.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `getIdToken(): string | null`
- `signIn(email, password): Promise<{ status: 'signed_in' } | { status: 'new_password_required', user: unknown }>`
- `completeNewPassword(user, newPassword): Promise<void>`
- `signOut(): void`
- `AuthGate` bypasses owner login only when URL contains a non-empty `token` or `share` query parameter.

- [ ] **Step 1: Add `amazon-cognito-identity-js` with npm** and write RED pure configuration/session tests. Tests must not make network calls.

- [ ] **Step 2: Implement auth config** from `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID`; fail with a clear configuration error if either is absent on owner routes.

- [ ] **Step 3: Implement session restore/sign-in/sign-out/new-password challenge**. Do not create a client secret. Do not log tokens.

- [ ] **Step 4: Implement compact sign-in UI** with email/password fields and a new-password field only when Cognito returns `newPasswordRequired`. Keep the existing app styling; no workspace redesign.

- [ ] **Step 5: Modify `main.tsx`** to render:

```tsx
<AuthProvider>
  <AuthGate>
    <MediaStoreProvider>
      <AudioProvider>
        <App />
      </AudioProvider>
    </MediaStoreProvider>
  </AuthGate>
</AuthProvider>
```

Public `?token=` / `?share=` links continue through without owner authentication; `client_portal` alone does not bypass owner auth.

- [ ] **Step 6: Run tests/build**

Run: `node --experimental-strip-types --test src/services/auth.test.ts`
Run: `npm run lint`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/auth.ts src/services/auth.test.ts src/context/AuthContext.tsx src/components/AdminSignIn.tsx src/components/AuthGate.tsx src/main.tsx package.json package-lock.json
git commit -m "feat: add Cognito owner authentication"
```

---

### Task 7: Backend-neutral frontend `dataStore` adapter

**Files:**
- Create: `src/services/dataStore.ts`
- Create: `src/services/dataStore.test.ts`

**Interfaces:**

```ts
export interface BootstrapPayload {
  tracks: Track[];
  playlists: Playlist[];
  clients: Client[];
  activities: Activity[];
  share_links: ShareLink[];
  messages: Message[];
  promo_videos: PromoVideo[];
  profile: UserProfile | null;
}

health(): Promise<{ status: 'ok'; provider: 'aws' }>
bootstrap(): Promise<BootstrapPayload>
createTrack(track: Track): Promise<Track>
updateTrack(id: string, updates: Partial<Track>): Promise<Track>
deleteTrack(id: string): Promise<void>
createPlaylist(playlist: Playlist): Promise<Playlist>
updatePlaylist(id: string, updates: Partial<Playlist>): Promise<Playlist>
deletePlaylist(id: string): Promise<void>
createClient(client: Client): Promise<Client>
updateClient(id: string, updates: Partial<Client>): Promise<Client>
deleteClient(id: string): Promise<void>
createShareLink(link: ShareLink): Promise<ShareLink>
deleteShareLink(id: string): Promise<void>
createActivity(activity: Activity): Promise<Activity>
createMessage(message: Message): Promise<Message>
putProfile(profile: UserProfile): Promise<UserProfile>
createPromoVideo(video: PromoVideo): Promise<PromoVideo>
deletePromoVideo(id: string): Promise<void>
uploadFile(category: string, relatedId: string, file: File): Promise<{ url: string; objectKey: string }>
getPublicShare(token: string): Promise<PublicSharePayload | null>
postPublicShareEvent(token: string, event: PublicShareEvent): Promise<void>
```

- [ ] **Step 1: Write RED tests** with a stubbed `globalThis.fetch`, proving owner requests attach `Authorization: Bearer <id-token>`, public-share requests do not, non-2xx JSON produces a typed error, and upload performs presign then PUT.

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test src/services/dataStore.test.ts`
Expected: FAIL because `dataStore.ts` is absent.

- [ ] **Step 3: Implement `request()`** using `VITE_EZWAY_API_URL`, normalized trailing slash, JSON headers, optional auth, and a 30-second timeout via `AbortController`.

- [ ] **Step 4: Implement all domain methods** listed above. Strip browser-only blob fields (`file_data`, `image_data`, `video_data`, `thumbnail_data`, `_brokenBlob`) before JSON mutation requests.

- [ ] **Step 5: Implement upload**: request presign, `PUT` the original File with signed content type, return the stable key plus the presigned GET URL returned by a follow-up entity response or a dedicated resolve response. `MediaStoreContext.uploadFile()` continues returning a URL to existing callers.

- [ ] **Step 6: Run GREEN**

Run: `node --experimental-strip-types --test src/services/dataStore.test.ts`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/dataStore.ts src/services/dataStore.test.ts
git commit -m "feat: add AWS data store adapter"
```

---

### Task 8: Migrate `MediaStoreContext` without changing component contracts

**Files:**
- Modify: `src/context/MediaStoreContext.tsx`
- Create: `src/services/mediaStoreMigration.test.ts`

**Interfaces:**
- Existing `MediaStoreContextType` remains component-compatible.
- `connected` means authenticated AWS data API bootstrap succeeded.
- Public share methods route through public token endpoints when no owner session exists.

- [ ] **Step 1: Write RED static/behavior contract tests** checking the context no longer imports `getSupabaseClient`, still exposes existing method names, and initializes from one `dataStore.bootstrap()` rather than table-by-table `.from()` calls.

- [ ] **Step 2: Replace startup initialization**: call `dataStore.health()` then `dataStore.bootstrap()` when owner-authenticated. On success, replace cloud-backed collections with bootstrap data, set `connected=true`, and preserve local-only blob restoration. On failure, keep cached state and set `connected=false`.

- [ ] **Step 3: Replace all CRUD methods** with corresponding dataStore calls. Apply returned server object to React state only after the remote mutation succeeds. On failure, leave prior state intact and surface the existing toast/log path.

- [ ] **Step 4: Preserve offline cache behavior**. Existing localStorage effects remain, but bootstrap must not push cached data back to AWS. Remove any startup code that mutates schema or seeds remote tables.

- [ ] **Step 5: Replace `uploadFile(bucket, file)`** internally. Generate a related UUID when upload occurs before entity creation, map legacy bucket names (`tracks`, `artwork`, etc.) to the AWS upload categories, call `dataStore.uploadFile`, and return the generated HTTPS URL so `UploadZone` does not change its workflow.

- [ ] **Step 6: Public share path**: `getShareContent(token)` calls `dataStore.getPublicShare(token)`. `incrementShareLinkAccess` becomes owner-only/no-op for anonymous share pages because successful public resolution increments access server-side.

- [ ] **Step 7: Run tests**

Run: `node --experimental-strip-types --test src/services/mediaStoreMigration.test.ts src/services/dataStore.test.ts`
Run: `npm run lint`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/context/MediaStoreContext.tsx src/services/mediaStoreMigration.test.ts
git commit -m "refactor: move media store from Supabase to AWS"
```

---

### Task 9: Remove direct Supabase usage from App and preserve public review actions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/SharePortal.tsx`
- Modify: `src/services/dataStore.ts`
- Modify: `src/services/dataStore.test.ts`

**Interfaces:**
- App database check uses `dataStore.health()` and displays the configured EZ-WAY API URL, not a database URL.
- Settings inspection uses a safe owner endpoint such as `GET /diagnostics` returning table names/counts only; it never accepts arbitrary table names or SQL.
- SharePortal play/rating/comment actions call `postPublicShareEvent(token, ...)` when rendered from a public share.

- [ ] **Step 1: Add a protected `GET /diagnostics` backend route** returning only fixed table counts for the known schema and add a dataStore method for it.

- [ ] **Step 2: Remove App imports** of `getSupabaseClient` and `supabaseUrl`. Replace `checkDatabase()` with `dataStore.health()`. Replace the arbitrary custom-table inspector with the fixed `/diagnostics` result; remove the custom table input because accepting arbitrary identifiers is unnecessary and unsafe.

- [ ] **Step 3: Update SharePortal public mutations**. When a `shareLink.token` is present, play/approval/revision/comment use the public event API. Do not call owner `updateTrack`, `addActivity`, or `sendMessage` from anonymous mode. Owner-preview mode may keep the owner methods.

- [ ] **Step 4: Ensure playlist share payload includes playlist tracks** so SharePortal does not depend on owner `/bootstrap` data when unauthenticated.

- [ ] **Step 5: Run tests/build**

Run: `node --experimental-strip-types --test src/services/dataStore.test.ts`
Run: `npm run lint`
Run: `npm run build`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/SharePortal.tsx src/services/dataStore.ts src/services/dataStore.test.ts aws/app-data/api
git commit -m "refactor: remove direct Supabase UI access"
```

---

### Task 10: Remove Supabase SDK, credential paths, and obsolete deployment docs

**Files:**
- Delete: `src/lib/supabase.ts`
- Delete: `supabase_dev_guide.md`
- Delete: `supabase_schema.md`
- Delete: `supabase_schema.sql`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `README.md`
- Modify: `DEPLOYMENT_GUIDE.md`
- Modify: `.github/workflows/music-intelligence-verify.yml`
- Optionally rename/archive: `schema.sql` -> `docs/archive/legacy-supabase-schema.sql`

**Interfaces:**
- Production frontend recognizes only backend-neutral AWS/Cognito variables.
- CI prevents Supabase production imports and service-role token patterns from returning.

- [ ] **Step 1: Add RED CI guards** before deletion:

```bash
! grep -R -E "@supabase/supabase-js|getSupabaseClient|VITE_SUPABASE_|SUPABASE_ANON_KEY|SUPABASE_URL" src vite.config.ts .env.production
! grep -R -E 'service_role' src
```

Expected: FAIL on current branch before cleanup.

- [ ] **Step 2: Run `npm uninstall @supabase/supabase-js`** so `package.json` and lockfile are updated by npm.

- [ ] **Step 3: Delete `src/lib/supabase.ts`** only after Tasks 8-9 remove every import.

- [ ] **Step 4: Remove Supabase defines** from `vite.config.ts`. Do not add RDS/S3 credentials in their place.

- [ ] **Step 5: Archive/delete obsolete Supabase setup docs** and update current deployment documentation to point to `aws/app-data/README.md` plus `aws/audio-tools/README.md`.

- [ ] **Step 6: Expand workflow checks**

```yaml
- name: AWS app data API tests
  run: node --test aws/app-data/api/*.test.mjs

- name: AWS app data infrastructure lint
  run: cfn-lint aws/app-data/template.yaml

- name: AWS app data deploy syntax
  run: bash -n aws/app-data/deploy.sh aws/app-data/smoke-test.sh

- name: No Supabase production runtime
  run: |
    test ! -f src/lib/supabase.ts
    ! grep -R -E "@supabase/supabase-js|getSupabaseClient|VITE_SUPABASE_|SUPABASE_ANON_KEY|SUPABASE_URL" src vite.config.ts .env.production
    ! grep -R -E 'service_role' src
```

- [ ] **Step 7: Run GREEN**

Run: `npm ci`
Run: `npm run lint`
Run: `npm run build`
Run: `node --test aws/app-data/api/*.test.mjs`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove Supabase runtime and credentials"
```

---

### Task 11: Deployment automation, initial admin, and live smoke test

**Files:**
- Create: `aws/app-data/deploy.sh`
- Create: `aws/app-data/smoke-test.sh`
- Modify: `aws/app-data/README.md`

**Interfaces:**
- `deploy.sh` accepts `AWS_REGION` default `us-west-2`, `STACK_NAME` default `ezway-app-data`, `PRODUCTION_ORIGIN`, `AMPLIFY_ORIGIN`, optional `ADMIN_EMAIL`.
- `smoke-test.sh` accepts `EZWAY_API_BASE`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, and temporary owner credentials through environment variables; it never echoes passwords/tokens.

- [ ] **Step 1: Write deploy script** to discover the default VPC/publicly routable subnets for RDS subnet-group placement, run `sam build`, `sam deploy`, read stack outputs, run `migrate.mjs`, call `/health`, and print the three public frontend values:

```text
VITE_EZWAY_API_URL=<EzwayApiBase>
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_USER_POOL_CLIENT_ID=<UserPoolClientId>
```

If `ADMIN_EMAIL` is set, run `aws cognito-idp admin-create-user` only when the user does not already exist. Do not set a permanent password in the script; Cognito's temporary-password challenge is handled by the app.

- [ ] **Step 2: Write smoke script** to obtain an ID token with Cognito, verify `/bootstrap` starts empty, create one temporary track/client/share, resolve the public share without Authorization, post one public play event, verify counts through authenticated bootstrap, then delete the test records. For upload smoke, create a tiny text/image fixture only in an allowed category or use a supplied `SMOKE_AUDIO_FILE`; do not commit binary test audio.

- [ ] **Step 3: Syntax test**

Run: `bash -n aws/app-data/deploy.sh aws/app-data/smoke-test.sh`
Run: `node --check aws/app-data/scripts/migrate.mjs`
Expected: pass.

- [ ] **Step 4: Deploy in CloudShell** from the feature branch. Do not modify production Amplify variables yet.

- [ ] **Step 5: Run live smoke test** and require all of these before cutover:

```text
health: ok
bootstrap: empty before test
track CRUD: pass
private S3 upload/read: pass
client/share creation: pass
public share resolve: pass
public play/feedback event: pass
cleanup: pass
```

- [ ] **Step 6: Commit any deployment-only fixes discovered through the smoke test using TDD/static regression tests first.**

---

### Task 12: Production cutover and end-to-end verification

**Files:**
- Modify: `.env.production` only after the live app-data smoke test succeeds.
- Modify: Amplify environment variables through AWS Console/CLI while preserving all existing variables.
- No main-branch merge yet.

**Interfaces:**
- Production values:
  - `VITE_EZWAY_API_URL=<verified app-data API>`
  - `VITE_COGNITO_USER_POOL_ID=<verified pool id>`
  - `VITE_COGNITO_USER_POOL_CLIENT_ID=<verified client id>`
  - `VITE_AUDIO_TOOLS_URL=https://3g3dmvsg67.execute-api.us-west-2.amazonaws.com` only after the real Music Intelligence analysis smoke test is also successful.

- [ ] **Step 1: Verify the current Amplify environment variables before mutation** so updating the app does not erase unrelated settings.

- [ ] **Step 2: Add/merge the three app-data public variables** while preserving existing Albumcover and other required variables. Trigger an Amplify rebuild of the feature/cutover target.

- [ ] **Step 3: Sign into production EZ-WAY** using the Cognito admin invitation and complete the new-password challenge.

- [ ] **Step 4: Create brand-new real data through the UI**: profile update, one client, one track upload, one playlist, one share link. Confirm page refresh restores the records from AWS rather than localStorage only.

- [ ] **Step 5: Test public share in a signed-out/private browser**: playback works, no owner login is required, play count increments, approval/revision/comment reaches the owner workspace, and private S3 media remains accessible only through expiring URLs.

- [ ] **Step 6: Test a fresh browser with no localStorage**. It must show the same new AWS records after owner login, proving the cloud database is authoritative.

- [ ] **Step 7: Re-run Music Intelligence live analysis**. Do not call the overall migration complete until both app-data and Audio Tools are green.

- [ ] **Step 8: Run repository verification**

```bash
node --test aws/app-data/api/*.test.mjs
node --experimental-strip-types --test src/services/auth.test.ts src/services/dataStore.test.ts src/services/mediaStoreMigration.test.ts
node --test aws/audio-tools/api/jobContract.test.mjs
python -m unittest discover -s aws/audio-tools/worker -p 'test_*.py' -v
python -m py_compile aws/audio-tools/worker/*.py
cfn-lint aws/app-data/template.yaml aws/audio-tools/template.yaml
bash -n aws/app-data/deploy.sh aws/app-data/smoke-test.sh aws/audio-tools/deploy.sh
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 9: Keep PR #5 Draft until the user explicitly approves merge after these production checks.**

---

## Self-Review Results

- **Spec coverage:** Fresh empty database, PostgreSQL, Data API, S3, Cognito, owner CRUD, public shares, local fallback, Supabase removal, security checks, deployment, and production cutover all map to tasks above.
- **Compatibility gap resolved:** Existing `SharePortal` performs plays, approvals/revisions, and comments. Task 5/9 preserve these through token-scoped public events rather than anonymous owner CRUD.
- **Data API compatibility resolved:** Existing PostgreSQL arrays are represented as JSONB at the persistence layer, avoiding unsupported RDS Data API array parameters while preserving frontend arrays.
- **Migration safety resolved:** `migrate.mjs` uses explicit statement breakpoints because RDS Data API does not support multi-statement `ExecuteStatement` calls.
- **No silent data migration:** no task uploads local/Supabase cache into AWS.
- **Type consistency:** frontend public domain objects retain the existing snake_case fields; stable S3 key fields are internal/additive.
- **Production safety:** app-data variables and Audio Tools variables are not enabled until their respective live smoke tests pass.

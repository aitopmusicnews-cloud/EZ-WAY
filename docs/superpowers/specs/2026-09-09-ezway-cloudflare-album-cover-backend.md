# EZ-WAY Cloudflare Album Cover Backend Design

## Goal

Make `aitopmusicnews-cloud/EZ-WAY` the source-of-truth repository for the Album Cover Studio backend while preserving the existing Album Cover Studio UI and API behavior.

## Architecture

- Add the Album Cover backend as a server-side subproject inside EZ-WAY under `album_cover_backend/`.
- Preserve the existing `/api/generations`, variation, history, metrics, selection, and download contract consumed by `src/services/albumCoverStudio.ts`.
- Keep `src/components/AlbumCoverStudio.tsx` and the current user workflow unchanged.
- Keep `VITE_ALBUM_COVER_API_URL` as a browser-safe base URL only; no provider secrets are exposed through Vite variables.
- Treat the separate `EZ-AI-Album-cover-studio` repository as legacy/non-authoritative after this migration.

## AI responsibilities

- Gemini remains responsible for creative direction, concept generation/ranking, and cover criticism.
- Cloudflare Workers AI renders final images with `@cf/black-forest-labs/flux-1-schnell`.
- Pollinations is not used anywhere in the migrated backend.

## Cloudflare configuration

Server-side environment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_FLUX_MODEL` defaulting to `@cf/black-forest-labs/flux-1-schnell`
- `CLOUDFLARE_FLUX_STEPS` defaulting to `4`
- `CLOUDFLARE_TIMEOUT_SECONDS` defaulting to `150`

The API token must never be committed, placed in `.env.production`, prefixed with `VITE_`, or sent to the browser.

## Migration approach

Reuse the already-tested backend implementation from the prior repository as the migration source, preserving its behavior rather than rewriting it. Copy the backend application, tests, and required deployment/runtime files into `album_cover_backend/`, then make EZ-WAY the repository used for subsequent Album Cover backend changes and deployment.

## Testing

Use test-driven verification around the Cloudflare renderer. Tests must verify:

- the Cloudflare Workers AI account endpoint and Bearer authentication;
- the Schnell model and steps payload;
- base64 image decoding;
- no Pollinations references in the migrated provider path;
- existing backend tests still pass;
- EZ-WAY frontend tests/build remain unaffected.

## Deployment

Keep the public Album Cover API contract stable. The current browser URL can remain `https://albumcover-api.theartistcut.com` if the backend deployment behind that hostname is repointed to the EZ-WAY repository/subproject. Deployment secrets are configured only in the backend hosting environment.

## Non-goals

- No Album Cover Studio redesign.
- No change to the 3–5 variation workflow, history, metrics, selection, or download behavior.
- No Cloudflare token in frontend code.
- No Pollinations fallback.
- No unrelated EZ-WAY refactors.

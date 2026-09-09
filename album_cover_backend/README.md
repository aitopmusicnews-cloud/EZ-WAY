# EZ-WAY Album Cover Backend

This directory is the server-side Album Cover Studio backend for EZ-WAY. EZ-WAY is the source-of-truth repository for this service.

## Responsibilities

The backend preserves the Album Cover Studio API consumed by `src/services/albumCoverStudio.ts`, including generation, regeneration/improvement, variation selection/download, history, and metrics.

AI responsibilities are intentionally split:

- Gemini: creative direction, concept generation/ranking, and cover criticism.
- Cloudflare Workers AI: final image rendering with `@cf/black-forest-labs/flux-1-schnell`.
- Pollinations: not used by the Album Cover backend.

The backend is API-only in EZ-WAY. The user interface remains `src/components/AlbumCoverStudio.tsx` in the main React application.

## Server configuration

Configure these values only in the backend hosting environment:

```text
CLOUDFLARE_ACCOUNT_ID=<account id>
CLOUDFLARE_API_TOKEN=<secret Workers AI token>
CLOUDFLARE_FLUX_MODEL=@cf/black-forest-labs/flux-1-schnell
CLOUDFLARE_FLUX_STEPS=4
CLOUDFLARE_TIMEOUT_SECONDS=150
GEMINI_API_KEY=<server-side Gemini key>
```

Never put `CLOUDFLARE_API_TOKEN` in `.env.production`, a `VITE_*` variable, frontend source, or GitHub source control.

## Local verification

From the repository root:

```bash
python -m pip install -r album_cover_backend/requirements.txt
cd album_cover_backend
python -m compileall -q app
python -m pytest -q tests/test_flux_image_renderer.py
python -m pytest -q tests
```

The Cloudflare regression test verifies the Workers AI account endpoint, Bearer authentication, FLUX.1 Schnell model, four-step payload, base64 decoding, and absence of Pollinations in the provider implementation.

## Run locally

From `album_cover_backend/`:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Use server-side environment variables or an uncommitted local `.env`. The backend health endpoint is `/health`.

## Production

The public API hostname can remain `https://albumcover-api.theartistcut.com`, provided the service behind that hostname deploys this `album_cover_backend/` directory from EZ-WAY.

The browser should only receive the API base URL through `VITE_ALBUM_COVER_API_URL`; provider credentials never belong in the browser build.

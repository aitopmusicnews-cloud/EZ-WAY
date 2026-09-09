# EZ-WAY Cloudflare Album Cover Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing Album Cover Studio backend implementation into `aitopmusicnews-cloud/EZ-WAY`, preserve the current browser API contract and UI, and use Cloudflare Workers AI FLUX.1 Schnell for final cover rendering.

**Architecture:** Add a self-contained Python backend under `album_cover_backend/` by migrating the already-tested standalone backend implementation. `src/services/albumCoverStudio.ts` continues to call the same public Album Cover API contract through `VITE_ALBUM_COVER_API_URL`; provider secrets remain server-side. Gemini keeps creative direction, concept ranking, and critique, while `CloudflareFluxImageClient` is the sole default final image renderer.

**Tech Stack:** Python 3, FastAPI, httpx, pytest, Gemini API, Cloudflare Workers AI REST API, React/Vite frontend integration.

**Spec:** `docs/superpowers/specs/2026-09-09-ezway-cloudflare-album-cover-backend.md`

## Global Constraints

- EZ-WAY is the source-of-truth repository for Album Cover backend changes after this migration.
- Keep `src/components/AlbumCoverStudio.tsx` and the existing 3–5 variation workflow unchanged.
- Preserve the existing Album Cover API contract consumed by `src/services/albumCoverStudio.ts`.
- Keep `VITE_ALBUM_COVER_API_URL` browser-safe; never expose provider secrets in Vite variables or browser code.
- Gemini remains responsible for creative direction, concept generation/ranking, and cover criticism.
- Cloudflare Workers AI model `@cf/black-forest-labs/flux-1-schnell` renders final images.
- Pollinations must not be used anywhere in the migrated provider path.
- Server-side Cloudflare variables are `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_FLUX_MODEL`, `CLOUDFLARE_FLUX_STEPS`, and `CLOUDFLARE_TIMEOUT_SECONDS`.
- Default `CLOUDFLARE_FLUX_STEPS` is `4`; accepted range is 1–8.
- No unrelated EZ-WAY refactors.

---

### Task 1: Renderer contract
- [ ] Create `album_cover_backend/tests/test_flux_image_renderer.py` before production code.
- [ ] Assert the Cloudflare account endpoint, Bearer auth, Schnell model, steps=4, base64 decoding, `cf-ray`, and no Pollinations provider path.
- [ ] Run `python -m pytest -q album_cover_backend/tests/test_flux_image_renderer.py` and verify RED because the renderer module is absent.

### Task 2: Backend migration
- [ ] Migrate the standalone backend runtime modules and tests under `album_cover_backend/` without changing public routes or response shapes.
- [ ] Keep `CloudflareFluxImageClient` as the default final renderer with `@cf/black-forest-labs/flux-1-schnell`.
- [ ] Keep Gemini creative director, ranker, and critic behavior unchanged.
- [ ] Add server-only Cloudflare configuration and steps validation 1–8.
- [ ] Run the renderer test to GREEN, then run `python -m pytest -q album_cover_backend/tests`.

### Task 3: Repository/deployment docs
- [ ] Update the older Album Cover integration spec to make `album_cover_backend/` in EZ-WAY authoritative.
- [ ] Add `album_cover_backend/README.md` documenting server-only secrets and public API deployment.
- [ ] Update `DEPLOYMENT_GUIDE.md` without changing unrelated deployment instructions.

### Task 4: Frontend compatibility verification
- [ ] Run `npm test -- --run src/services/albumCoverIntegration.test.ts`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Verify no Cloudflare secrets are present in frontend/Vite files and no Album Cover Pollinations provider path remains.

### Task 5: Review and PR
- [ ] Compare the feature branch against `main` and confirm no unrelated UI changes.
- [ ] Re-run backend and frontend verification.
- [ ] Open PR `Move Cloudflare Album Cover backend into EZ-WAY` documenting unchanged UI/API contract, unchanged Gemini responsibilities, Cloudflare FLUX.1 Schnell final rendering, no Pollinations, and remaining production secret configuration.

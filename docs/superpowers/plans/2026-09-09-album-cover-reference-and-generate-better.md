# Album Cover Artist Reference and Generate Better Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional artist/character reference guidance through Cloudflare Gemma vision and make Generate Better refine the exact cover the user selected rather than an AI-picked winner.

**Architecture:** Store a validated user-provided reference image, analyze it once into a compact Artist Visual Bible with Gemma vision, and inject only relevant visible appearance/style descriptors into artist-present concepts and FLUX production briefs. Generate Better receives an explicit source variation id, retrieves its concept/render/critic context, preserves that direction by default, and never chooses a source cover for the user.

**Tech Stack:** Python 3.12, FastAPI multipart uploads, SQLAlchemy, Pillow, httpx, Cloudflare Workers AI Gemma 4 vision, React 18, TypeScript, Vite, pytest.

**Spec:** `docs/superpowers/specs/2026-09-09-album-cover-major-label-creative-director-design.md`

## Global Constraints

- Reference upload is optional.
- FLUX.1 Schnell remains the production renderer and does not provide guaranteed image-reference identity locking.
- UI copy must say the reference guides appearance/styling and exact facial identity may vary.
- Do not perform biometric identification or sensitive-attribute inference.
- User Strict Creative Controls outrank the Visual Bible.
- Generate Better requires an explicit user-selected source variation.
- Generate Better preserves the chosen concept/direction unless the user explicitly requests a new direction.
- No automatic AI winner/source selection.
- No OpenAI, Gemini, or Pollinations fallback.

---

### Task 1: Reference-image validation, storage, and cache identity

**Files:**
- Modify: `album_cover_backend/app/validation.py`
- Modify: `album_cover_backend/app/storage.py`
- Modify: `album_cover_backend/app/models.py`
- Modify: `album_cover_backend/app/service.py`
- Modify: `album_cover_backend/app/routers/generations.py`
- Create: `album_cover_backend/alembic/versions/20260909_06_artist_reference.py`
- Test: `album_cover_backend/tests/test_reference_upload.py`
- Test: `album_cover_backend/tests/test_cache.py`

**Interfaces:**
- Produces: `read_validated_reference_image(upload, max_bytes) -> tuple[bytes, str] | None`.
- Generation fields: `reference_image_path`, `reference_image_hash`, `reference_type`, `artist_visual_bible_json`.
- Reference types: `artist`, `character`, `style`.

- [ ] **Step 1: Write failing validation test**

```python
import pytest
from fastapi import HTTPException
from app.validation import validate_reference_image_bytes


def test_reference_validation_accepts_png_and_rejects_non_image():
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    assert validate_reference_image_bytes(png, "image/png") == "image/png"
    with pytest.raises(HTTPException):
        validate_reference_image_bytes(b"not-an-image", "text/plain")
```

Use a valid in-memory Pillow PNG fixture if the validator decodes the complete image instead of checking signatures.

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_reference_upload.py::test_reference_validation_accepts_png_and_rejects_non_image`

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement bounded image validation**

Allow JPEG, PNG, and WebP. Decode with Pillow, verify dimensions are at least 256x256 and at most 8192x8192, reject animated/multi-frame input for phase one, cap upload size using a new `MAX_REFERENCE_IMAGE_MB` setting defaulting to 12.

- [ ] **Step 4: Add secure storage path**

Create `LocalStorage.save_reference(generation_id, content, mime_type)` under a generation-scoped `references/` directory. Return only a relative server path; never expose it directly in API responses.

- [ ] **Step 5: Add persistent fields and migration**

```python
reference_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
reference_image_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
reference_type: Mapped[str | None] = mapped_column(String(24), nullable=True)
artist_visual_bible_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
```

- [ ] **Step 6: Add multipart fields to initial generation route**

Accept `reference_image: UploadFile | None` and `reference_type: Literal["artist", "character", "style"] | None`. Save reference before background generation starts.

- [ ] **Step 7: Include reference hash/type in cache identity**

Two otherwise identical generations with different reference images or different reference types must not share the same expensive artwork cache entry.

- [ ] **Step 8: Run upload/cache tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_reference_upload.py tests/test_cache.py`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add album_cover_backend/app/validation.py album_cover_backend/app/storage.py album_cover_backend/app/models.py album_cover_backend/app/service.py album_cover_backend/app/routers/generations.py album_cover_backend/alembic/versions/20260909_06_artist_reference.py album_cover_backend/tests/test_reference_upload.py album_cover_backend/tests/test_cache.py
git commit -m "feat: add album cover reference image storage"
```

---

### Task 2: Gemma vision Artist Visual Bible

**Files:**
- Create: `album_cover_backend/app/artist_visual_bible.py`
- Modify: `album_cover_backend/app/cloudflare_creative_director.py`
- Modify: `album_cover_backend/app/creative_direction.py`
- Test: `album_cover_backend/tests/test_artist_visual_bible.py`

**Interfaces:**
- Produces: `ArtistVisualBible` dataclass.
- Produces: `CloudflareGemmaCreativeDirector.analyze_reference(*, image_bytes, mime_type, reference_type) -> ArtistVisualBible`.

- [ ] **Step 1: Write failing Visual Bible parse test**

```python
import httpx
import pytest
from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector


@pytest.mark.asyncio
async def test_reference_analysis_returns_visible_creative_descriptors_only():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"result": {"response": '{"reference_type":"artist","appearance":{"skin_tone":"deep brown","hair":"long black braids","facial_hair":"none","distinctive_features":["round gold glasses"],"apparent_age_range":"adult"},"wardrobe_language":["tailored black suit"],"accessories":["gold glasses"],"attitude":["composed"],"visual_identity":["clean editorial tailoring"],"do_not_change":["long black braids","round gold glasses"],"uncertainties":[]}'}})

    director = CloudflareGemmaCreativeDirector(
        account_id="acct", api_token="token", transport=httpx.MockTransport(handler)
    )
    bible = await director.analyze_reference(
        image_bytes=b"image", mime_type="image/jpeg", reference_type="artist"
    )
    assert bible.appearance["hair"] == "long black braids"
    assert "religion" not in bible.model_dump_json().lower()
```

If `ArtistVisualBible` is a dataclass, use `asdict(bible)` instead of `model_dump_json()`.

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_artist_visual_bible.py::test_reference_analysis_returns_visible_creative_descriptors_only`

Expected: FAIL because reference analysis is not implemented.

- [ ] **Step 3: Define schema**

```python
@dataclass(slots=True)
class ArtistVisualBible:
    reference_type: str
    appearance: dict[str, Any]
    wardrobe_language: list[str]
    accessories: list[str]
    attitude: list[str]
    visual_identity: list[str]
    do_not_change: list[str]
    uncertainties: list[str]
```

The system prompt must explicitly prohibit guessing identity, name, ethnicity, religion, sexual orientation, health status, political affiliation, or other sensitive attributes. It may describe visible skin tone, hair, facial hair, clothing, accessories, apparent adult/child age range only when necessary for visual consistency, posture, and style.

- [ ] **Step 4: Implement Gemma multimodal request**

Use the exact Cloudflare model request shape documented for Gemma 4 vision at implementation time. Send the reference image as the model's supported image input and request strict JSON matching `ArtistVisualBible`.

- [ ] **Step 5: Persist the Visual Bible**

After reference upload validation, analyze once before concept generation and store `artist_visual_bible_json`. Reuse it for Fresh Set and Generate Better instead of re-analyzing the image unless the reference changes.

- [ ] **Step 6: Run Visual Bible tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_artist_visual_bible.py tests/test_cloudflare_creative_director.py`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add album_cover_backend/app/artist_visual_bible.py album_cover_backend/app/cloudflare_creative_director.py album_cover_backend/app/creative_direction.py album_cover_backend/tests/test_artist_visual_bible.py
git commit -m "feat: analyze artist references with Gemma vision"
```

---

### Task 3: Apply Visual Bible only to artist-present concepts and FLUX briefs

**Files:**
- Modify: `album_cover_backend/app/song_intelligence.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Modify: `album_cover_backend/app/render_prompts.py`
- Test: `album_cover_backend/tests/test_reference_prompting.py`

**Interfaces:**
- `build_production_brief(..., visual_bible: dict[str, Any] | None)` from the core plan.
- `artist_presence` controls whether reference descriptors are injected.

- [ ] **Step 1: Write failing artist-presence test**

```python
from app.render_prompts import build_production_brief


def test_visual_bible_is_used_for_artist_concept_but_not_no_person_concept():
    bible = {"appearance": {"hair": "long black braids"}, "do_not_change": ["round gold glasses"]}
    artist_prompt = build_production_brief(
        concept={"artist_presence":"hero","subject":"artist standing alone","setting":"studio","camera":"50mm","composition":"centered","lighting":"soft","medium":"photo","texture":"grain","palette":"black","must_include":[],"avoid":[],"image_prompt_seed":""},
        creative_controls={}, visual_bible=bible, render_index=1,
    )
    object_prompt = build_production_brief(
        concept={"artist_presence":"none","subject":"empty chair","setting":"studio","camera":"50mm","composition":"centered","lighting":"soft","medium":"photo","texture":"grain","palette":"black","must_include":[],"avoid":[],"image_prompt_seed":""},
        creative_controls={}, visual_bible=bible, render_index=1,
    )
    assert "long black braids" in artist_prompt
    assert "long black braids" not in object_prompt
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_reference_prompting.py::test_visual_bible_is_used_for_artist_concept_but_not_no_person_concept`

Expected: FAIL until reference descriptors are conditionally injected.

- [ ] **Step 3: Add compact descriptor builder**

Create `compact_reference_guide(bible)` that keeps `do_not_change`, hair, visible distinctive features, wardrobe language, and accessories first; cap the reference block so Strict user controls plus no-text instructions still fit inside the 2048-character production brief.

- [ ] **Step 4: Add director context**

Pass the full Visual Bible to concept creation/critique so the director knows the artist identity guide, but allow `artist_presence='none'` when user controls do not require the artist.

- [ ] **Step 5: Run reference prompt tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_reference_prompting.py tests/test_render_prompts.py tests/test_major_label_pipeline.py`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add album_cover_backend/app/song_intelligence.py album_cover_backend/app/major_label_service.py album_cover_backend/app/render_prompts.py album_cover_backend/tests/test_reference_prompting.py
git commit -m "feat: carry artist visual bible into cover direction"
```

---

### Task 4: Make Generate Better require the user's source cover

**Files:**
- Modify: `album_cover_backend/app/schemas.py`
- Modify: `album_cover_backend/app/routers/generations.py`
- Modify: `album_cover_backend/app/feedback_generation_service.py`
- Modify: `album_cover_backend/app/improvement_feedback.py`
- Test: `album_cover_backend/tests/test_generate_better.py`

**Interfaces:**
- New schema: `ImproveRequest(CreativeControls)` with required `source_variation_id: str`.
- `FeedbackDrivenGenerationService.generate_better(generation_id, source_variation_id, variation_count=6, mood_path='blend', creative_controls=None)`.

- [ ] **Step 1: Write failing API requirement test**

```python
def test_generate_better_requires_source_variation(client, generation_id):
    response = client.post(
        f"/api/generations/{generation_id}/improve",
        json={"mood_path":"blend","variation_count":6,"run_async":False},
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_generate_better.py::test_generate_better_requires_source_variation`

Expected: FAIL because the current request schema has no source variation id.

- [ ] **Step 3: Add `ImproveRequest`**

```python
class ImproveRequest(CreativeControls):
    source_variation_id: str
    mood_path: Literal["blend", "audio", "lyrics"] = "blend"
    variation_count: int = Field(default=6, ge=6, le=6)
    run_async: bool = True
```

Use this schema only for `/improve`; retain the regular regenerate schema for fresh directions.

- [ ] **Step 4: Resolve the exact user-selected source**

`generate_better()` must load the requested `Variation`, verify it belongs to the target generation, retrieve its `ConceptCandidate`, render prompt, critic feedback, and source variation-set context. If it does not belong to the generation, return 404 or 409 and spend no render calls.

- [ ] **Step 5: Build explicit improvement context**

`build_improvement_context(source_variation, source_concept)` returns structured fields:

```python
{
    "preserve": [source_concept.subject, source_concept.visual_metaphor, source_concept.medium],
    "fix": source_variation.cover_feedback_json or {},
    "source_render_prompt": source_variation.render_prompt,
    "source_concept_id": source_concept.id,
}
```

The Creative Director is instructed to preserve the central idea unless current user controls request a new direction.

- [ ] **Step 6: Remove `_latest_scored_set()` source selection**

Delete the logic that chooses a source set/variation from `ai_winner_variation_id` or critic scores. Generate Better must never infer the source cover.

- [ ] **Step 7: Run Generate Better tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_generate_better.py tests/test_pipeline.py`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add album_cover_backend/app/schemas.py album_cover_backend/app/routers/generations.py album_cover_backend/app/feedback_generation_service.py album_cover_backend/app/improvement_feedback.py album_cover_backend/tests/test_generate_better.py
git commit -m "feat: refine the user-selected cover direction"
```

---

### Task 5: Frontend reference upload and explicit Generate Better source

**Files:**
- Modify: `src/services/albumCoverStudio.ts`
- Modify: `src/components/AlbumCoverStudio.tsx`
- Modify: `src/services/albumCoverIntegration.test.ts`

**Interfaces:**
- `AlbumCoverSourceInput.referenceImage?: File | null`.
- `AlbumCoverSourceInput.referenceType?: 'artist' | 'character' | 'style'`.
- `generateBetterAlbumCovers(generationId, sourceVariationId, moodPath, variationCount, creativeControls)`.

- [ ] **Step 1: Write failing integration assertions**

Add assertions for the reference upload label, the exact caution copy `Exact facial identity may vary with the current renderer.`, and a `source_variation_id` field in Generate Better transport.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts`

Expected: FAIL because reference upload and explicit source id are not implemented.

- [ ] **Step 3: Add reference fields to initial generation transport**

When present:

```ts
form.set('reference_image', source.referenceImage);
form.set('reference_type', source.referenceType || 'artist');
```

Do not send the reference image in regenerate/improve JSON; the backend reuses the stored generation reference.

- [ ] **Step 4: Add reference UI**

Add one optional image upload with type selector Artist / Character / Style. Show thumbnail preview locally. Show this copy directly under it:

```text
Reference guide — helps the Creative Director keep appearance and styling consistent. Exact facial identity may vary with the current renderer.
```

- [ ] **Step 5: Require a selected cover before Generate Better**

Disable Generate Better when `selectedVariationId` is empty. On click, send that exact id as `source_variation_id`. Do not fall back to the first cover, highest score, or previous backend-selected variation.

- [ ] **Step 6: Run frontend gates**

Run:

```bash
node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/services/albumCoverStudio.ts src/components/AlbumCoverStudio.tsx src/services/albumCoverIntegration.test.ts
git commit -m "feat: add reference guidance and selected-cover refinement"
```

---

### Task 6: Reference and refinement verification gate

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd album_cover_backend
python -m pytest -q tests/test_reference_upload.py tests/test_artist_visual_bible.py tests/test_reference_prompting.py tests/test_generate_better.py
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Run full backend suite**

Run: `cd album_cover_backend && python -m pytest -q`

Expected: PASS.

- [ ] **Step 3: Run frontend integration/lint/build**

Run:

```bash
node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Provider isolation check**

Run:

```bash
! grep -R "OPENAI_API_KEY\|POLLINATIONS" album_cover_backend/app src/services/albumCoverStudio.ts src/components/AlbumCoverStudio.tsx
```

Expected: exit 0.

- [ ] **Step 5: User-choice source check**

Run:

```bash
! grep -R "ai_winner_variation_id" album_cover_backend/app/feedback_generation_service.py src/components/AlbumCoverStudio.tsx
```

Expected: exit 0.

- [ ] **Step 6: Review diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional files changed.

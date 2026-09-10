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
- Do not perform biometric identification or infer sensitive traits such as ethnicity, religion, health, political affiliation, or sexual orientation.
- User Strict Creative Controls outrank the Visual Bible.
- Generate Better requires an explicit user-selected source variation.
- Generate Better preserves the chosen concept/direction unless the user explicitly requests a new direction.
- No automatic AI winner/source selection.
- No OpenAI, Gemini, or Pollinations fallback.
- Cloudflare Gemma 4 model: `@cf/google/gemma-4-26b-a4b-it`.

---

### Task 1: Reference-image validation, storage, and cache identity

**Files:**
- Modify: `album_cover_backend/app/config.py`
- Modify: `album_cover_backend/app/validation.py`
- Modify: `album_cover_backend/app/storage.py`
- Modify: `album_cover_backend/app/models.py`
- Modify: `album_cover_backend/app/service.py`
- Modify: `album_cover_backend/app/routers/generations.py`
- Create: `album_cover_backend/alembic/versions/20260909_06_artist_reference.py`
- Test: `album_cover_backend/tests/test_reference_upload.py`
- Test: `album_cover_backend/tests/test_cache.py`

**Interfaces:**
- Produces: `validate_reference_image_bytes(content: bytes, mime_type: str) -> str`.
- Produces: `read_validated_reference_image(upload: UploadFile | None, max_bytes: int) -> tuple[bytes, str] | None`.
- Generation fields: `reference_image_path`, `reference_image_hash`, `reference_type`, `artist_visual_bible_json`.
- Reference types: `artist`, `character`, `style`.

- [ ] **Step 1: Write failing validation test with a real PNG**

```python
from io import BytesIO
from PIL import Image
import pytest
from fastapi import HTTPException
from app.validation import validate_reference_image_bytes


def png_bytes(width=512, height=512):
    buffer = BytesIO()
    Image.new("RGB", (width, height), (30, 40, 50)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_reference_validation_accepts_png_and_rejects_non_image():
    assert validate_reference_image_bytes(png_bytes(), "image/png") == "image/png"
    with pytest.raises(HTTPException):
        validate_reference_image_bytes(b"not-an-image", "text/plain")
```

- [ ] **Step 2: Run test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_reference_upload.py::test_reference_validation_accepts_png_and_rejects_non_image`

Expected: FAIL because `validate_reference_image_bytes` does not exist.

- [ ] **Step 3: Implement bounded image validation**

Add `MAX_REFERENCE_IMAGE_MB` to `Settings`, default `12`. Allow JPEG, PNG, and WebP. Decode with Pillow, call `image.verify()`, reopen to inspect size, require width and height between 256 and 8192 pixels, reject multi-frame input, and return the normalized MIME type.

- [ ] **Step 4: Add secure storage path**

Implement `LocalStorage.save_reference(generation_id, content, mime_type)` under `references/<generation_id>/reference.<ext>`. Return a relative server path only. Do not expose that path in `GenerationResponse`.

- [ ] **Step 5: Add persistent fields and migration**

```python
reference_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
reference_image_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
reference_type: Mapped[str | None] = mapped_column(String(24), nullable=True)
artist_visual_bible_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
```

Migration `20260909_06_artist_reference.py` adds exactly those four nullable columns and the hash index.

- [ ] **Step 6: Add multipart fields to initial generation route**

Add:

```python
reference_image: UploadFile | None = File(default=None)
reference_type: str | None = Form(default=None, pattern="^(artist|character|style)$")
```

Validate/save the reference before background generation starts. Store `sha256(reference_bytes).hexdigest()` as `reference_image_hash`.

- [ ] **Step 7: Include reference hash/type in cache identity**

Extend the generation input hash payload with:

```python
{
    "reference_image_hash": reference_image_hash or "",
    "reference_type": reference_type or "",
}
```

Two otherwise identical generations with different reference images or types must not share an artwork cache entry.

- [ ] **Step 8: Run upload/cache tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_reference_upload.py tests/test_cache.py`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add album_cover_backend/app/config.py album_cover_backend/app/validation.py album_cover_backend/app/storage.py album_cover_backend/app/models.py album_cover_backend/app/service.py album_cover_backend/app/routers/generations.py album_cover_backend/alembic/versions/20260909_06_artist_reference.py album_cover_backend/tests/test_reference_upload.py album_cover_backend/tests/test_cache.py
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
- Produces: `CloudflareGemmaCreativeDirector.analyze_reference(*, image_bytes: bytes, mime_type: str, reference_type: str) -> ArtistVisualBible`.

- [ ] **Step 1: Write failing request/parse test**

```python
import base64
from dataclasses import asdict
import httpx
import pytest
from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector


@pytest.mark.asyncio
async def test_reference_analysis_sends_image_and_returns_visible_descriptors():
    seen = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.json())
        return httpx.Response(200, json={
            "result": {
                "response": '{"reference_type":"artist","appearance":{"skin_tone":"deep brown","hair":"long black braids","facial_hair":"none","distinctive_features":["round gold glasses"],"apparent_age_range":"adult"},"wardrobe_language":["tailored black suit"],"accessories":["gold glasses"],"attitude":["composed"],"visual_identity":["clean editorial tailoring"],"do_not_change":["long black braids","round gold glasses"],"uncertainties":[]}'
            }
        })

    director = CloudflareGemmaCreativeDirector(
        account_id="acct",
        api_token="token",
        transport=httpx.MockTransport(handler),
    )
    bible = await director.analyze_reference(
        image_bytes=b"image-bytes",
        mime_type="image/jpeg",
        reference_type="artist",
    )
    assert seen["image"].startswith("data:image/jpeg;base64,")
    assert seen["messages"][0]["role"] == "system"
    assert bible.appearance["hair"] == "long black braids"
    assert "religion" not in str(asdict(bible)).lower()
```

- [ ] **Step 2: Run test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_artist_visual_bible.py::test_reference_analysis_sends_image_and_returns_visible_descriptors`

Expected: FAIL because reference analysis is not implemented.

- [ ] **Step 3: Define the exact Visual Bible schema**

```python
from dataclasses import dataclass
from typing import Any


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

- [ ] **Step 4: Implement the Workers AI multimodal REST payload**

Cloudflare's current Workers AI vision pattern sends `messages` plus a top-level image data URI. Build:

```python
image_data_uri = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
payload = {
    "messages": [
        {
            "role": "system",
            "content": (
                "Analyze only visible creative appearance and styling. Do not identify the person and do not infer ethnicity, religion, health, political affiliation, sexual orientation, or other sensitive traits. Return JSON only."
            ),
        },
        {
            "role": "user",
            "content": f"Build an Artist Visual Bible for reference_type={reference_type} using the required schema.",
        },
    ],
    "image": image_data_uri,
    "temperature": 0.2,
    "max_completion_tokens": 1800,
}
```

POST to:

```python
f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"
```

with the existing bearer token header. Parse `result.response` into `ArtistVisualBible`. Reject malformed JSON as a typed Creative Director service error.

- [ ] **Step 5: Persist and reuse the Visual Bible**

Analyze once before concept generation when `reference_image_path` exists and `artist_visual_bible_json` is empty. Store `asdict(bible)`. Fresh Set and Generate Better reuse the stored JSON. Reanalyze only when `reference_image_hash` changes.

- [ ] **Step 6: Run Visual Bible tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_artist_visual_bible.py tests/test_cloudflare_creative_director.py`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add album_cover_backend/app/artist_visual_bible.py album_cover_backend/app/cloudflare_creative_director.py album_cover_backend/app/creative_direction.py album_cover_backend/tests/test_artist_visual_bible.py
git commit -m "feat: analyze artist references with Gemma vision"
```

---

### Task 3: Apply the Visual Bible only to artist-present concepts and FLUX briefs

**Files:**
- Modify: `album_cover_backend/app/song_intelligence.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Modify: `album_cover_backend/app/render_prompts.py`
- Test: `album_cover_backend/tests/test_reference_prompting.py`

**Interfaces:**
- Consumes: `build_production_brief(..., visual_bible: dict[str, Any] | None)` from the core plan.
- `artist_presence` controls whether reference descriptors are injected.

- [ ] **Step 1: Write failing artist-presence test**

```python
from app.render_prompts import build_production_brief


def concept(artist_presence, subject):
    return {
        "artist_presence": artist_presence,
        "subject": subject,
        "setting": "studio",
        "camera": "50mm",
        "composition": "centered",
        "lighting": "soft",
        "medium": "photo",
        "texture": "grain",
        "palette": "black",
        "must_include": [],
        "avoid": [],
        "image_prompt_seed": "",
    }


def test_visual_bible_is_used_only_for_artist_present_concepts():
    bible = {
        "appearance": {"hair": "long black braids"},
        "do_not_change": ["round gold glasses"],
    }
    artist_prompt = build_production_brief(
        concept=concept("hero", "artist standing alone"),
        creative_controls={},
        visual_bible=bible,
        render_index=1,
    )
    object_prompt = build_production_brief(
        concept=concept("none", "empty chair"),
        creative_controls={},
        visual_bible=bible,
        render_index=1,
    )
    assert "long black braids" in artist_prompt
    assert "round gold glasses" in artist_prompt
    assert "long black braids" not in object_prompt
```

- [ ] **Step 2: Run test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_reference_prompting.py::test_visual_bible_is_used_only_for_artist_present_concepts`

Expected: FAIL until reference descriptors are conditionally injected.

- [ ] **Step 3: Add compact descriptor builder**

Implement `compact_reference_guide(bible: dict[str, Any]) -> str` in `render_prompts.py`. Priority order is `do_not_change`, hair, distinctive features, wardrobe language, accessories. Cap this block at 420 characters so Strict controls and the no-text block remain protected inside the 2048-character prompt.

- [ ] **Step 4: Add director context**

Pass the full Visual Bible to concept creation and critique. The director may choose `artist_presence='none'` when user controls do not require the artist. When artist presence is `hero`, `partial`, `silhouette`, or `symbolic`, the concept must not contradict `do_not_change` descriptors.

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
- Produces: `ImproveRequest(CreativeControls)` with required `source_variation_id: str`.
- Produces: `FeedbackDrivenGenerationService.generate_better(generation_id, source_variation_id, variation_count=6, mood_path="blend", creative_controls=None)`.

- [ ] **Step 1: Write failing API requirement test**

```python
def test_generate_better_requires_source_variation(client, generation_id):
    response = client.post(
        f"/api/generations/{generation_id}/improve",
        json={"mood_path": "blend", "variation_count": 6, "run_async": False},
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run test and verify RED**

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

Use this schema only for `/improve`; retain `RegenerateRequest` for fresh directions.

- [ ] **Step 4: Resolve the exact user-selected source**

Load the requested `Variation`, join through its `VariationSet`, verify `variation_set.generation_id == generation_id`, then load its `ConceptCandidate`. If ownership fails, return HTTP 409 and do not call the Creative Director or FLUX.

- [ ] **Step 5: Build explicit improvement context**

```python
def build_improvement_context(source_variation, source_concept):
    return {
        "preserve": [
            source_concept.subject,
            source_concept.visual_metaphor,
            source_concept.medium,
        ],
        "fix": source_variation.cover_feedback_json or {},
        "source_render_prompt": source_variation.render_prompt or "",
        "source_concept_id": source_concept.id,
    }
```

The Creative Director prompt must say: preserve the central concept unless current Strict controls explicitly request a new subject, scene, or direction.

- [ ] **Step 6: Remove automatic source selection**

Delete `_latest_scored_set()` and all `ai_winner_variation_id`/critic-score source selection from `FeedbackDrivenGenerationService.generate_better()`.

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
- `AlbumCoverSourceInput.referenceType?: "artist" | "character" | "style"`.
- `generateBetterAlbumCovers(generationId, sourceVariationId, moodPath, variationCount, creativeControls)`.

- [ ] **Step 1: Write failing integration assertions**

Add:

```ts
assert.match(studioSource, /Reference guide/);
assert.match(studioSource, /Exact facial identity may vary with the current renderer/);
assert.match(serviceSource, /source_variation_id/);
assert.match(serviceSource, /reference_image/);
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts`

Expected: FAIL because reference upload and explicit source id are not implemented.

- [ ] **Step 3: Add reference fields to initial generation transport**

```ts
if (source.referenceImage) {
  form.set('reference_image', source.referenceImage);
  form.set('reference_type', source.referenceType || 'artist');
}
```

Do not resend the image in regenerate/improve JSON; the backend reuses the stored generation reference.

- [ ] **Step 4: Add reference UI**

Add one optional image upload with type selector Artist / Character / Style and local thumbnail preview. Display exactly:

```text
Reference guide — helps the Creative Director keep appearance and styling consistent. Exact facial identity may vary with the current renderer.
```

- [ ] **Step 5: Require a selected cover before Generate Better**

Disable Generate Better while `selectedVariationId === ""`. On click send:

```ts
body: JSON.stringify({
  source_variation_id: selectedVariationId,
  mood_path: moodPath,
  variation_count: 6,
  run_async: true,
  ...creativeControlPayload(creativeControls),
})
```

Never fall back to the first cover, highest score, or prior backend winner.

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

```bash
cd album_cover_backend
python -m pytest -q tests/test_reference_upload.py tests/test_artist_visual_bible.py tests/test_reference_prompting.py tests/test_generate_better.py
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Run full backend suite**

Run: `cd album_cover_backend && python -m pytest -q`

Expected: PASS.

- [ ] **Step 3: Run frontend integration/lint/build**

```bash
node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Provider isolation check**

```bash
! grep -R "OPENAI_API_KEY\|POLLINATIONS" album_cover_backend/app src/services/albumCoverStudio.ts src/components/AlbumCoverStudio.tsx
```

Expected: exit 0.

- [ ] **Step 5: User-choice source check**

```bash
! grep -R "ai_winner_variation_id" album_cover_backend/app/feedback_generation_service.py src/components/AlbumCoverStudio.tsx
```

Expected: exit 0.

- [ ] **Step 6: Diff sanity**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional files changed.

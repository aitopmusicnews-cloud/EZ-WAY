# Album Cover Text Integrity and Six-Choice UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee title/artist/advisory are composited exactly once, make advisory manual-only, add independent title/artist controls, preserve raw artwork for recomposition, and present six covers equally with no AI winner.

**Architecture:** Split raw FLUX artwork from final composited cover output. Store typography/advisory settings at generation level, expose recomposition through the existing generation API, and make the frontend treat all six successful renders equally until the user explicitly selects one.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Pillow, React 18, TypeScript, Vite, Node test runner, pytest.

**Spec:** `docs/superpowers/specs/2026-09-09-album-cover-major-label-creative-director-design.md`

## Global Constraints

- FLUX artwork prompt must explicitly forbid title, artist lettering, logos, typography, watermarks, and Parental Advisory.
- Title is composited at most once.
- Artist is composited at most once when enabled.
- Parental Advisory defaults Off and cannot be auto-enabled by lyrics, genre, analysis, or Creative Director output.
- Six surviving covers have equal visual emphasis.
- No AI winner, best, recommended, preselected, or score-based ordering in the user-facing results UI.
- User selection remains explicit.
- Typography-only changes must not require another FLUX render when raw artwork exists.

---

### Task 1: Typed release-text settings with manual advisory

**Files:**
- Modify: `album_cover_backend/app/schemas.py`
- Modify: `album_cover_backend/app/models.py`
- Modify: `album_cover_backend/app/routers/generations.py`
- Create: `album_cover_backend/alembic/versions/20260909_04_release_text_controls.py`
- Test: `album_cover_backend/tests/test_release_text_controls.py`

**Interfaces:**
- Produces: `ReleaseTextSettings` Pydantic model.
- Produces generation fields: `show_title`, `show_artist`, `title_style_json`, `artist_style_json`, `advisory_style_json`.

- [ ] **Step 1: Write failing schema/default test**

```python
from app.schemas import ReleaseTextSettings


def test_release_text_defaults_keep_advisory_off():
    settings = ReleaseTextSettings()
    assert settings.show_title is True
    assert settings.show_artist is True
    assert settings.parental_advisory is False
    assert settings.title.position == "top"
    assert settings.artist.position == "bottom"
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_release_text_controls.py::test_release_text_defaults_keep_advisory_off`

Expected: FAIL because `ReleaseTextSettings` does not exist.

- [ ] **Step 3: Add typed models**

```python
class TextLayerStyle(BaseModel):
    font_family: str = "default"
    size: int = Field(default=72, ge=24, le=220)
    position: Literal["top", "upper-third", "center", "lower-third", "bottom"] = "top"
    alignment: Literal["left", "center", "right"] = "center"
    case: Literal["original", "upper", "lower", "title"] = "original"
    treatment: Literal["light", "dark", "outline", "shadow"] = "light"


class AdvisoryStyle(BaseModel):
    position: Literal["bottom-left", "bottom-right"] = "bottom-right"
    size: Literal["small", "medium", "large"] = "small"


class ReleaseTextSettings(BaseModel):
    show_title: bool = True
    show_artist: bool = True
    parental_advisory: bool = False
    title: TextLayerStyle = Field(default_factory=TextLayerStyle)
    artist: TextLayerStyle = Field(default_factory=lambda: TextLayerStyle(position="bottom", size=48))
    advisory: AdvisoryStyle = Field(default_factory=AdvisoryStyle)
```

- [ ] **Step 4: Persist settings**

Add generation fields:

```python
show_title: Mapped[bool] = mapped_column(Boolean, default=True)
show_artist: Mapped[bool] = mapped_column(Boolean, default=True)
title_style_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
artist_style_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
advisory_style_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
```

Keep the existing `parental_advisory` boolean but redefine its product meaning as explicit user input only.

- [ ] **Step 5: Extend POST `/api/generations` form fields**

Accept `show_title`, `show_artist`, and JSON strings for style objects. Validate them through `ReleaseTextSettings`. Never derive `parental_advisory=True` from lyrics or analysis.

- [ ] **Step 6: Add migration and run test**

Run: `cd album_cover_backend && python -m pytest -q tests/test_release_text_controls.py`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add album_cover_backend/app/schemas.py album_cover_backend/app/models.py album_cover_backend/app/routers/generations.py album_cover_backend/alembic/versions/20260909_04_release_text_controls.py album_cover_backend/tests/test_release_text_controls.py
git commit -m "feat: add independent release text controls"
```

---

### Task 2: Raw-artwork storage and exactly-once compositor

**Files:**
- Modify: `album_cover_backend/app/models.py`
- Modify: `album_cover_backend/app/storage.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Modify: `album_cover_backend/app/typography.py`
- Test: `album_cover_backend/tests/test_typography.py`
- Test: `album_cover_backend/tests/test_pipeline.py`

**Interfaces:**
- Variation fields: `raw_image_path`, existing `image_path` remains final composited cover.
- Produces: `compose_release_layers(raw: bytes, generation, concept, position) -> bytes`.

- [ ] **Step 1: Write failing exactly-once test**

```python
from PIL import Image


def test_compositor_invokes_each_enabled_layer_once(monkeypatch, service, generation, concept):
    calls = []
    monkeypatch.setattr(service, "_draw_title", lambda image, *args, **kwargs: calls.append("title"))
    monkeypatch.setattr(service, "_draw_artist", lambda image, *args, **kwargs: calls.append("artist"))
    monkeypatch.setattr(service, "_draw_advisory", lambda image, *args, **kwargs: calls.append("advisory"))
    generation.show_title = True
    generation.show_artist = True
    generation.parental_advisory = True
    service.compose_release_layers(Image.new("RGB", (1000, 1000)).tobytes(), generation, concept, 1)
    assert calls.count("title") == 1
    assert calls.count("artist") == 1
    assert calls.count("advisory") == 1
```

Use the project's existing image-byte fixture helper if raw `Image.tobytes()` is not accepted by the current compositor.

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_typography.py -k exactly_once`

Expected: FAIL until layer responsibilities are isolated.

- [ ] **Step 3: Save raw FLUX bytes before compositing**

Add `LocalStorage.save_raw_image(generation_id, set_id, position, content)` using a distinct `raw/` subpath. `_fill_set()` must save the FLUX response there before any title/artist/advisory drawing.

- [ ] **Step 4: Refactor compositor into independent layers**

The compositor must execute exactly:

```python
if generation.show_title and generation.title:
    self._draw_title(image, generation, concept)
if generation.show_artist and generation.artist:
    self._draw_artist(image, generation, concept)
if generation.parental_advisory:
    self._draw_advisory(image, generation)
```

No prompt or analysis field may add those layers elsewhere.

- [ ] **Step 5: Write regression for advisory default Off**

Create a generation with explicit lyrics containing profanity and `parental_advisory=False`; process with mocked FLUX; assert `_draw_advisory` is never called and response remains `parental_advisory=False`.

- [ ] **Step 6: Run typography/pipeline tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_typography.py tests/test_pipeline.py tests/test_release_text_controls.py`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add album_cover_backend/app/models.py album_cover_backend/app/storage.py album_cover_backend/app/major_label_service.py album_cover_backend/app/typography.py album_cover_backend/tests/test_typography.py album_cover_backend/tests/test_pipeline.py
git commit -m "fix: composite release text exactly once"
```

---

### Task 3: Recompose typography without rerendering FLUX

**Files:**
- Modify: `album_cover_backend/app/schemas.py`
- Modify: `album_cover_backend/app/routers/generations.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Modify: `album_cover_backend/app/presentation.py`
- Test: `album_cover_backend/tests/test_recompose.py`

**Interfaces:**
- New route: `PATCH /api/generations/{generation_id}/release-text`.
- Input: `ReleaseTextSettings`.
- No call to `image_client.generate()`.

- [ ] **Step 1: Write failing no-rerender test**

```python
def test_release_text_patch_recomposes_from_raw_without_flux(client, generated_cover, image_client):
    before = image_client.call_count
    response = client.patch(
        f"/api/generations/{generated_cover.id}/release-text",
        json={
            "show_title": True,
            "show_artist": False,
            "parental_advisory": False,
            "title": {"font_family":"default","size":96,"position":"top","alignment":"center","case":"upper","treatment":"light"},
            "artist": {"font_family":"default","size":48,"position":"bottom","alignment":"center","case":"original","treatment":"light"},
            "advisory": {"position":"bottom-right","size":"small"}
        },
    )
    assert response.status_code == 200
    assert image_client.call_count == before
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_recompose.py::test_release_text_patch_recomposes_from_raw_without_flux`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement `recompose_release_text()`**

Load each variation's `raw_image_path`, apply the updated settings, overwrite only the final `image_path`, update generation settings, commit, and return the refreshed generation.

- [ ] **Step 4: Run recomposition tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_recompose.py tests/test_typography.py`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add album_cover_backend/app/schemas.py album_cover_backend/app/routers/generations.py album_cover_backend/app/major_label_service.py album_cover_backend/app/presentation.py album_cover_backend/tests/test_recompose.py
git commit -m "feat: recompose cover typography without rerendering"
```

---

### Task 4: Remove AI-winner behavior from presentation contract

**Files:**
- Modify: `album_cover_backend/app/models.py`
- Modify: `album_cover_backend/app/schemas.py`
- Modify: `album_cover_backend/app/presentation.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Create: `album_cover_backend/alembic/versions/20260909_05_remove_user_facing_ai_winner.py`
- Test: `album_cover_backend/tests/test_presentation.py`

**Interfaces:**
- Variation responses remain position-ordered.
- Internal critic scores may remain in persistence/audit, but no winner/runner-up field drives user display.

- [ ] **Step 1: Write failing neutral-presentation test**

```python
def test_variation_set_response_has_no_ai_winner_contract(completed_generation):
    payload = generation_response(completed_generation).model_dump()
    latest = payload["variation_sets"][-1]
    assert "winner_variation_id" not in latest
    assert "runner_up_variation_id" not in latest
    assert [item["position"] for item in latest["variations"]] == [1, 2, 3, 4, 5, 6]
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_presentation.py::test_variation_set_response_has_no_ai_winner_contract`

Expected: FAIL because response currently exposes winner fields.

- [ ] **Step 3: Remove user-facing winner fields**

Delete `winner_variation_id` and `runner_up_variation_id` from `VariationSetResponse`. Stop assigning user-facing `selection_tier='winner'` / `'runner_up'`; use neutral diagnostic values or `unranked` for UI-facing data.

- [ ] **Step 4: Database migration**

Drop `ai_winner_variation_id` and `ai_runner_up_variation_id` only after confirming no production code path reads them. Preserve critic scores and ranking metadata for diagnostics.

- [ ] **Step 5: Run presentation/API tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_presentation.py tests/test_api.py tests/test_pipeline.py`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add album_cover_backend/app/models.py album_cover_backend/app/schemas.py album_cover_backend/app/presentation.py album_cover_backend/app/major_label_service.py album_cover_backend/alembic/versions/20260909_05_remove_user_facing_ai_winner.py album_cover_backend/tests/test_presentation.py
git commit -m "refactor: make final cover choice user-only"
```

---

### Task 5: Frontend types and independent artist/title/advisory controls

**Files:**
- Modify: `src/services/albumCoverStudio.ts`
- Modify: `src/components/AlbumCoverStudio.tsx`
- Modify: `src/services/albumCoverIntegration.test.ts`

**Interfaces:**
- `AlbumCoverVariationCount` becomes fixed major-label `6` for the primary flow.
- Produces `AlbumCoverReleaseTextSettings` matching backend schema.
- Produces `updateAlbumCoverReleaseText(generationId, settings)`.

- [ ] **Step 1: Write failing integration assertions**

Add assertions that source contains:

```ts
assert.match(studioSource, /Show title/);
assert.match(studioSource, /Show artist/);
assert.match(studioSource, /Parental Advisory/);
assert.match(studioSource, /default.*Off|checked=\{parentalAdvisory\}/s);
assert.doesNotMatch(studioSource, /AI Winner|Recommended Cover|Best Cover/);
assert.match(serviceSource, /AlbumCoverVariationCount = 6/);
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts`

Expected: FAIL because variation type is currently `3 | 4 | 5` and the independent controls are incomplete.

- [ ] **Step 3: Add frontend release-text types**

```ts
export type AlbumCoverVariationCount = 6;

export interface AlbumCoverTextLayerStyle {
  fontFamily: string;
  size: number;
  position: 'top' | 'upper-third' | 'center' | 'lower-third' | 'bottom';
  alignment: 'left' | 'center' | 'right';
  case: 'original' | 'upper' | 'lower' | 'title';
  treatment: 'light' | 'dark' | 'outline' | 'shadow';
}

export interface AlbumCoverReleaseTextSettings {
  showTitle: boolean;
  showArtist: boolean;
  parentalAdvisory: boolean;
  title: AlbumCoverTextLayerStyle;
  artist: AlbumCoverTextLayerStyle;
  advisory: { position: 'bottom-left' | 'bottom-right'; size: 'small' | 'medium' | 'large' };
}
```

- [ ] **Step 4: Update generation transport**

Initial generation sends `variation_count=6`, explicit show-title/show-artist values, and explicit advisory boolean. Add `updateAlbumCoverReleaseText()` to call the PATCH recomposition route.

- [ ] **Step 5: Add compact UI controls**

Keep title and artist text fields. Add separate Show title and Show artist toggles; font/style/size/position controls for each; advisory toggle default Off with size/position shown only when enabled. On typography change after generation, call recomposition instead of Generate.

- [ ] **Step 6: Run integration test, lint, and build**

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
git commit -m "feat: add independent album cover text controls"
```

---

### Task 6: Six equal choices with no preselection or score ordering

**Files:**
- Modify: `src/components/AlbumCoverStudio.tsx`
- Modify: `src/services/albumCoverStudio.ts`
- Modify: `src/services/albumCoverIntegration.test.ts`

**Interfaces:**
- Results ordering is `position` ascending only.
- `selectedVariationId` starts empty for every newly completed set.

- [ ] **Step 1: Write failing neutral-choice assertions**

Add test assertions that `latestAlbumCoverVariations()` sorts only on `position`, the component does not compute `winnerId`, `runnerUpId`, or `hasWinner`, and newly completed results do not copy an AI selection into local state.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts`

Expected: FAIL because the current component reads winner fields and automatically adopts selected variation state.

- [ ] **Step 3: Remove winner logic**

Delete frontend references to `winner_variation_id`, `runner_up_variation_id`, `selection_tier === 'winner'`, winner/runner-up badges, and any AI-based sorting.

- [ ] **Step 4: Require explicit click selection**

When a new variation set completes, leave `selectedVariationId=''`. Only `handleSelectVariation()` may set a selected cover for that new set. Historical user selections may still display as selected when reopening a version.

- [ ] **Step 5: Render six equal cards**

Use the same card dimensions, border weight, image aspect ratio, and button hierarchy for every successful variation. Show concept name neutrally if desired; do not show quality score as a visual recommendation.

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
git add src/components/AlbumCoverStudio.tsx src/services/albumCoverStudio.ts src/services/albumCoverIntegration.test.ts
git commit -m "feat: present six equal user-selected covers"
```

---

### Task 7: Text/UI plan verification gate

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run exactly-once backend regressions**

Run: `cd album_cover_backend && python -m pytest -q tests/test_release_text_controls.py tests/test_typography.py tests/test_recompose.py tests/test_presentation.py tests/test_pipeline.py`

Expected: PASS with 0 failures.

- [ ] **Step 2: Run full backend suite**

Run: `cd album_cover_backend && python -m pytest -q`

Expected: PASS.

- [ ] **Step 3: Run frontend regression suite**

Run: `node --experimental-strip-types --test src/services/albumCoverIntegration.test.ts`

Expected: PASS.

- [ ] **Step 4: Run lint/build**

Run:

```bash
npm run lint
npm run build
```

Expected: both exit 0.

- [ ] **Step 5: Search for prohibited user-facing winner behavior**

Run:

```bash
! grep -R "winner_variation_id\|runner_up_variation_id\|AI Winner\|Recommended Cover" src/components/AlbumCoverStudio.tsx src/services/albumCoverStudio.ts album_cover_backend/app/schemas.py album_cover_backend/app/presentation.py
```

Expected: exit 0.

- [ ] **Step 6: Review diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional files changed.

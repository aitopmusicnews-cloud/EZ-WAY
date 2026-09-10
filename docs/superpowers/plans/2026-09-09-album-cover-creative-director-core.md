# Album Cover Creative Director Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production Gemini-named creative-planning path with a Cloudflare Gemma major-label Creative Director that builds a Song Thesis, creates eight concepts, critiques/revises them, selects three diverse concepts, and produces six FLUX.1 Schnell render briefs.

**Architecture:** Keep deterministic audio and lyrics analyzers as baseline signal producers, then add a provider-neutral Creative Director interface with a Cloudflare Gemma implementation. The service stores a structured Song Intelligence report, runs concept competition before spending FLUX calls, compresses production briefs to the 2048-character FLUX limit, and marks degraded fallback explicitly instead of silently pretending it is equivalent.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Pydantic, httpx, librosa, Cloudflare Workers AI, pytest/pytest-asyncio.

**Spec:** `docs/superpowers/specs/2026-09-09-album-cover-major-label-creative-director-design.md`

## Global Constraints

- Production Creative Director model: `@cf/google/gemma-4-26b-a4b-it`.
- Production renderer remains `@cf/black-forest-labs/flux-1-schnell`.
- No OpenAI or Gemini credential is required for the new production flow.
- User Strict Creative Controls have highest authority.
- Generate exactly eight raw concepts when advanced Creative Direction succeeds.
- Select exactly three meaningfully different concepts when at least three pass the quality gate.
- Render two executions per selected concept for six intended covers.
- FLUX production prompt length must be `<= 2048` characters.
- Never silently switch to OpenAI or Gemini on Cloudflare failure.
- Degraded local fallback must be recorded as `creative_direction_degraded`.
- No Pollinations.

---

### Task 1: Provider-neutral Creative Director contract and Cloudflare configuration

**Files:**
- Create: `album_cover_backend/app/creative_direction.py`
- Create: `album_cover_backend/app/cloudflare_creative_director.py`
- Modify: `album_cover_backend/app/config.py`
- Modify: `album_cover_backend/.env.example`
- Test: `album_cover_backend/tests/test_cloudflare_creative_director.py`
- Test: `album_cover_backend/tests/test_config.py`

**Interfaces:**
- Produces: `SongThesis`, `ConceptDraft`, `ConceptCritique`, `CreativeDirector` protocol.
- Produces: `CloudflareGemmaCreativeDirector(account_id, api_token, model, timeout_seconds, enabled, transport=None)`.
- Consumes later: `CreativeDirector.build_song_thesis()`, `create_concepts()`, `critique_concepts()`, `revise_concepts()`.

- [ ] **Step 1: Write failing configuration tests**

```python
from app.config import Settings


def test_cloudflare_creative_director_defaults():
    settings = Settings()
    assert settings.cloudflare_creative_director_model == "@cf/google/gemma-4-26b-a4b-it"
    assert settings.enable_cloudflare_creative_director is True
    assert settings.cloudflare_creative_director_timeout_seconds == 90.0
    assert settings.concept_count == 8
    assert settings.selected_concept_count == 3
    assert settings.renders_per_concept == 2
    assert settings.render_count == 6
```

- [ ] **Step 2: Run config test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_config.py::test_cloudflare_creative_director_defaults`

Expected: FAIL because Cloudflare Creative Director settings do not exist and selected concept count is still 2.

- [ ] **Step 3: Add exact settings/defaults**

```python
cloudflare_creative_director_model: str = field(
    default_factory=lambda: os.getenv(
        "CLOUDFLARE_CREATIVE_DIRECTOR_MODEL", "@cf/google/gemma-4-26b-a4b-it"
    )
)
cloudflare_creative_director_timeout_seconds: float = field(
    default_factory=lambda: float(os.getenv("CLOUDFLARE_CREATIVE_DIRECTOR_TIMEOUT_SECONDS", "90"))
)
enable_cloudflare_creative_director: bool = field(
    default_factory=lambda: _env_bool("ENABLE_CLOUDFLARE_CREATIVE_DIRECTOR", True)
)
concept_count: int = field(default_factory=lambda: _env_int("CONCEPT_COUNT", 8))
selected_concept_count: int = field(default_factory=lambda: _env_int("SELECTED_CONCEPT_COUNT", 3))
renders_per_concept: int = field(default_factory=lambda: _env_int("RENDERS_PER_CONCEPT", 2))
```

Replace the provider/major-label portion of `album_cover_backend/.env.example` with:

```text
# Required provider credentials
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Cloudflare Workers AI Creative Director + renderer
CLOUDFLARE_CREATIVE_DIRECTOR_MODEL=@cf/google/gemma-4-26b-a4b-it
CLOUDFLARE_CREATIVE_DIRECTOR_TIMEOUT_SECONDS=90
ENABLE_CLOUDFLARE_CREATIVE_DIRECTOR=true
CLOUDFLARE_FLUX_MODEL=@cf/black-forest-labs/flux-1-schnell
CLOUDFLARE_FLUX_STEPS=4
CLOUDFLARE_TIMEOUT_SECONDS=150

# Major-label pipeline: 8 concepts -> top 3 diverse concepts -> 2 renders each -> 6 covers
CONCEPT_COUNT=8
SELECTED_CONCEPT_COUNT=3
RENDERS_PER_CONCEPT=2
MAX_PARALLEL_RENDERS=2
ENABLE_PLATFORM_SCORING=true
ENABLE_MARKET_POSITIONING=false
ENABLE_COMMERCIAL_BENCHMARKING=false
```

Remove Gemini credential/model comments from the production example. Legacy Gemini code may remain temporarily but is not configured by this example.

- [ ] **Step 4: Define provider-neutral typed contracts**

```python
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(slots=True)
class SongThesis:
    core_meaning: str
    emotional_arc: str
    musical_personality: list[str]
    lyrical_world: dict[str, list[str]]
    creative_contradiction: str
    signature_moment: str
    visual_permissions: list[str]
    visual_bans: list[str]
    artist_role_recommendation: str
    campaign_thesis: str


@dataclass(slots=True)
class ConceptDraft:
    id: str
    name: str
    one_line_pitch: str
    why_it_fits: str
    subject: str
    artist_presence: str
    setting: str
    action_or_symbol: str
    wardrobe_or_material: str
    camera: str
    composition: str
    lighting: str
    medium: str
    palette: str
    texture: str
    dominant_shape: str
    visual_metaphor: str
    typography_zone: str
    must_include: list[str] = field(default_factory=list)
    avoid: list[str] = field(default_factory=list)
    image_prompt_seed: str = ""


@dataclass(slots=True)
class ConceptCritique:
    concept_id: str
    problems: list[str]
    rebuild_required: bool
    revision_direction: str


class CreativeDirector(Protocol):
    async def build_song_thesis(self, *, context: dict[str, Any]) -> SongThesis:
        raise NotImplementedError

    async def create_concepts(self, *, context: dict[str, Any], count: int) -> list[ConceptDraft]:
        raise NotImplementedError

    async def critique_concepts(self, *, context: dict[str, Any], concepts: list[ConceptDraft]) -> list[ConceptCritique]:
        raise NotImplementedError

    async def revise_concepts(self, *, context: dict[str, Any], concepts: list[ConceptDraft], critiques: list[ConceptCritique]) -> list[ConceptDraft]:
        raise NotImplementedError
```

- [ ] **Step 5: Write failing Cloudflare request test**

```python
import httpx
import pytest
from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector


@pytest.mark.asyncio
async def test_song_thesis_uses_cloudflare_endpoint_and_bearer_auth():
    seen = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        return httpx.Response(200, json={
            "result": {
                "response": '{"core_meaning":"survival","emotional_arc":"contained to defiant","musical_personality":["tense"],"lyrical_world":{"people":[],"objects":[],"places":[],"symbols":[]},"creative_contradiction":"calm vocal over hard drums","signature_moment":"final hook","visual_permissions":[],"visual_bans":[],"artist_role_recommendation":"none","campaign_thesis":"calm control under pressure"}'
            }
        })

    client = CloudflareGemmaCreativeDirector(
        account_id="acct",
        api_token="secret",
        transport=httpx.MockTransport(handler),
    )
    thesis = await client.build_song_thesis(context={"lyrics": "hold the line"})
    assert thesis.campaign_thesis == "calm control under pressure"
    assert "/accounts/acct/ai/run/@cf/google/gemma-4-26b-a4b-it" in seen["url"]
    assert seen["auth"] == "Bearer secret"
```

- [ ] **Step 6: Run provider test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_cloudflare_creative_director.py::test_song_thesis_uses_cloudflare_endpoint_and_bearer_auth`

Expected: FAIL because `CloudflareGemmaCreativeDirector` does not exist.

- [ ] **Step 7: Implement Cloudflare Gemma adapter**

Implement `_run_json(system: str, user: dict[str, Any], max_completion_tokens: int) -> dict[str, Any]` that POSTs to:

```python
endpoint = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"
headers = {
    "Authorization": f"Bearer {self.api_token}",
    "Content-Type": "application/json",
}
payload = {
    "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ],
    "temperature": 0.7,
    "max_completion_tokens": max_completion_tokens,
}
```

Parse strict JSON from `result.response`. Missing Cloudflare credentials must return a typed unavailable error without making a network request. Map 401/403, 429, 5xx, timeout, and malformed response into typed Creative Director errors so retry/fallback logic can distinguish them.

- [ ] **Step 8: Run provider/config tests and verify GREEN**

Run: `cd album_cover_backend && python -m pytest -q tests/test_cloudflare_creative_director.py tests/test_config.py`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add album_cover_backend/app/creative_direction.py album_cover_backend/app/cloudflare_creative_director.py album_cover_backend/app/config.py album_cover_backend/.env.example album_cover_backend/tests/test_cloudflare_creative_director.py album_cover_backend/tests/test_config.py
git commit -m "feat: add Cloudflare creative director provider"
```

---

### Task 2: Section-aware Song Intelligence and structured Song Thesis

**Files:**
- Create: `album_cover_backend/app/song_intelligence.py`
- Modify: `album_cover_backend/app/audio_analysis.py`
- Modify: `album_cover_backend/app/lyrics_analysis.py`
- Test: `album_cover_backend/tests/test_song_intelligence.py`
- Test: `album_cover_backend/tests/test_audio_analysis.py`

**Interfaces:**
- Produces: `SongIntelligenceEngine(creative_director)`.
- Produces: `async synthesize(audio: dict[str, Any], lyrics: dict[str, Any], lyrics_text: str | None, creative_controls: dict[str, str]) -> dict[str, Any]`.
- Stores later in `Generation.song_intelligence_json` and `Generation.song_thesis_json`.

- [ ] **Step 1: Write failing section-summary test**

```python
from app.audio_analysis import AudioAnalyzer


def test_section_summary_marks_low_and_high_energy_regions():
    analyzer = AudioAnalyzer()
    features = [
        {"start": 0.0, "end": 20.0, "energy": 0.2, "brightness": 0.3, "beat_density": 0.4},
        {"start": 20.0, "end": 40.0, "energy": 0.8, "brightness": 0.7, "beat_density": 0.9},
    ]
    summary = analyzer.summarize_sections(features)
    assert summary["lowest_intensity_region"]["start"] == 0.0
    assert summary["highest_intensity_region"]["start"] == 20.0
    assert summary["major_energy_transitions"][0]["direction"] == "up"
```

- [ ] **Step 2: Run section test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_audio_analysis.py::test_section_summary_marks_low_and_high_energy_regions`

Expected: FAIL because `summarize_sections` does not exist.

- [ ] **Step 3: Add deterministic section summary**

Add 20-second analysis windows inside `AudioAnalyzer.analyze()`, shortened for the final partial window. For each window store start/end, normalized RMS energy, spectral centroid as brightness, and beat/onset density. `summarize_sections(features)` sorts windows, returns the lowest/highest regions, and records adjacent energy changes with absolute delta `>= 0.20`. Name windows neutrally `region_1`, `region_2`, and never claim verse/chorus when not actually detected.

- [ ] **Step 4: Write failing Song Intelligence orchestration test**

```python
import pytest
from app.creative_direction import SongThesis
from app.song_intelligence import SongIntelligenceEngine


class StubDirector:
    async def build_song_thesis(self, *, context):
        assert context["audio"]["tempo_bpm"] == 88
        assert context["lyrics"]["themes"] == ["loss and memory"]
        return SongThesis(
            core_meaning="letting go",
            emotional_arc="guarded to accepting",
            musical_personality=["restrained", "warm"],
            lyrical_world={"people": [], "objects": ["letter"], "places": [], "symbols": ["door"]},
            creative_contradiction="warm production under painful lyrics",
            signature_moment="last refrain",
            visual_permissions=["letter", "door"],
            visual_bans=["sports car"],
            artist_role_recommendation="partial",
            campaign_thesis="graceful release after private grief",
        )


@pytest.mark.asyncio
async def test_song_intelligence_combines_baseline_analysis_with_thesis():
    engine = SongIntelligenceEngine(creative_director=StubDirector())
    report = await engine.synthesize(
        audio={"tempo_bpm": 88, "section_summary": {}},
        lyrics={"themes": ["loss and memory"], "keywords": ["letter"]},
        lyrics_text="I left your letter by the door",
        creative_controls={"creative_strength": "balanced"},
    )
    assert report["song_thesis"]["campaign_thesis"] == "graceful release after private grief"
    assert report["status"] == "advanced"
```

- [ ] **Step 5: Run orchestration test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_song_intelligence.py::test_song_intelligence_combines_baseline_analysis_with_thesis`

Expected: FAIL because `SongIntelligenceEngine` does not exist.

- [ ] **Step 6: Implement `SongIntelligenceEngine.synthesize()`**

Build director context with baseline audio analysis, baseline lyrics analysis, sanitized full lyrics, and Creative Controls. Convert `SongThesis` with `dataclasses.asdict()` and return:

```python
{
    "audio": audio,
    "lyrics": lyrics,
    "song_thesis": asdict(thesis),
    "status": "advanced",
}
```

On bounded retry exhaustion, call `fallback_song_thesis(audio, lyrics)` and return the same shape with `status="creative_direction_degraded"`. The fallback must never call OpenAI or Gemini.

- [ ] **Step 7: Run Song Intelligence tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_song_intelligence.py tests/test_audio_analysis.py tests/test_lyrics_analysis.py`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add album_cover_backend/app/song_intelligence.py album_cover_backend/app/audio_analysis.py album_cover_backend/app/lyrics_analysis.py album_cover_backend/tests/test_song_intelligence.py album_cover_backend/tests/test_audio_analysis.py
git commit -m "feat: build section-aware song intelligence"
```

---

### Task 3: Eight-concept competition, adversarial critique, revision, scoring, and diverse top-three selection

**Files:**
- Create: `album_cover_backend/app/concept_quality.py`
- Modify: `album_cover_backend/app/cloudflare_creative_director.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Test: `album_cover_backend/tests/test_concept_quality.py`
- Test: `album_cover_backend/tests/test_major_label_pipeline.py`

**Interfaces:**
- Produces: `score_concept(concept, song_thesis, creative_controls) -> dict[str, float]`.
- Produces: `score_total(score_map: dict[str, float]) -> float`.
- Produces: `select_diverse_concepts(concepts, total_scores, count=3) -> list[ConceptDraft]`.
- Consumes: `CreativeDirector.create_concepts`, `critique_concepts`, `revise_concepts`.

- [ ] **Step 1: Write failing diversity-selection test**

```python
from app.concept_quality import select_diverse_concepts
from app.creative_direction import ConceptDraft


def concept(cid, subject, setting, medium, metaphor):
    return ConceptDraft(
        id=cid,
        name=cid,
        one_line_pitch=cid,
        why_it_fits="song-specific",
        subject=subject,
        artist_presence="hero",
        setting=setting,
        action_or_symbol="still",
        wardrobe_or_material="black wool",
        camera="35mm",
        composition="centered",
        lighting="soft",
        medium=medium,
        palette="black and cream",
        texture="grain",
        dominant_shape="vertical",
        visual_metaphor=metaphor,
        typography_zone="upper-left",
        image_prompt_seed=cid,
    )


def test_diverse_selector_rejects_three_near_duplicate_portraits():
    concepts = [
        concept("a", "artist portrait", "studio", "photo", "isolation"),
        concept("b", "artist portrait", "studio", "photo", "isolation"),
        concept("c", "artist portrait", "studio", "photo", "isolation"),
        concept("d", "empty table", "banquet hall", "photo", "absence"),
        concept("e", "folded letter", "white field", "collage", "release"),
    ]
    scores = {"a": 96.0, "b": 95.0, "c": 94.0, "d": 91.0, "e": 90.0}
    selected = select_diverse_concepts(concepts, scores, count=3)
    assert [item.id for item in selected] == ["a", "d", "e"]
```

- [ ] **Step 2: Run diversity test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_concept_quality.py::test_diverse_selector_rejects_three_near_duplicate_portraits`

Expected: FAIL because `concept_quality.py` does not exist.

- [ ] **Step 3: Implement deterministic diversity gate**

Normalize lowercased token sets for `subject`, `setting`, `medium`, `visual_metaphor`, `artist_presence`, and `dominant_shape`. Two candidates are near duplicates when at least four of those six normalized fields are equal. Sort by total score descending and greedily select only non-duplicate candidates until count 3.

- [ ] **Step 4: Implement the exact 100-point rubric**

`score_concept()` returns these seven keys with bounded values:

```python
{
    "song_specificity": 25.0,
    "originality": 20.0,
    "emotional_power": 15.0,
    "visual_memorability": 15.0,
    "artist_campaign_value": 10.0,
    "flux_executability": 10.0,
    "typography_compatibility": 5.0,
}
```

Gemma provides suggested component scores in the critique/revision JSON. `concept_quality.py` clamps each to its maximum and sets total score to 0 for a hard failure: Strict control violation, prohibited generated-text instruction, missing required field, or duplicate of an already selected concept.

- [ ] **Step 5: Write failing pipeline-cycle test**

Use a stub director recording method calls. It returns eight raw concepts, eight critiques, and eight revised concepts. Assert the service call order is exactly `create_concepts`, `critique_concepts`, `revise_concepts`; exactly three `ConceptCandidate` rows are `selected_for_render=True`; and six image-generation calls occur when all renders succeed.

Run: `cd album_cover_backend && python -m pytest -q tests/test_major_label_pipeline.py::test_pipeline_runs_concept_competition_before_rendering`

Expected: FAIL until the service is rewired.

- [ ] **Step 6: Rewire `MajorLabelGenerationService._plan_concepts()`**

The method receives the stored Song Thesis and Creative Controls, builds one context object, then executes:

```python
raw = await self.creative_director.create_concepts(context=context, count=8)
critiques = await self.creative_director.critique_concepts(context=context, concepts=raw)
revised = await self.creative_director.revise_concepts(
    context=context,
    concepts=raw,
    critiques=critiques,
)
score_maps = {
    item.id: score_concept(item, song_thesis, creative_controls)
    for item in revised
}
totals = {concept_id: score_total(scores) for concept_id, scores in score_maps.items()}
selected = select_diverse_concepts(revised, totals, count=3)
```

Use a configurable quality floor default 70.0. If fewer than three pass, request one replacement batch for exactly the number missing. Do not lower the floor.

- [ ] **Step 7: Run concept/pipeline tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_concept_quality.py tests/test_major_label_pipeline.py tests/test_pipeline.py`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add album_cover_backend/app/concept_quality.py album_cover_backend/app/cloudflare_creative_director.py album_cover_backend/app/major_label_service.py album_cover_backend/tests/test_concept_quality.py album_cover_backend/tests/test_major_label_pipeline.py
git commit -m "feat: add major-label concept competition"
```

---

### Task 4: Production Brief Builder with strict 2048-character priority ordering

**Files:**
- Modify: `album_cover_backend/app/render_prompts.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Test: `album_cover_backend/tests/test_render_prompts.py`
- Test: `album_cover_backend/tests/test_flux_image_renderer.py`

**Interfaces:**
- Produces: `build_production_brief(*, concept, creative_controls, visual_bible=None, render_index) -> str`.
- Invariant: output length `<= 2048`.

- [ ] **Step 1: Write failing cutoff-priority test**

```python
from app.render_prompts import build_production_brief


def test_production_brief_keeps_controls_and_no_text_before_cutoff():
    prompt = build_production_brief(
        concept={
            "subject": "woman holding one red glove",
            "setting": "empty church",
            "camera": "35mm low eye level",
            "composition": "wide negative space upper-left",
            "lighting": "late afternoon window light",
            "medium": "editorial photography",
            "texture": "fine film grain",
            "palette": "cream burgundy black",
            "must_include": ["red glove"],
            "avoid": ["cars", "neon"],
            "image_prompt_seed": "x" * 5000,
            "artist_presence": "none",
        },
        creative_controls={
            "creative_strength": "strict",
            "subject_hint": "woman holding one red glove",
        },
        visual_bible=None,
        render_index=1,
    )
    assert len(prompt) <= 2048
    assert prompt.index("STRICT USER CONTROL") < 300
    assert prompt.index("NO TITLE") < 1200
    assert "red glove" in prompt
```

- [ ] **Step 2: Run prompt test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_render_prompts.py::test_production_brief_keeps_controls_and_no_text_before_cutoff`

Expected: FAIL because `build_production_brief` does not exist.

- [ ] **Step 3: Implement priority-ordered compression**

Build fields in this order:

```text
STRICT USER CONTROL / user controls
REFERENCE IDENTITY GUIDE when present
SUBJECT + ACTION
SETTING
COMPOSITION + CAMERA
LIGHTING
MEDIUM + TEXTURE
PALETTE
MUST INCLUDE
NO TITLE. NO ARTIST LETTERING. NO TYPOGRAPHY. NO LOGOS. NO PARENTAL ADVISORY. NO WATERMARKS.
AVOID
EXECUTION VARIATION
```

Reserve 350 characters for Strict controls and 140 characters for the no-text block before adding lower-priority prose. Trim `image_prompt_seed`, texture, palette, lighting, and setting in that order until the final prompt is <= 2048. Never trim Strict controls or the no-text block.

- [ ] **Step 4: Wire `_fill_set()` to the Production Brief Builder**

Use `build_production_brief()` for each selected concept/render index. With selected concept count 3 and requested count 6, positions 1-3 are render index 1 across the three concepts and positions 4-6 are render index 2 across the same three concepts.

- [ ] **Step 5: Run render tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_render_prompts.py tests/test_flux_image_renderer.py tests/test_pipeline.py`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add album_cover_backend/app/render_prompts.py album_cover_backend/app/major_label_service.py album_cover_backend/tests/test_render_prompts.py album_cover_backend/tests/test_flux_image_renderer.py
git commit -m "feat: build priority FLUX production briefs"
```

---

### Task 5: Persist Song Thesis and expanded concept metadata

**Files:**
- Modify: `album_cover_backend/app/models.py`
- Modify: `album_cover_backend/app/schemas.py`
- Modify: `album_cover_backend/app/presentation.py`
- Create: `album_cover_backend/alembic/versions/20260909_03_creative_director_core.py`
- Test: `album_cover_backend/tests/test_persistence.py`
- Test: `album_cover_backend/tests/test_api.py`

**Interfaces:**
- Generation: `song_intelligence_json`, `song_thesis_json`, `creative_direction_status`.
- ConceptCandidate: pitch, fit rationale, artist presence, wardrobe/material, composition, lighting, texture, dominant shape, visual metaphor, must-include, avoid, critic feedback, revision metadata.

- [ ] **Step 1: Write failing persistence round-trip test**

Create one generation with `song_thesis_json={"campaign_thesis":"quiet control under pressure"}` and one concept with `one_line_pitch`, `why_it_fits`, `artist_presence`, `composition`, `lighting`, `visual_metaphor`, and list fields. Commit, close the session, reload in a fresh session, and assert exact equality.

Run: `cd album_cover_backend && python -m pytest -q tests/test_persistence.py::test_creative_director_metadata_round_trips`

Expected: FAIL because the fields do not exist.

- [ ] **Step 2: Add SQLAlchemy fields**

Use JSON for structured reports/lists and Text/String for readable scalar fields. Add `creative_direction_status` with Python default `"pending"`. Keep legacy winner columns untouched in this task; their removal is isolated in the text/UI plan.

- [ ] **Step 3: Add Alembic migration**

Migration adds the new columns. `creative_direction_status` gets server default `pending` for migration safety, existing rows are backfilled, then the server default is dropped so application code owns future defaults.

- [ ] **Step 4: Extend response schemas/presentation**

Expose `song_thesis` and `creative_direction_status` on `GenerationResponse`; expose expanded concept metadata on `ConceptResponse`. Do not expose hidden reasoning traces; only structured conclusions, concise critique, and score fields.

- [ ] **Step 5: Run persistence/API tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_persistence.py tests/test_api.py`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add album_cover_backend/app/models.py album_cover_backend/app/schemas.py album_cover_backend/app/presentation.py album_cover_backend/alembic/versions/20260909_03_creative_director_core.py album_cover_backend/tests/test_persistence.py album_cover_backend/tests/test_api.py
git commit -m "feat: persist creative director intelligence"
```

---

### Task 6: Production wiring, degraded-mode status, health endpoint, and stale Gemini cleanup

**Files:**
- Modify: `album_cover_backend/app/main.py`
- Modify: `album_cover_backend/app/service.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Modify: `album_cover_backend/app/feedback_generation_service.py`
- Modify: `album_cover_backend/README.md`
- Test: `album_cover_backend/tests/test_health.py`
- Test: `album_cover_backend/tests/test_pipeline.py`

**Interfaces:**
- `AppDependencies.creative_director` remains injectable for tests.
- Production default becomes `CloudflareGemmaCreativeDirector`.
- Health provider key: `cloudflare_creative_director`.

- [ ] **Step 1: Write failing health/wiring test**

```python
def test_health_reports_cloudflare_creative_director(client):
    body = client.get("/health").json()
    provider = body["providers"]["cloudflare_creative_director"]
    assert provider["model"] == "@cf/google/gemma-4-26b-a4b-it"
    assert body["pipeline"]["selected_concept_count"] == 3
    assert body["pipeline"]["render_count"] == 6
    assert "gemini_creative_director" not in body["providers"]
    assert "gemini_concept_ranker" not in body["providers"]
    assert "gemini_cover_critic" not in body["providers"]
```

- [ ] **Step 2: Run health test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_health.py::test_health_reports_cloudflare_creative_director`

Expected: FAIL because health currently reports Gemini provider keys and top-2/four-cover defaults.

- [ ] **Step 3: Rewire `create_app()`**

Instantiate:

```python
creative_director = dependencies.creative_director or CloudflareGemmaCreativeDirector(
    account_id=settings.cloudflare_account_id,
    api_token=settings.cloudflare_api_token,
    model=settings.cloudflare_creative_director_model,
    timeout_seconds=settings.cloudflare_creative_director_timeout_seconds,
    enabled=settings.enable_cloudflare_creative_director,
)
```

Do not instantiate `GeminiCreativeDirector`, `GeminiConceptRanker`, or `GeminiCoverCritic` in the production generation-service path. Remove those imports from `main.py`. Preserve legacy modules only until a later cleanup proves no migration/tests import them.

- [ ] **Step 4: Update health/degraded behavior**

Health reports `cloudflare_creative_director` and `cloudflare_flux_images` separately. A Cloudflare director failure after configured retries records an audit event with `outcome="fallback"`, message naming degraded local planning, and `generation.creative_direction_status="creative_direction_degraded"`.

- [ ] **Step 5: Update backend README**

State that Cloudflare Gemma 4 performs Song Thesis/concept direction/critique, FLUX.1 Schnell renders artwork, no OpenAI/Gemini secret is required, and major-label mode targets six covers from three selected concepts.

- [ ] **Step 6: Run backend suite**

Run: `cd album_cover_backend && python -m pytest -q`

Expected: PASS.

- [ ] **Step 7: Compile**

Run: `python -m compileall -q album_cover_backend/app`

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add album_cover_backend/app/main.py album_cover_backend/app/service.py album_cover_backend/app/major_label_service.py album_cover_backend/app/feedback_generation_service.py album_cover_backend/README.md album_cover_backend/tests/test_health.py album_cover_backend/tests/test_pipeline.py
git commit -m "feat: wire Cloudflare major-label creative direction"
```

---

### Task 7: Core plan verification gate

**Files:**
- Modify only when a verification command exposes a concrete defect.

- [ ] **Step 1: Run focused tests**

```bash
cd album_cover_backend
python -m pytest -q tests/test_cloudflare_creative_director.py tests/test_song_intelligence.py tests/test_concept_quality.py tests/test_render_prompts.py tests/test_major_label_pipeline.py
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Run full backend suite**

Run: `cd album_cover_backend && python -m pytest -q`

Expected: PASS with 0 failures.

- [ ] **Step 3: Run Python compile**

Run: `python -m compileall -q album_cover_backend/app`

Expected: exit 0.

- [ ] **Step 4: Provider isolation check**

```bash
! grep -R "OPENAI_API_KEY\|POLLINATIONS" album_cover_backend/app album_cover_backend/.env.example
grep -R "CLOUDFLARE_CREATIVE_DIRECTOR_MODEL" album_cover_backend/app/config.py album_cover_backend/.env.example
! grep -n "GEMINI_API_KEY\|USE_GEMINI_CREATIVE_DIRECTOR\|GEMINI_CONCEPT_MODEL\|GEMINI_CRITIC_MODEL" album_cover_backend/.env.example
```

Expected: first and third commands exit 0; second prints the Cloudflare Creative Director model setting.

- [ ] **Step 5: Verify six-cover defaults**

Run:

```bash
cd album_cover_backend
python - <<'PY'
from app.config import Settings
s = Settings()
assert s.concept_count == 8
assert s.selected_concept_count == 3
assert s.renders_per_concept == 2
assert s.render_count == 6
print("8 -> 3 -> 6 defaults verified")
PY
```

Expected: prints `8 -> 3 -> 6 defaults verified`.

- [ ] **Step 6: Diff sanity**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional files changed.

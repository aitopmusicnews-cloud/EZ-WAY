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
```

- [ ] **Step 2: Run the config test and verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_config.py::test_cloudflare_creative_director_defaults`

Expected: FAIL because the three settings do not yet exist.

- [ ] **Step 3: Add exact settings**

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
```

Add to `.env.example`:

```text
CLOUDFLARE_CREATIVE_DIRECTOR_MODEL=@cf/google/gemma-4-26b-a4b-it
CLOUDFLARE_CREATIVE_DIRECTOR_TIMEOUT_SECONDS=90
ENABLE_CLOUDFLARE_CREATIVE_DIRECTOR=true
```

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
    async def build_song_thesis(self, *, context: dict[str, Any]) -> SongThesis: ...
    async def create_concepts(self, *, context: dict[str, Any], count: int) -> list[ConceptDraft]: ...
    async def critique_concepts(self, *, context: dict[str, Any], concepts: list[ConceptDraft]) -> list[ConceptCritique]: ...
    async def revise_concepts(self, *, context: dict[str, Any], concepts: list[ConceptDraft], critiques: list[ConceptCritique]) -> list[ConceptDraft]: ...
```

- [ ] **Step 5: Write failing Cloudflare request test**

```python
import httpx
import pytest
from app.cloudflare_creative_director import CloudflareGemmaCreativeDirector


@pytest.mark.asyncio
async def test_song_thesis_uses_cloudflare_account_endpoint_and_bearer_auth():
    seen = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        return httpx.Response(200, json={"result": {"response": '{"core_meaning":"survival","emotional_arc":"contained to defiant","musical_personality":["tense"],"lyrical_world":{"people":[],"objects":[],"places":[],"symbols":[]},"creative_contradiction":"calm vocal over hard drums","signature_moment":"final hook","visual_permissions":[],"visual_bans":[],"artist_role_recommendation":"none","campaign_thesis":"calm control under pressure"}'}})

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

Run: `cd album_cover_backend && python -m pytest -q tests/test_cloudflare_creative_director.py::test_song_thesis_uses_cloudflare_account_endpoint_and_bearer_auth`

Expected: FAIL because `CloudflareGemmaCreativeDirector` does not exist.

- [ ] **Step 7: Implement Cloudflare Gemma adapter**

Implement one private `_run_json(system: str, user: dict[str, Any]) -> dict[str, Any]` helper in `cloudflare_creative_director.py` that POSTs to:

```python
endpoint = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"
headers = {"Authorization": f"Bearer {self.api_token}", "Content-Type": "application/json"}
payload = {
    "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ],
    "temperature": 0.7,
    "max_tokens": 6000,
}
```

Parse JSON from either `result.response` or a string response field. Reject missing credentials with a typed service error rather than making a network call.

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
- Produces: `SongIntelligenceEngine(audio_analyzer, lyrics_analyzer, creative_director)`.
- Produces: `async analyze(audio_path, lyrics_text, creative_controls) -> dict[str, Any]`.
- Stores later in `Generation.analysis_json["song_intelligence"]` and `Generation.analysis_json["song_thesis"]`.

- [ ] **Step 1: Write failing section-summary test**

```python
import numpy as np
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

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_audio_analysis.py::test_section_summary_marks_low_and_high_energy_regions`

Expected: FAIL because `summarize_sections` does not exist.

- [ ] **Step 3: Add deterministic section summary**

Add `summarize_sections(features)` that sorts windows by `start`, finds min/max `energy`, and records adjacent transitions where `abs(delta_energy) >= 0.20`. Do not claim verse/chorus labels. Return neutral `region_1`, `region_2` labels with start/end seconds and normalized descriptors.

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
```

- [ ] **Step 5: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_song_intelligence.py::test_song_intelligence_combines_baseline_analysis_with_thesis`

Expected: FAIL because `SongIntelligenceEngine` does not exist.

- [ ] **Step 6: Implement `SongIntelligenceEngine`**

Create a `synthesize()` method that builds a provider context containing baseline audio, baseline lyrics, sanitized full lyrics, and user creative controls. Convert the returned `SongThesis` with `dataclasses.asdict` and return:

```python
{
    "audio": audio,
    "lyrics": lyrics,
    "song_thesis": asdict(thesis),
    "status": "advanced",
}
```

If the director raises after bounded retries, return the deterministic baseline plus:

```python
{
    "song_thesis": fallback_song_thesis(audio, lyrics),
    "status": "creative_direction_degraded",
}
```

- [ ] **Step 7: Run Song Intelligence tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_song_intelligence.py tests/test_audio_analysis.py tests/test_lyrics_analysis.py`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add album_cover_backend/app/song_intelligence.py album_cover_backend/app/audio_analysis.py album_cover_backend/app/lyrics_analysis.py album_cover_backend/tests/test_song_intelligence.py album_cover_backend/tests/test_audio_analysis.py
git commit -m "feat: build section-aware song intelligence"
```

---

### Task 3: Eight-concept generation, adversarial critique, revision, and diversity quality gate

**Files:**
- Create: `album_cover_backend/app/concept_quality.py`
- Modify: `album_cover_backend/app/cloudflare_creative_director.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Modify: `album_cover_backend/app/concept_ranking.py`
- Test: `album_cover_backend/tests/test_concept_quality.py`
- Test: `album_cover_backend/tests/test_major_label_pipeline.py`

**Interfaces:**
- Produces: `score_concept(concept, song_thesis, creative_controls) -> dict[str, float]`.
- Produces: `select_diverse_concepts(concepts, score_map, count=3) -> list[ConceptDraft]`.
- Consumes: `CreativeDirector.create_concepts`, `critique_concepts`, `revise_concepts`.

- [ ] **Step 1: Write failing diversity-selection test**

```python
from app.concept_quality import select_diverse_concepts
from app.creative_direction import ConceptDraft


def concept(cid, subject, setting, medium, metaphor):
    return ConceptDraft(
        id=cid, name=cid, one_line_pitch=cid, why_it_fits="song-specific",
        subject=subject, artist_presence="hero", setting=setting, action_or_symbol="still",
        wardrobe_or_material="black wool", camera="35mm", composition="centered",
        lighting="soft", medium=medium, palette="black and cream", texture="grain",
        dominant_shape="vertical", visual_metaphor=metaphor, typography_zone="upper-left",
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
    scores = {"a": 96, "b": 95, "c": 94, "d": 91, "e": 90}
    selected = select_diverse_concepts(concepts, scores, count=3)
    assert [item.id for item in selected] == ["a", "d", "e"]
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_concept_quality.py::test_diverse_selector_rejects_three_near_duplicate_portraits`

Expected: FAIL because `concept_quality.py` does not exist.

- [ ] **Step 3: Implement deterministic hard validation and diversity selection**

Implement normalized token sets across `subject`, `setting`, `medium`, `visual_metaphor`, `artist_presence`, and `dominant_shape`. Reject a candidate against an already selected concept when four or more of those six fields are effectively equal. Always sort candidates by numeric score descending first, then greedily select diverse candidates until `count` is reached.

- [ ] **Step 4: Add exact 100-point scoring rubric**

`score_concept()` must return these keys and maximums:

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

The Gemma critic may suggest component scores, but deterministic validation must cap or reject concepts that violate Strict controls, contain prohibited generated-text instructions, or duplicate selected concepts.

- [ ] **Step 5: Write failing pipeline-cycle test**

Create a stub director that records calls and returns eight concepts, eight critiques, then eight revised concepts. Assert the service calls methods in order `create_concepts -> critique_concepts -> revise_concepts` and stores only three concepts with `selected_for_render=True`.

Run: `cd album_cover_backend && python -m pytest -q tests/test_major_label_pipeline.py::test_pipeline_runs_concept_competition_before_rendering`

Expected: FAIL until the service is rewired.

- [ ] **Step 6: Rewire `MajorLabelGenerationService._plan_concepts`**

Replace the single `plan()` call path with:

```python
raw = await self.creative_director.create_concepts(context=context, count=8)
critiques = await self.creative_director.critique_concepts(context=context, concepts=raw)
revised = await self.creative_director.revise_concepts(context=context, concepts=raw, critiques=critiques)
scores = {item.id: score_total(item, thesis, controls) for item in revised}
selected = select_diverse_concepts(revised, scores, count=3)
```

If fewer than three pass the quality floor, request one replacement batch for exactly the number missing. Do not lower the quality floor.

- [ ] **Step 7: Keep legacy Gemini ranking classes out of production orchestration**

The new service must not call `GeminiConceptRanker` or `GeminiCoverCritic` as production selectors. Legacy files can remain temporarily for migration tests, but `main.py` wiring is removed in Task 6.

- [ ] **Step 8: Run concept/pipeline tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_concept_quality.py tests/test_major_label_pipeline.py tests/test_pipeline.py`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add album_cover_backend/app/concept_quality.py album_cover_backend/app/cloudflare_creative_director.py album_cover_backend/app/major_label_service.py album_cover_backend/app/concept_ranking.py album_cover_backend/tests/test_concept_quality.py album_cover_backend/tests/test_major_label_pipeline.py
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
        },
        creative_controls={"creative_strength": "strict", "subject_hint": "woman holding one red glove"},
        visual_bible=None,
        render_index=1,
    )
    assert len(prompt) <= 2048
    assert prompt.index("STRICT USER CONTROL") < 300
    assert prompt.index("NO TITLE") < 1200
    assert "red glove" in prompt
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_render_prompts.py::test_production_brief_keeps_controls_and_no_text_before_cutoff`

Expected: FAIL because `build_production_brief` does not exist.

- [ ] **Step 3: Implement priority-ordered deterministic compression**

Build the prompt in this order:

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

Trim low-priority fields first. Never trim Strict controls or the no-text block. Return at most the first 2048 characters only after field-level compression has guaranteed those priority blocks are present.

- [ ] **Step 4: Wire `_fill_set()` to use the Production Brief Builder**

Replace the current verbose `build_render_prompt()` call for new major-label mode with `build_production_brief()`. Preserve `render_index` so each selected concept receives two controlled executions.

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
- Generation: durable `song_intelligence_json`, `song_thesis_json`, `creative_direction_status`.
- ConceptCandidate: durable pitch, fit rationale, artist presence, wardrobe/material, composition, lighting, texture, dominant shape, visual metaphor, must-include, avoid, critic feedback, revision metadata.

- [ ] **Step 1: Write failing persistence test**

Create a generation with a structured Song Thesis and a concept with expanded fields, commit, reload in a fresh session, and assert all values round-trip.

Run: `cd album_cover_backend && python -m pytest -q tests/test_persistence.py::test_creative_director_metadata_round_trips`

Expected: FAIL because fields do not exist.

- [ ] **Step 2: Add SQLAlchemy fields**

Use JSON for structured report/list fields and Text/String for human-readable scalar fields. Add `creative_direction_status` with default `"pending"`. Do not delete legacy winner columns in this task; that belongs to the text/UI integrity plan so migration risk stays isolated.

- [ ] **Step 3: Add Alembic migration**

The migration adds the new nullable fields and a non-null `creative_direction_status` with temporary server default `pending`, then removes the server default after backfill.

- [ ] **Step 4: Extend response schemas/presentation**

Expose `song_thesis` and `creative_direction_status` on `GenerationResponse`; expose expanded concept metadata on `ConceptResponse`. Do not expose hidden chain-of-thought; only structured conclusions, scores, and concise critique fields.

- [ ] **Step 5: Run migration/persistence/API tests**

Run: `cd album_cover_backend && python -m pytest -q tests/test_persistence.py tests/test_api.py`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add album_cover_backend/app/models.py album_cover_backend/app/schemas.py album_cover_backend/app/presentation.py album_cover_backend/alembic/versions/20260909_03_creative_director_core.py album_cover_backend/tests/test_persistence.py album_cover_backend/tests/test_api.py
git commit -m "feat: persist creative director intelligence"
```

---

### Task 6: Production wiring, degraded-mode status, and health endpoint

**Files:**
- Modify: `album_cover_backend/app/main.py`
- Modify: `album_cover_backend/app/service.py`
- Modify: `album_cover_backend/app/major_label_service.py`
- Modify: `album_cover_backend/app/feedback_generation_service.py`
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
    assert "gemini_creative_director" not in body["providers"]
```

- [ ] **Step 2: Verify RED**

Run: `cd album_cover_backend && python -m pytest -q tests/test_health.py::test_health_reports_cloudflare_creative_director`

Expected: FAIL because health currently reports Gemini provider keys.

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

Do not instantiate Gemini planner/ranker/critic for the production generation service.

- [ ] **Step 4: Update health payload**

Report Cloudflare Creative Director configured state from the same server-side Cloudflare credentials. Keep the FLUX health entry separately. Include `creative_direction_degraded` in generation status/audit data when advanced direction is unavailable.

- [ ] **Step 5: Run backend suite**

Run: `cd album_cover_backend && python -m pytest -q`

Expected: PASS.

- [ ] **Step 6: Compile**

Run: `python -m compileall -q album_cover_backend/app`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add album_cover_backend/app/main.py album_cover_backend/app/service.py album_cover_backend/app/major_label_service.py album_cover_backend/app/feedback_generation_service.py album_cover_backend/tests/test_health.py album_cover_backend/tests/test_pipeline.py
git commit -m "feat: wire Cloudflare major-label creative direction"
```

---

### Task 7: Core plan verification gate

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Produces a reviewable branch where the Creative Director core works independently of the UI/text/reference follow-on plans.

- [ ] **Step 1: Run focused tests**

Run:

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

- [ ] **Step 4: Secret/provider isolation check**

Run:

```bash
! grep -R "OPENAI_API_KEY\|POLLINATIONS" album_cover_backend/app album_cover_backend/.env.example
grep -R "CLOUDFLARE_CREATIVE_DIRECTOR_MODEL" album_cover_backend/app/config.py album_cover_backend/.env.example
```

Expected: first command exit 0; second command prints the new Cloudflare model setting.

- [ ] **Step 5: Review diff and commit any verification-only fixes**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional files changed.

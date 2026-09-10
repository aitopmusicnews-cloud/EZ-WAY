# EZ-WAY Album Cover Major-Label Creative Director Design

Date: 2026-09-09
Status: Approved design, pending user review of written spec
Repository: `aitopmusicnews-cloud/EZ-WAY`

## 1. Purpose

Upgrade EZ-WAY Album Cover Creator from a prompt-driven image generator into a major-label-style creative direction system.

The system must deeply analyze the music and lyrics, form a song-specific creative thesis, generate and critique multiple genuinely different campaign concepts, select the strongest concepts for rendering, and then let the user choose the final cover with no AI winner highlighted.

The image renderer remains Cloudflare Workers AI FLUX.1 Schnell. The new Creative Director uses Cloudflare Workers AI Gemma 4 26B A4B IT for reasoning and vision. OpenAI and Gemini are not required for this architecture.

## 2. Product decisions already approved

The following are fixed requirements, not open questions:

1. The Creative Director behaves like a bold major-label art director. It is allowed to reject obvious ideas and pursue stronger second-order concepts.
2. User Creative Controls remain the highest authority. Strict mode must override automatic creative choices.
3. The system analyzes both music and lyrics before creating concepts.
4. It generates eight raw concepts, critiques them, allows one revision pass, scores them, and selects three meaningfully different concepts.
5. FLUX renders two executions per selected concept for six final images.
6. The six surviving covers are presented equally. There is no AI winner badge, automatic selection, or visual ranking in the UI.
7. Internal quality checks may reject broken or non-compliant renders before presentation.
8. FLUX generates artwork only. It must not intentionally generate title text, artist text, logos, label marks, or a Parental Advisory sticker.
9. EZ-WAY adds title, artist, and optional Parental Advisory after image generation in the compositor.
10. Title and artist each have independent show/hide and styling controls.
11. Parental Advisory is manual only and defaults Off.
12. Artist/character reference is supported where technically possible without falsely promising identity locking from FLUX.1 Schnell.
13. Generate Better uses the user's chosen cover/direction as the source of refinement. The AI does not choose the source cover for the user.

## 3. Current system and constraints

The existing backend already contains:

- deterministic audio analysis using librosa;
- deterministic lyrics analysis;
- signal combination;
- an eight-concept major-label pipeline;
- concept ranking;
- cover criticism;
- Cloudflare FLUX.1 Schnell final rendering;
- post-render typography/compositing;
- Creative Controls for subject, scene, style, composition, color/mood, must-include, avoid, and strength.

The existing `GeminiCreativeDirector` is optional and falls back to a local planner when no Gemini API key is configured. Production currently uses Cloudflare credentials and must not depend on restoring OpenAI or Gemini secrets.

The current Cloudflare FLUX.1 Schnell model is text-to-image and documents a maximum 2048-character prompt. It does not document image/reference input. Therefore, phase one character-reference support must use Gemma vision to convert an uploaded reference image into a structured Artist Visual Bible, then inject the most important identity/style descriptors into concept and render briefs. This improves consistency but is not pixel-level identity locking.

The renderer interface must remain replaceable so a future explicit opt-in reference-capable image model can be added without redesigning the Creative Director pipeline. Such a future renderer is outside the scope of this implementation.

## 4. High-level architecture

```text
MP3 + Lyrics + Release Metadata + Creative Controls + Optional Reference Image
                              |
                              v
                     Song Intelligence Engine
                              |
                              v
                    Structured Song Intelligence
                              |
                    +---------+---------+
                    |                   |
                    v                   v
           Artist Visual Bible   User Creative Controls
             (when supplied)       (highest priority)
                    |                   |
                    +---------+---------+
                              v
                   Gemma Creative Director
                              |
                         8 raw concepts
                              |
                              v
                      Creative Critic
                              |
                     one revision pass
                              |
                              v
                 Deterministic Quality Gate
                              |
                  score + diversity selection
                              |
                         top 3 concepts
                              |
                              v
                    Production Brief Builder
                              |
                              v
                   FLUX.1 Schnell Renderer
                       2 per concept = 6
                              |
                              v
                  Render Compliance Screening
                              |
                              v
                    EZ-WAY Text Compositor
              title / artist / advisory once only
                              |
                              v
                  Six equal user choices
                              |
                              v
                        User selects
```

## 5. Authority hierarchy

Every stage that can make a creative decision must follow this priority order:

1. User Strict Creative Controls
2. Explicit user release metadata and manual display choices
3. Artist Visual Bible when a reference image is supplied
4. Song Intelligence Report
5. Creative Director judgment
6. Renderer interpretation

A lower layer may never silently override a higher layer.

Examples:

- If Strict Subject says "empty church pew with one red glove," the director cannot replace it with an artist portrait because its own concept scores better.
- If the user sets Parental Advisory Off, no content analysis may turn it back on.
- If Show Artist Name is Off, the compositor must not add it.
- If a reference image is supplied, the director may choose a no-person concept when artist presence is not required, but any concept that does use the artist must respect the visual bible.

## 6. Song Intelligence Engine

### 6.1 Goal

Replace shallow aggregate labels such as "dark trap, 82 BPM" with a structured creative interpretation of the record.

### 6.2 Audio analysis

Reuse the existing deterministic audio analyzer, but add a section-aware summary layer.

The analyzer should produce both global measurements and a timeline of meaningful changes. The implementation should avoid pretending it has perfect semantic verse/chorus recognition. It may infer structural regions from novelty, energy, dynamics, spectral and rhythmic change and label them neutrally when confidence is low.

Required musical inputs include:

- tempo and tempo confidence;
- key/scale and confidence;
- overall energy;
- loudness and dynamic range;
- bass ratio and low-mid weight;
- spectral brightness/centroid;
- harmonic/percussive balance;
- onset/beat density;
- texture/style tags already available;
- section or change-point timeline;
- highest-intensity region;
- lowest-intensity region;
- major energy transitions;
- contrast between opening, middle, peak, and ending.

The timeline does not need to store the full waveform. Store compact normalized section descriptors suitable for reasoning and auditing.

### 6.3 Lyrics analysis

Preserve deterministic token/theme extraction for fast baseline signals, but add a Gemma reasoning pass over the full sanitized lyrics when lyrics are available.

The lyrical interpretation schema must include:

- narrator / point of view;
- core conflict;
- emotional arc;
- primary and secondary themes;
- recurring symbols;
- explicit people, objects, places and actions;
- strongest visualizable lyric moments;
- contradictions or double meanings;
- emotional turns;
- supported visual permissions;
- unsupported or cliche visual assumptions to avoid;
- a short summary of what the song is actually saying.

The model should cite lyric evidence internally by short snippets or section references for traceability, but the UI does not need to display the full reasoning trace.

### 6.4 Cross-modal synthesis

A dedicated Song Thesis pass compares the musical arc and lyric story instead of merely concatenating them.

Required output:

```json
{
  "core_meaning": "...",
  "emotional_arc": "...",
  "musical_personality": ["..."],
  "lyrical_world": {
    "people": [],
    "objects": [],
    "places": [],
    "symbols": []
  },
  "creative_contradiction": "...",
  "signature_moment": "...",
  "visual_permissions": [],
  "visual_bans": [],
  "artist_role_recommendation": "hero|partial|silhouette|symbolic|none",
  "campaign_thesis": "..."
}
```

The most important field is `campaign_thesis`: one concise sentence that every concept must answer to.

### 6.5 Second-order concept rule

The Song Thesis must explicitly identify the obvious first-order visual interpretation and ask whether it is too predictable.

Example:

- First-order: heartbreak song -> crying portrait.
- Second-order: pristine celebration table after everyone has left.

The director is encouraged to choose the second-order idea when it is more specific, memorable and emotionally faithful.

## 7. Cloudflare Creative Director

### 7.1 Model

Primary model:

`@cf/google/gemma-4-26b-a4b-it`

Use the existing server-side:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Add non-secret configuration:

- `CLOUDFLARE_CREATIVE_DIRECTOR_MODEL=@cf/google/gemma-4-26b-a4b-it`
- `CLOUDFLARE_CREATIVE_DIRECTOR_TIMEOUT_SECONDS`
- `ENABLE_CLOUDFLARE_CREATIVE_DIRECTOR=true`

Do not add browser-visible Cloudflare credentials.

### 7.2 Interface

Create a provider-neutral Creative Director interface so the major-label service does not depend on a provider class name.

Suggested contract:

```python
class CreativeDirector(Protocol):
    async def build_song_thesis(...) -> SongThesis: ...
    async def create_concepts(...) -> ConceptBatch: ...
    async def critique_concepts(...) -> ConceptCritiqueBatch: ...
    async def revise_concepts(...) -> ConceptBatch: ...
```

The production implementation is `CloudflareGemmaCreativeDirector`.

The old Gemini director can remain as legacy compatibility code initially, but it must not be wired as the production default and its environment variables should be deprecated from the Album Cover deployment docs.

## 8. Concept generation

### 8.1 Raw concept count

Generate exactly eight raw concepts when the Creative Director succeeds.

The eight concepts must be intentionally spread across different visual territories. Suggested territories are guidance, not a rigid template:

- artist-led editorial photography;
- narrative scene;
- symbolic still life;
- fashion/conceptual portrait;
- no-person concept;
- tactile/print/illustration/collage;
- surreal but coherent visual metaphor;
- wildcard art-direction concept.

The director may replace a territory when the song does not support it.

### 8.2 Concept schema

Each concept must include at minimum:

```json
{
  "name": "...",
  "one_line_pitch": "...",
  "why_it_fits": "...",
  "subject": "...",
  "artist_presence": "hero|partial|silhouette|symbolic|none",
  "setting": "...",
  "action_or_symbol": "...",
  "wardrobe_or_material": "...",
  "camera": "...",
  "composition": "...",
  "lighting": "...",
  "medium": "...",
  "palette": "...",
  "texture": "...",
  "dominant_shape": "...",
  "visual_metaphor": "...",
  "typography_zone": "...",
  "must_include": [],
  "avoid": [],
  "image_prompt_seed": "..."
}
```

`why_it_fits` must reference the Song Thesis rather than generic genre language.

### 8.3 Diversity requirements

Concepts are not different if they only change pose, clothing color, background light, crop, or lens.

The batch must differ across several of:

- subject category;
- setting class;
- artist presence;
- camera language;
- dominant shape;
- medium;
- visual metaphor;
- material/texture;
- scale.

At least one surviving candidate should be viable without a visible person unless Strict controls require a person.

## 9. Creative Critic and revision

The Creative Critic is a distinct prompt/persona using the same Cloudflare Gemma model initially. It receives the Song Intelligence Report, Artist Visual Bible if present, Creative Controls, previous-cover history, and eight raw concepts.

Its job is adversarial, not complimentary.

It should explicitly flag:

- concept could fit many unrelated songs;
- genre stereotype substituted for lyric evidence;
- unsupported car, money, city, mansion, motel, smoke, neon, cracked-face/statue or similar AI cliché;
- weak emotional story;
- image likely to look like stock AI art;
- concept duplicates another candidate;
- composition gives no usable typography zone;
- reference-image identity instructions are contradicted;
- concept is too complex for FLUX.1 Schnell to render reliably;
- likely accidental text/signage generation;
- user Strict controls are violated.

Each concept gets one revision pass. The revision must be allowed to rebuild a weak concept rather than merely tweak wording.

## 10. Concept scoring and quality gate

After revision, score each concept to 100 points:

- Song specificity: 25
- Originality: 20
- Emotional power: 15
- Visual memorability / thumbnail strength: 15
- Artist or campaign value: 10
- FLUX executability: 10
- Typography compatibility: 5

A deterministic validator should also enforce hard requirements that a language-model score cannot waive:

- required fields populated;
- Strict controls satisfied;
- concept diversity above threshold;
- no prohibited generated-text instructions;
- artist-reference requirements satisfied when relevant;
- no obvious duplicate concept payloads.

The quality floor should be configurable. Concepts below it are discarded.

If fewer than three concepts survive, the Creative Director performs one replacement-concept attempt for the missing slots. The system must not lower the quality threshold merely to fill the quota.

## 11. Final concept selection

Select three concepts for rendering using both score and diversity.

A simple top-three score sort is not sufficient. The selection algorithm must reject near-duplicate finalists even when all three score highly.

The selected set should maximize:

- total quality score;
- pairwise semantic/visual difference;
- compliance with user controls;
- render feasibility.

Concept selection is an internal production decision. It is not the same as selecting a final cover.

## 12. Artist / character reference

### 12.1 Upload and storage

Add an optional reference-image upload to Album Cover Studio.

Supported initial use cases:

- artist portrait reference;
- recurring fictional character reference;
- wardrobe/style reference supplied by the user.

Store the original reference securely with the generation or artist profile according to the existing storage architecture. Do not expose storage paths directly to the browser.

### 12.2 Artist Visual Bible

Gemma vision analyzes the image and produces a concise structured description:

```json
{
  "reference_type": "artist|character|style",
  "appearance": {
    "skin_tone": "...",
    "hair": "...",
    "facial_hair": "...",
    "distinctive_features": [],
    "apparent_age_range": "..."
  },
  "wardrobe_language": [],
  "accessories": [],
  "attitude": [],
  "visual_identity": [],
  "do_not_change": [],
  "uncertainties": []
}
```

Avoid inferring sensitive personal attributes that are unnecessary for image consistency. Describe only visible creative/appearance information relevant to artwork.

### 12.3 Schnell limitation

FLUX.1 Schnell remains text-to-image. Therefore the Visual Bible is translated into compact text descriptors in phase one.

UI wording must not promise "exact face lock" or "identity lock." Use wording such as:

> Reference guide — helps the Creative Director keep appearance and styling consistent. Exact facial identity may vary with the current renderer.

The architecture may later add a separate opt-in reference-capable renderer, but that is not part of this delivery.

## 13. Production brief builder

The Creative Director output is too verbose to send directly to FLUX.1 Schnell because the renderer has a 2048-character prompt cap.

Create a deterministic Production Brief Builder that compresses each selected concept into a priority-ordered render prompt.

Prompt order:

1. Strict user controls
2. reference identity descriptors when relevant
3. exact subject and action
4. setting
5. composition/camera
6. lighting
7. medium/texture
8. palette
9. must-include objects
10. explicit avoid/no-text instruction
11. variation-specific execution note

The high-priority content must fit before the 2048-character truncation point.

Do not rely on appending a generic negative block after a long concept description.

## 14. FLUX rendering

Production image model remains:

`@cf/black-forest-labs/flux-1-schnell`

Render two executions for each of the three selected concepts, for six intended covers.

The two executions should preserve the concept's central story while varying execution details such as crop, camera distance, lighting nuance, material treatment, or pose where appropriate.

They must not mutate into different concepts.

Every render prompt must contain a compact high-priority instruction equivalent to:

- artwork only;
- no title;
- no artist lettering;
- no typography;
- no logos;
- no record-label marks;
- no Parental Advisory sticker;
- avoid readable signage unless the concept explicitly requires it and the user has approved it.

## 15. Render compliance screening

Before text compositing, inspect each raw render for obvious failure conditions.

Phase one screening can combine deterministic image checks with Gemma vision where useful.

Hard failure examples:

- corrupted/unreadable image;
- wrong dimensions after normalization;
- obvious duplicate of another render;
- prominent generated title/artist-like text when artwork-only was required;
- prominent fake Parental Advisory mark;
- major violation of Strict subject/scene controls;
- gross character/reference mismatch when the concept explicitly uses the artist.

The screening system may reject and retry a failed render within existing retry limits.

It must not silently rank the surviving images for the user.

## 16. Title, artist and Parental Advisory compositor

### 16.1 Root cause to remove

The generated artwork and post-render compositor must not both be responsible for release text. Text ownership belongs only to the compositor.

### 16.2 Independent text controls

Title controls:

- Show Title toggle, default On when a title exists;
- title text;
- font family/style;
- size preset or bounded slider;
- position preset;
- alignment;
- case treatment;
- color/treatment.

Artist controls:

- Show Artist toggle, default On when artist exists;
- artist display text;
- font family/style;
- size preset or bounded slider;
- position preset;
- alignment;
- case treatment;
- color/treatment.

The title and artist controls are independent.

### 16.3 Parental Advisory

Replace any implicit/automatic behavior with an explicit user-controlled toggle.

Rules:

- default Off;
- no lyrics/genre/content classifier may enable it automatically;
- when Off, it must be omitted from both prompt and compositor;
- when On, compositor controls sticker position and size;
- the renderer must still be instructed not to draw its own sticker.

### 16.4 Exactly-once text invariant

For each final cover:

- raw render has no intentional release text;
- compositor draws title at most once;
- compositor draws artist at most once;
- compositor draws Parental Advisory at most once and only when manually enabled.

Add regression tests for this invariant.

## 17. Six-cover presentation: no AI winner

The current backend may calculate critic or quality scores for production diagnostics. Those scores must not automatically choose the user's final cover.

The Album Cover Studio results UI must:

- show all six surviving images at equal dimensions and equal visual emphasis;
- not label any image "winner," "best," "recommended," or equivalent;
- not preselect an image;
- not reorder images by AI quality score after rendering;
- group by concept only if the grouping is visually neutral;
- let the user select one cover explicitly.

If fewer than six covers survive after retries, show the surviving covers equally and clearly state how many succeeded. Do not fabricate filler images.

## 18. Generate Better

Generate Better becomes user-directed refinement.

Required flow:

1. User explicitly selects a source cover.
2. System retrieves the source concept, render brief, compliance notes and critic observations.
3. Creative Director identifies what to preserve and what to improve.
4. User's current Creative Controls are applied at highest priority.
5. Director generates a refinement set that maintains the chosen idea unless the user asks for a new direction.
6. New covers are presented equally with no AI winner.

The AI may provide hidden production critique but does not choose which original cover deserves improvement.

## 19. API and data model changes

The exact migration shape may be adjusted during implementation, but the architecture requires durable typed storage for the following concepts.

### 19.1 Generation-level inputs

Add or normalize:

- `show_title`
- `show_artist`
- title typography settings
- artist typography settings
- `parental_advisory` manual boolean, default false
- advisory position/size settings
- optional reference image id
- reference type
- Artist Visual Bible JSON
- Song Intelligence JSON
- Song Thesis JSON

### 19.2 Concept-level data

Extend concept candidate storage with:

- one-line pitch;
- why-it-fits;
- artist presence;
- wardrobe/material;
- composition;
- lighting;
- texture;
- dominant shape;
- visual metaphor;
- must-include list;
- avoid list;
- raw critic feedback;
- revised-from concept id or revision metadata;
- score breakdown.

### 19.3 Variation-level data

Store:

- final compressed render prompt;
- concept id;
- render index;
- compliance result;
- retry/rejection reason if applicable;
- raw artwork path;
- composited cover path or enough information to reproduce it deterministically.

Prefer preserving the raw artwork separately from final typography output so text choices can be changed without paying for another FLUX render.

## 20. Cache behavior

Existing generation caching must include all creative inputs that materially affect output.

At minimum cache identity must account for:

- audio hash;
- sanitized lyrics;
- title and artist metadata where they affect the creative brief;
- Creative Controls;
- reference-image identity/hash;
- reference type;
- Creative Director model/version;
- relevant prompt/schema version.

Typography-only changes should not invalidate the expensive raw-artwork generation cache when the raw render can be recomposited locally.

## 21. Error handling and fallback policy

### 21.1 Creative Director unavailable

Do not silently pretend the local fallback is equivalent to the major-label Creative Director.

If Gemma is unavailable after retries:

- preserve the existing safe local planner as degraded-mode fallback;
- mark the generation/audit trail as `creative_direction_degraded`;
- display a concise non-blocking status in the UI that advanced Creative Direction was unavailable for this set;
- never switch to OpenAI or Gemini automatically.

### 21.2 Reference analysis unavailable

If the reference image cannot be analyzed:

- continue only if the user did not mark reference fidelity as required;
- otherwise stop before paid renders and ask the user to retry/remove the reference.

### 21.3 Render failures

Reuse bounded retry behavior. Do not loop indefinitely.

If a specific concept repeatedly fails compliance, replace that render or concept rather than spending all retries on the same impossible instruction.

## 22. Security and privacy

- Cloudflare token and account ID remain server-side only.
- No `VITE_*` Cloudflare secret variables.
- Reference images are treated as user-provided private creative assets.
- Do not expose raw storage paths.
- Do not log image bytes or secret headers.
- Audit logs may include model name, request id, prompt version, concept ids and sanitized failure reason.
- Avoid unnecessary sensitive-attribute inference from artist reference images.

## 23. Observability

Add audit events/timing for:

- audio analysis;
- lyric reasoning;
- Song Thesis creation;
- reference-image analysis;
- raw concept generation;
- critique;
- revision;
- deterministic concept validation;
- concept selection;
- prompt compression;
- each FLUX render;
- compliance screening;
- typography composition;
- user selection;
- Generate Better source selection.

Metrics should distinguish:

- Creative Director success vs degraded fallback;
- concepts generated / rejected / replaced;
- renders attempted / retried / rejected by compliance;
- reference-image usage;
- accidental generated-text rejection rate;
- average six-cover completion rate.

Do not expose an AI winner metric in the user-facing selection UI.

## 24. Configuration changes

Expected production settings:

```text
CLOUDFLARE_ACCOUNT_ID=<server secret>
CLOUDFLARE_API_TOKEN=<server secret>
CLOUDFLARE_CREATIVE_DIRECTOR_MODEL=@cf/google/gemma-4-26b-a4b-it
ENABLE_CLOUDFLARE_CREATIVE_DIRECTOR=true
CLOUDFLARE_FLUX_MODEL=@cf/black-forest-labs/flux-1-schnell
CONCEPT_COUNT=8
SELECTED_CONCEPT_COUNT=3
RENDERS_PER_CONCEPT=2
```

`variation_count` and UI behavior must be reconciled with the new fixed six-cover major-label mode. The API should remain backward-compatible where feasible, but the primary Album Cover Studio flow should request six final covers.

## 25. Suggested implementation boundaries

Prefer focused modules instead of continuing to grow `major_label_service.py`.

Suggested new/updated units:

- `song_intelligence.py` — orchestration and cross-modal Song Thesis schema;
- existing `audio_analysis.py` — add section/change-point summary without provider calls;
- existing `lyrics_analysis.py` — retain deterministic baseline;
- `cloudflare_creative_director.py` — Gemma provider adapter only;
- `creative_direction.py` — provider-neutral concept/critique/revision orchestration;
- `artist_visual_bible.py` — reference-image schema and Gemma vision analysis;
- `concept_quality.py` — deterministic hard validators and diversity selection;
- `render_prompts.py` — deterministic 2048-character production brief compression;
- `render_compliance.py` — artwork-only/reference/control compliance checks;
- `typography.py` / compositor module — independent title/artist/advisory controls;
- `major_label_service.py` — orchestration only;
- `AlbumCoverStudio.tsx` — controls and neutral six-cover presentation;
- `albumCoverStudio.ts` — typed request/response transport.

The exact filenames may change during implementation if an existing module already provides a cleaner boundary, but responsibilities should remain isolated.

## 26. Testing strategy

Implementation follows TDD for each behavior change.

### 26.1 Song Intelligence tests

- deterministic section summary on synthetic changing-energy audio;
- lyric story schema validation;
- cross-modal contradiction extraction with mocked Gemma transport;
- visual permissions/bans preserved.

### 26.2 Creative Director tests

- Cloudflare request uses only Cloudflare credentials;
- structured concept schema parsing;
- exactly eight raw concepts;
- Strict controls present at highest priority;
- one critique/revision cycle;
- degraded local fallback clearly marked;
- no automatic OpenAI/Gemini fallback.

### 26.3 Concept quality tests

- clichés/unsupported props can be rejected;
- near-duplicate concepts cannot fill all three selected slots;
- fewer than three quality concepts triggers one replacement attempt;
- quality threshold is not silently lowered.

### 26.4 Reference tests

- image analyzed into Visual Bible via mocked Gemma vision call;
- reference hash participates in generation cache identity;
- unsupported exact-identity claims are not made by UI;
- no sensitive inference beyond visible creative descriptors.

### 26.5 Renderer/prompt tests

- FLUX remains `@cf/black-forest-labs/flux-1-schnell` by default;
- prompt length <= 2048;
- Strict controls occur before lower-priority prose;
- no-text/title/artist/advisory instruction remains before cutoff;
- two executions preserve the same concept.

### 26.6 Typography regression tests

- title composited exactly once;
- artist composited exactly once when enabled;
- artist absent when disabled;
- Parental Advisory defaults Off;
- content/lyrics do not auto-enable advisory;
- advisory appears exactly once only when enabled;
- typography-only changes can recomposite from raw artwork without another FLUX call.

### 26.7 User-choice tests

- six covers render as equal choices;
- no AI winner/recommended badge;
- no preselection;
- result ordering is not based on critic score;
- Generate Better requires an explicit user-selected source cover.

### 26.8 Existing regression gates

Keep and run:

- full Album Cover backend pytest suite;
- Cloudflare FLUX renderer regression;
- frontend Album Cover integration tests;
- full relevant EZ-WAY Node tests;
- TypeScript/lint;
- production Vite build;
- secret-isolation/no-Pollinations checks.

## 27. Rollout plan

Deliver incrementally behind configuration flags where useful, but do not expose a half-wired user flow.

Recommended rollout order:

1. Provider-neutral Creative Director interface and Cloudflare Gemma adapter.
2. Song Intelligence schemas and reasoning pass.
3. Eight-concept generation, critique, revision and deterministic three-concept selection.
4. Six-render production brief pipeline.
5. Artwork-only compliance screening and duplicate-text fix.
6. Independent title/artist controls and manual advisory.
7. Neutral six-cover UI with no AI winner.
8. Artist/character reference upload and Visual Bible.
9. Generate Better based on explicit user-selected source.
10. Production deployment with end-to-end smoke test using a real song/lyrics pair.

Use immutable ECR tags for backend releases. Do not overwrite the currently working image tag.

## 28. Acceptance criteria

The feature is complete only when all of the following are true:

1. Production Album Cover creation uses Cloudflare Gemma 4 as the advanced Creative Director and Cloudflare FLUX.1 Schnell as renderer.
2. No OpenAI or Gemini credential is required for the new flow.
3. A song with audio and lyrics produces a structured Song Thesis before concept creation.
4. Eight raw concepts are created, critiqued and revised.
5. Three quality, meaningfully different concepts are selected for rendering.
6. Two renders per selected concept produce up to six final covers.
7. The user sees no AI winner and must explicitly choose a cover.
8. Strict user controls override Creative Director choices.
9. FLUX prompts prioritize artwork-only/no-text requirements before the 2048-character cutoff.
10. Title is never intentionally generated by FLUX and is composited at most once.
11. Artist name is independently configurable and composited at most once.
12. Parental Advisory defaults Off and cannot be auto-enabled by lyrics, genre or analysis.
13. Raw artwork is preserved so typography can be changed without rerendering where practical.
14. Optional reference images generate an Artist Visual Bible and influence artist-present concepts without promising exact identity lock.
15. Generate Better starts from the user's selected cover/direction.
16. Full backend tests, integration tests, lint, build and production health verification pass before deployment is declared complete.

## 29. Explicit non-goals for this delivery

- Training or fine-tuning a custom image model.
- Face embedding / biometric identity recognition.
- Guaranteed exact facial identity preservation with FLUX.1 Schnell.
- Automatically choosing the user's final cover.
- Replacing FLUX.1 Schnell with another renderer without a separate approved decision.
- Restoring OpenAI or Gemini credentials.
- Adding Pollinations.
- Building an unrelated standalone Album Cover frontend.

## 30. References

Official Cloudflare documentation verified during design:

- Gemma 4 26B A4B IT: https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- FLUX.1 Schnell: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- Cloudflare Workers AI model catalog: https://developers.cloudflare.com/workers-ai/models/

## 31. Final design statement

EZ-WAY owns the creative pipeline. Gemma acts as the major-label Creative Director and critic. FLUX acts as the image-maker. The compositor owns release typography. The user owns the final decision.

The system should spend reasoning before it spends renders, prefer song-specific second-order ideas over genre clichés, keep user controls supreme, and present six professionally directed options without pretending the AI knows which cover the artist should release.

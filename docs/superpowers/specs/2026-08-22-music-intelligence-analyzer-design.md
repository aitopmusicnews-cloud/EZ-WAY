# EZ-WAY Music Intelligence Analyzer Design

## Goal
Replace the broken Web Audio DSP / Cognitive AI analysis choice with one automatic, shared music-analysis pipeline that runs for every newly uploaded track, saves one reusable result, and supplies consistent song facts to the entire EZ-WAY application.

## Product requirements
- New tracks are analyzed automatically during upload.
- Core analysis must not require GPT/OpenAI or another per-song language-model API.
- No TPU is required.
- Use the existing EZ-WAY Audio Tools/Modal deployment instead of introducing another hosted vendor.
- Analyze a track once and reuse the saved result everywhere.
- Re-analyze only when explicitly requested or when the source audio is replaced.
- Preserve existing lyrics and stem-separation workflows.
- Preserve current Track fields for backwards compatibility while adding a richer shared Song Profile.
- Do not invent low-confidence song facts.

## Architecture

### 1. Music Intelligence worker
Add a new `analysis` action to a v5 Audio Tools worker. The worker downloads the cloud-accessible track file and runs two specialized models:

- **All-In-One-Infer** for tempo, beats/downbeats, and functional song sections such as intro, verse, chorus, bridge, break, solo, instrumental, and outro.
- **LAION CLAP music model** through Hugging Face Transformers for zero-shot multi-label classification of genre, subgenre/style, mood, and instrument/production concepts.

The existing Modal model/cache volume is reused. GPU acceleration may be used when configured, but the structure analyzer supports CPU execution and no TPU is required.

### 2. Evidence-first profile
The worker returns a normalized `MusicIntelligenceProfile` rather than marketing prose. The profile contains:

- analyzer version and timestamp
- BPM and confidence
- musical key/Camelot from the existing browser DSP as a compatibility signal until a dedicated full-track key estimator is added
- primary genre plus ranked genre candidates
- ranked mood/style candidates
- ranked instrument/production candidates
- song sections with start/end/label and confidence
- derived YouTube chapters
- concise search concepts/keywords grounded in the detected music traits
- evidence/model identifiers and warnings

A label is not represented as certain when evidence is weak. Confidence values are explicit.

### 3. Persistence
Create a `track_analysis` table keyed by `track_id` with a JSONB `profile` column and analyzer version metadata. This keeps the full profile separate from the legacy `tracks` row while allowing every app feature to fetch the same canonical result.

For backwards compatibility, the upload flow also copies the primary BPM, key, genre, mood, vibe/style, instrument labels, and compact keywords into the existing `tracks` fields/tags.

### 4. Upload behavior
The upload order becomes:

1. Extract duration in browser.
2. Upload the audio master so a cloud URL exists.
3. Create the track row with `status = processing`.
4. Submit one `analysis` job to Audio Tools.
5. Poll until complete.
6. Save the canonical profile to `track_analysis`.
7. Update legacy Track BPM/key/tags and set `status = ready`.
8. On analyzer failure, keep the uploaded track, set `status = error`, and show a retryable error rather than fabricating metadata.

Bulk uploads remain sequential so the app does not hammer the worker.

### 5. App-wide service
Add a focused client service exposing:

- `analyzeTrackMusicIntelligence(track)`
- `getTrackMusicIntelligence(trackId)`
- `saveTrackMusicIntelligence(trackId, profile)`
- `profileToLegacyTrackUpdates(profile)`

Any EZ-WAY feature can import this service. YouTube, A&R, Music Video Maker, promo tools, search/filtering, and future features consume the saved profile instead of re-analyzing the audio.

### 6. Cost controls
- No GPT/OpenAI calls in core analysis.
- No DataForSEO calls.
- No Gemini call is required to determine acoustic facts.
- One analysis job per uploaded audio master.
- Model files are cached in the existing Modal Volume.
- Existing Gemini features remain separate and optional for writing/creative copy only.

## Accuracy strategy
- Structure is based on All-In-One-Infer's trained functional-structure model rather than heuristic BPM/frequency buckets.
- Genre/mood/instruments use CLAP audio-text similarity over controlled taxonomies and multiple windows of the track, then aggregate probabilities rather than forcing one label from a single short window.
- The profile includes alternatives and confidence instead of claiming certainty when genres overlap.
- Existing browser DSP remains available only as a low-cost compatibility/fallback signal for BPM/key; its hard-coded genre/mood/instrument decision tree is no longer the canonical source.

## Failure behavior
- Missing cloud URL: analysis is not submitted.
- Worker/model error: store an error state; do not generate fake labels.
- Low-confidence classification: return `uncertain` warnings and ranked alternatives.
- Existing saved profile: reuse it unless `force=true` or the audio source changes.

## Out of scope for this pass
- YouTube copy generation and live keyword-volume research.
- Redesigning the A&R page UI.
- Replacing existing lyrics/stems workflows.
- Mastering/loudness engineering metrics that are not needed for app-wide metadata.

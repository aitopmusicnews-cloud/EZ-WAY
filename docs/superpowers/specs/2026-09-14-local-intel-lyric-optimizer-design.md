# Local Intel Lyric Optimizer Design

Date: 2026-09-14
Status: Proposed for implementation after user review
Branch: `feat/local-intel-lyric-optimizer`

## Summary

Replace EZ-WAY's current browser-based lyric extraction pipeline with a local Python companion service built around `faster-whisper`, optimized for Intel CPU execution with `device="cpu"` and `compute_type="int8"`. Keep stem separation as a separate existing browser feature. Extend the local companion so it can also perform lyric-focused keyword/tag research and build the strict lyric-video description prompt requested for the YouTube Hub.

The production EZ-WAY web app remains hosted normally. When the user runs lyric/SEO tools from the Intel computer, the browser talks to a loopback-only Python service such as `http://127.0.0.1:8765`. The service never binds publicly by default.

## Goals

1. Remove the existing browser Whisper lyric transcription path and replace it with free local `faster-whisper` inference on the user's Intel CPU.
2. Accept MP3 and WAV inputs and return clean lyric text plus timestamped segments, language, and language probability.
3. Preserve the existing track-level `lyrics` field so downstream features, including YouTube SEO generation, continue to work without a schema migration.
4. Keep stem separation available and independent; removing lyric extraction must not remove HTDemucs stem separation.
5. Add a local lyric-focused SEO research API using YouTube autocomplete modifiers and YouTube Data API v3 competitor metadata.
6. Keep the already-merged browser OAuth SEO research as a fallback when the local companion is unavailable or a local YouTube API key is not configured.
7. Keep the existing Gemini metadata generator, but feed it extracted lyrics and enforce the same strict lyric-video description contract.
8. Provide clear install/start instructions suitable for an Intel CPU machine.

## Non-goals

- No NVIDIA/CUDA support is required for this change.
- No cloud-hosted Whisper inference is introduced.
- No OpenAI API transcription is used.
- No track database schema change is required.
- No replacement of the existing stem-separation feature.
- No HTML scraping of YouTube pages. Competitor metadata comes from the official YouTube Data API where available.
- No promise that YouTube Data API search results exactly match the consumer YouTube ranking UI; the product wording will say "top relevant lyric videos."

## Current State

EZ-WAY currently handles lyric extraction inside the browser. `src/services/browserAudioTools.ts` decodes the source audio, sends stereo PCM into `runLyricsPipelineLocally`, and uses `buildLyricsFiles` to produce timestamped LRC and plain-text lyrics. `src/services/lyricsWorkerClient.ts` delegates the work to `src/workers/lyricsPipeline.worker.ts`, which combines HTDemucs vocal isolation with an ONNX Whisper Tiny model in a Web Worker.

`src/components/TrackOptionsMenu.tsx` exposes this flow as "Synced Lyrics" and writes the resulting lyric string back to `track.lyrics`.

The YouTube Hub already has lyric-first SEO generation and browser OAuth research. This design reuses that work rather than replacing it wholesale.

## Recommended Architecture

### 1. Local Python companion

Add a new top-level package:

```text
local_lyric_optimizer/
  __init__.py
  app.py
  config.py
  transcriber.py
  seo.py
  description.py
  requirements.txt
  .env.example
  README.md
  tests/
```

Use FastAPI for a small loopback HTTP API. Default bind address: `127.0.0.1`. Default port: `8765`.

The service loads the Whisper model lazily on first transcription request and reuses the model for later requests. Default model size is `small`; an environment variable may switch to `base`.

Model configuration:

```python
WhisperModel(
    model_size,
    device="cpu",
    compute_type="int8",
    cpu_threads=configured_thread_count,
)
```

`cpu_threads` is configurable rather than hard-coded because Intel systems vary. The default will use a conservative detected CPU count with an explicit override such as `LYRIC_CPU_THREADS`.

### 2. Browser client

Add a focused TypeScript service such as:

```text
src/services/localLyricOptimizer.ts
```

Responsibilities:

- health-check the loopback service;
- upload the selected MP3/WAV file as multipart form data;
- normalize service errors into user-facing messages;
- return clean transcript text plus timestamps;
- optionally call local SEO research and prompt-builder endpoints;
- expose a single configured base URL, defaulting to `http://127.0.0.1:8765`.

The browser must not send requests to arbitrary LAN addresses. Only the configured loopback origin is allowed by default.

### 3. Existing application integration

`TrackOptionsMenu.tsx` changes the lyric action from the current browser WASM pipeline to the local Python client. Suggested label: **Extract Lyrics — Local Intel**.

On success:

- save clean untimestamped text to `track.lyrics`;
- retain returned segments to build optional `.lrc` and `.txt` downloads through the existing `buildLyricsFiles` utility;
- keep the same downstream track update behavior so YouTube Hub immediately sees the new lyrics.

`browserAudioTools.ts` keeps the stem-separation branch. Its lyric branch is removed or redirected to the local companion so no browser Whisper model is loaded.

### 4. YouTube SEO integration

The new Python companion implements lyric-focused SEO research for completeness and local use. The existing browser OAuth SEO research remains available as fallback.

Primary local SEO flow:

1. Build modifier queries from a seed such as song title plus artist:
   - base seed
   - `lyrics`
   - `lyric video`
   - `karaoke`
   - `clean lyrics`
2. Query the YouTube-scoped Google Suggest endpoint and collect suggestions in stable order.
3. If `YOUTUBE_API_KEY` exists, call `youtube/v3/search` for the top 10 relevant video results using `<seed> lyrics`.
4. Call `youtube/v3/videos?part=snippet` for those IDs and read public `snippet.tags` where present.
5. Normalize, count, and rank tags.
6. Prioritize foundational lyric intent terms before competitor and genre terms.

Foundational lyric terms include:

```text
lyrics
lyric video
lyrics video
sing along
clean lyrics
official lyrics
```

Competitor tags are deduplicated case-insensitively. Repeated competitor tags receive more weight than one-off tags, but the system does not blindly copy every competitor tag.

If the local service has no YouTube API key, the frontend can still use the already-existing OAuth-backed YouTube research path.

## HTTP API Contract

### `GET /health`

Purpose: detect whether the local companion is running and expose non-sensitive runtime metadata.

Example response:

```json
{
  "ok": true,
  "service": "ezway-local-lyric-optimizer",
  "model": "small",
  "device": "cpu",
  "compute_type": "int8"
}
```

Do not expose API keys, filesystem paths, or environment secrets.

### `POST /lyrics/transcribe`

Request: multipart form data.

Fields:

- `file`: MP3 or WAV audio file.
- optional `language`: ISO language code; blank means auto-detect.

Validation:

- allow `.mp3` and `.wav` only;
- reject empty files;
- enforce a configurable upload-size limit;
- write to a temporary file and delete it in `finally`.

Response:

```json
{
  "text": "clean lyric text",
  "language": "en",
  "language_probability": 0.98,
  "segments": [
    {"start": 0.0, "end": 3.2, "text": "First line"}
  ]
}
```

Text formatting rules:

- trim leading/trailing whitespace;
- one segment per line for the base clean transcript;
- collapse accidental repeated whitespace;
- do not invent missing lyrics;
- do not repeat obvious adjacent duplicate segments.

The transcriber will use VAD filtering where appropriate and a lyric-friendly transcription configuration, but the first implementation will avoid aggressive post-processing that could silently rewrite the artist's words.

### `POST /seo/research`

Request JSON:

```json
{
  "seed": "Song Name Artist Name",
  "genre": "R&B"
}
```

Response JSON:

```json
{
  "queries": ["..."],
  "suggestions": ["..."],
  "competitor_tags": ["..."],
  "ranked_tags": ["lyrics", "lyric video", "..."]
}
```

If Google Suggest fails, return an empty suggestions array and still provide deterministic modifier queries. If the YouTube API key is missing, return modifier/suggestion results and a machine-readable warning so the frontend may use its OAuth fallback.

### `POST /seo/description-prompt`

Request JSON includes:

- song title;
- artist;
- genre;
- mood;
- lyrics;
- optional streaming links;
- optional credit values.

Response contains a complete prompt string for the existing AI metadata generator and a deterministic description skeleton for preview/fallback.

## Description Contract

The generated YouTube description must follow this order:

```text
<Line 1: Song Title — Artist | Genre>
<Line 2: engaging search-optimized mood/hook>

🎧 STREAM / DOWNLOAD
Spotify: <actual link or placeholder>
Apple Music: <actual link or placeholder>
Amazon Music: <actual link or placeholder>

📝 LYRICS
<full extracted lyrics or [PASTE_LYRICS_HERE]>

🎼 CREDITS
Producer(s): <value or placeholder>
Songwriter(s): <value or placeholder>
Vocalist(s): <value or placeholder>
Video / Visual Credit: <value or placeholder>
```

The Gemini system prompt in `server.ts` remains the actual AI generator used by EZ-WAY. It must match this same contract and must be given the extracted full lyrics. The Python prompt builder exists so the local companion is complete, testable, and usable independently, not to create a second AI provider.

## Browser / Localhost Security

The service is loopback-only by default and will use explicit CORS allowlists.

Allowed origins should include:

- the production EZ-WAY origin;
- the Amplify origin if still needed for direct testing;
- local Vite development origins.

No wildcard CORS origin when credentials are involved.

Modern browsers may gate public-site-to-loopback requests behind Local Network Access / loopback permission. The frontend must therefore distinguish:

- service not running;
- request blocked by browser permission;
- CORS failure;
- transcription failure.

The UI should provide a short remediation message instead of a generic network error.

## Configuration

Local service environment variables:

```text
LYRIC_MODEL_SIZE=small
LYRIC_CPU_THREADS=<optional integer>
LYRIC_SERVICE_HOST=127.0.0.1
LYRIC_SERVICE_PORT=8765
LYRIC_MAX_UPLOAD_MB=<sensible default>
YOUTUBE_API_KEY=<optional>
EZWAY_ALLOWED_ORIGINS=<comma-separated origins>
```

Frontend environment variable:

```text
VITE_LOCAL_LYRIC_OPTIMIZER_URL=http://127.0.0.1:8765
```

The frontend default may use that loopback URL when the variable is omitted, but production UX must clearly state that the companion app must be running on the same computer.

## Installation Contract

The local package README will document an isolated virtual environment and Intel CPU installation. Core dependency installation will include:

```bash
python -m venv .venv
```

Then platform-appropriate activation followed by:

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

`requirements.txt` will include at minimum:

```text
faster-whisper
fastapi
uvicorn[standard]
python-multipart
requests
```

A system FFmpeg install is not a required dependency for `faster-whisper`'s normal audio decoding path because it uses PyAV, but the README will avoid claiming that every unrelated audio workflow in EZ-WAY is FFmpeg-free.

## Removal Plan

Remove only the obsolete browser lyric transcription path after the replacement tests are green.

Expected removals or dead-code cleanup:

- `src/services/lyricsWorkerClient.ts` if no other feature uses it;
- `src/workers/lyricsPipeline.worker.ts`;
- any lyrics-only browser Whisper model loading code and tests that assert that implementation.

Keep:

- `src/services/lyricsCore.ts` because its LRC/plain formatting remains useful;
- `src/services/demucsCore.ts` and stem worker code used by stem separation;
- existing YouTube SEO browser research as fallback;
- `Track.lyrics` and current YouTube description consumers.

Before deletion, repository-wide references will be checked so shared code is not removed accidentally.

## Error Handling

### Service unavailable

UI: "Local Lyrics Service is not running on this computer. Start it, then try again."

### Browser permission / loopback blocked

UI explains that the browser blocked access to the local companion and that loopback/local-network permission may need to be allowed.

### Unsupported file

Return HTTP 415 with a clear MP3/WAV-only message.

### Model initialization failure

Return HTTP 503 with a concise model-load error. Do not leak stack traces to the browser in production mode.

### No usable transcript

Return HTTP 422 and leave existing track lyrics unchanged.

### SEO provider failure

Return partial results where possible. Autocomplete failure must not erase deterministic modifiers. Missing YouTube API key must not break the existing browser OAuth fallback.

## Testing Strategy

Use TDD for implementation.

### Python tests

- Intel model factory uses `device="cpu"` and `compute_type="int8"`.
- configured model size defaults to `small` and accepts `base`.
- `cpu_threads` override is honored.
- MP3/WAV validation and temp-file cleanup.
- transcript formatter removes adjacent duplicate segments without rewriting wording.
- modifier query generation includes base, lyrics, lyric video, karaoke, and clean lyrics.
- autocomplete result dedupe preserves order.
- competitor tag ranking prioritizes lyric tags and repeated competitor tags.
- missing YouTube API key returns a partial-result warning rather than crashing.
- description prompt contains all required sections and full lyrics.
- health endpoint contains no secret values.

Whisper inference itself will be mocked in routine CI so GitHub Actions does not download a model for unit tests.

### TypeScript tests

- local lyric client sends multipart audio correctly;
- service health detection and error mapping;
- track menu lyric action calls the local service, not the old worker;
- successful transcript updates `track.lyrics`;
- no transcript leaves existing lyrics unchanged;
- LRC/plain downloads can still be built from returned segments;
- stem separation still uses the existing path;
- YouTube description uses the newly extracted full lyrics;
- SEO falls back to current browser OAuth research when the local API-key route is unavailable.

### Build / regression verification

Run focused Python tests, existing relevant TypeScript tests, YouTube lyric SEO tests, stem-separation tests, and a production Vite build. Existing unrelated failures must be distinguished from regressions introduced by this change.

## Rollout

1. Add the local Python companion and tests without deleting the old extractor.
2. Add the TypeScript loopback client and UI integration behind the lyric action.
3. Verify transcription response handling with mocked/local fixtures.
4. Switch the lyric action to the new companion.
5. Verify track lyrics flow into YouTube SEO and description generation.
6. Remove obsolete browser Whisper lyric code only after references and tests confirm it is unused.
7. Commit on the feature branch and open a PR; do not merge until verification is green and the user requests merge.

## Acceptance Criteria

The change is complete when all of the following are true:

- Clicking the lyric extraction action no longer loads browser Whisper or the combined lyrics Web Worker.
- MP3 and WAV files can be transcribed by a local Python service using `faster-whisper` on CPU int8.
- Clean full lyrics are stored in `track.lyrics` and are immediately available to YouTube description generation.
- Optional timestamped LRC/plain lyric downloads remain available.
- Stem separation still works independently.
- Local SEO research returns modifier suggestions and ranked lyric-focused tags.
- Missing local YouTube API credentials do not disable the existing browser OAuth SEO fallback.
- The AI description contract contains title/artist/genre/mood hook, Spotify/Apple/Amazon, full lyrics, and Producer/Songwriter/Vocalist/Visual credits.
- The local service is loopback-only by default and uses explicit CORS allowlists.
- Focused Python/TypeScript tests and production build are green before merge.

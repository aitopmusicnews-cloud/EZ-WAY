# Local Intel Lyric Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EZ-WAY's browser Whisper lyric extractor with a loopback-only Python Faster Whisper service optimized for Intel CPU, while preserving stem separation and adding local lyric SEO research with the existing OAuth path as fallback.

**Architecture:** `runLocalAudioTool(track, 'lyrics')` remains the app-level entry point. Its lyric branch sends the original MP3/WAV file to `http://127.0.0.1:8765`; the Python service returns clean text plus timestamped segments. The browser uses those segments for optional LRC/plain downloads and stores clean text in `Track.lyrics`. The existing browser HTDemucs stem path stays unchanged.

**Tech Stack:** Python 3, Faster Whisper, FastAPI, Uvicorn, Requests, React/Vite/TypeScript, Node test runner, existing YouTube OAuth bridge.

**Spec:** `docs/superpowers/specs/2026-09-14-local-intel-lyric-optimizer-design.md`

## Global Constraints

- Faster Whisper uses `device="cpu"` and `compute_type="int8"`.
- Default model is `small`; `base` is supported.
- Default threads are `max(1, min(8, os.cpu_count() or 4))`; `LYRIC_CPU_THREADS` overrides them.
- Only MP3 and WAV are accepted; default upload limit is 250 MB.
- Service binds to `127.0.0.1:8765` by default.
- CORS uses an explicit allowlist; never `*`.
- No OpenAI transcription API and no hosted Whisper service.
- `Track.lyrics` stores clean untimestamped text.
- Browser HTDemucs stem separation remains intact.
- Browser OAuth YouTube research remains the fallback.
- Competitor tags come from YouTube Data API `snippet.tags`, not HTML scraping.
- CI mocks Whisper inference and never downloads a model.

---

### Task 1: Faster Whisper CPU transcription core

**Files:**
- Create: `local_lyric_optimizer/__init__.py`
- Create: `local_lyric_optimizer/config.py`
- Create: `local_lyric_optimizer/transcriber.py`
- Create: `local_lyric_optimizer/requirements.txt`
- Create: `local_lyric_optimizer/tests/test_transcriber.py`

**Interfaces:**
- `OptimizerConfig.from_env() -> OptimizerConfig`
- `TranscriptSegment(start: float, end: float, text: str)`
- `TranscriptionResult(text: str, language: str | None, language_probability: float | None, segments: list[TranscriptSegment])`
- `FasterWhisperTranscriber.transcribe(path: Path, language: str | None = None) -> TranscriptionResult`

- [ ] **Step 1: Write failing config/model tests**

```python
from local_lyric_optimizer.config import OptimizerConfig
from local_lyric_optimizer.transcriber import FasterWhisperTranscriber


def test_default_config_is_intel_cpu_int8(monkeypatch):
    monkeypatch.delenv("LYRIC_MODEL_SIZE", raising=False)
    monkeypatch.delenv("LYRIC_CPU_THREADS", raising=False)
    config = OptimizerConfig.from_env()
    assert config.model_size == "small"
    assert config.device == "cpu"
    assert config.compute_type == "int8"
    assert 1 <= config.cpu_threads <= 8


def test_model_factory_receives_cpu_int8():
    calls = []
    class FakeModel:
        def __init__(self, *args, **kwargs):
            calls.append((args, kwargs))
    transcriber = FasterWhisperTranscriber(
        OptimizerConfig(model_size="base", cpu_threads=4),
        model_class=FakeModel,
    )
    transcriber._get_model()
    assert calls == [(('base',), {
        'device': 'cpu',
        'compute_type': 'int8',
        'cpu_threads': 4,
    })]
```

- [ ] **Step 2: Run RED**

```bash
python -m pytest local_lyric_optimizer/tests/test_transcriber.py -q
```

Expected: module import failure.

- [ ] **Step 3: Implement config and lazy model loading**

```python
@dataclass(frozen=True)
class OptimizerConfig:
    model_size: str = "small"
    cpu_threads: int = 4
    device: str = "cpu"
    compute_type: str = "int8"

    @classmethod
    def from_env(cls) -> "OptimizerConfig":
        model = os.getenv("LYRIC_MODEL_SIZE", "small").strip().lower()
        if model not in {"base", "small"}:
            model = "small"
        default_threads = max(1, min(8, os.cpu_count() or 4))
        threads = max(1, int(os.getenv("LYRIC_CPU_THREADS", str(default_threads))))
        return cls(model_size=model, cpu_threads=threads)
```

Model construction is exactly:

```python
self.model_class(
    self.config.model_size,
    device="cpu",
    compute_type="int8",
    cpu_threads=self.config.cpu_threads,
)
```

- [ ] **Step 4: Add failing transcript-format tests**

Mock segments `"  First   line "`, repeated `"First line"`, then `"Second line"`. Expected result text is exactly:

```text
First line
Second line
```

- [ ] **Step 5: Implement transcription**

Call:

```python
segments, info = model.transcribe(
    str(path),
    language=language or None,
    vad_filter=True,
    beam_size=5,
)
```

Collapse whitespace, discard empty segments, discard exact adjacent duplicates case-insensitively, preserve every remaining word, and join segments with newlines.

- [ ] **Step 6: Run GREEN and commit**

```bash
python -m pytest local_lyric_optimizer/tests/test_transcriber.py -q
git add local_lyric_optimizer
git commit -m "feat: add Intel Faster Whisper transcription core"
```

---

### Task 2: FastAPI health and lyric upload API

**Files:**
- Create: `local_lyric_optimizer/app.py`
- Create: `local_lyric_optimizer/.env.example`
- Create: `local_lyric_optimizer/tests/test_app.py`
- Modify: `local_lyric_optimizer/requirements.txt`

**Interfaces:**
- `GET /health`
- `POST /lyrics/transcribe` with multipart `file` and optional `language`

- [ ] **Step 1: Write failing endpoint tests**

The health response is exactly:

```python
{
    "ok": True,
    "service": "ezway-local-lyric-optimizer",
    "model": "small",
    "device": "cpu",
    "compute_type": "int8",
}
```

Use an injected fake transcriber. Test `.mp3` and `.wav` success, `.flac` as 415, empty file as 422, and upload over 250 MB as 413. Capture the temporary path in the fake transcriber and assert it does not exist after success or raised failure.

- [ ] **Step 2: Run RED**

```bash
python -m pytest local_lyric_optimizer/tests/test_app.py -q
```

- [ ] **Step 3: Implement explicit CORS and temp-file lifecycle**

```python
DEFAULT_ORIGINS = [
    "https://ezwaypro.theartistcut.com",
    "https://main.d1wu55zn1feotm.amplifyapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
```

Use `NamedTemporaryFile(delete=False, suffix=suffix)` and `Path(temp_path).unlink(missing_ok=True)` in `finally`.

- [ ] **Step 4: Return exact transcript shape**

```json
{
  "text": "First line\nSecond line",
  "language": "en",
  "language_probability": 0.98,
  "segments": [
    {"start": 0.0, "end": 3.2, "text": "First line"},
    {"start": 3.2, "end": 6.1, "text": "Second line"}
  ]
}
```

Empty cleaned text returns 422.

- [ ] **Step 5: Run GREEN and commit**

```bash
python -m pytest local_lyric_optimizer/tests -q
git add local_lyric_optimizer
git commit -m "feat: expose local lyric transcription API"
```

---

### Task 3: Local keyword and competitor-tag research

**Files:**
- Create: `local_lyric_optimizer/seo.py`
- Create: `local_lyric_optimizer/tests/test_seo.py`
- Modify: `local_lyric_optimizer/app.py`

**Interfaces:**
- `build_modifier_queries(seed: str) -> list[str]`
- `fetch_suggestions(seed: str, session=requests) -> list[str]`
- `fetch_competitor_tags(seed: str, api_key: str, session=requests) -> list[str]`
- `rank_tags(competitor_tags: list[str], genre: str = "") -> list[str]`
- `POST /seo/research`

- [ ] **Step 1: Write failing modifier/ranking tests**

```python
def test_modifier_queries():
    assert build_modifier_queries("Blinding Lights") == [
        "Blinding Lights",
        "Blinding Lights lyrics",
        "Blinding Lights lyric video",
        "Blinding Lights karaoke",
        "Blinding Lights clean lyrics",
    ]


def test_lyric_foundation_tags_rank_first():
    result = rank_tags(
        ["Synth Pop", "Lyrics", "Synth Pop", "Official Video", "Sing Along"],
        "pop",
    )
    assert result[:6] == [
        "lyrics",
        "lyric video",
        "lyrics video",
        "sing along",
        "clean lyrics",
        "official lyrics",
    ]
    assert result.index("synth pop") < result.index("pop")
```

- [ ] **Step 2: Run RED**

```bash
python -m pytest local_lyric_optimizer/tests/test_seo.py -q
```

- [ ] **Step 3: Implement YouTube-scoped autocomplete**

For each query call `https://suggestqueries.google.com/complete/search` with:

```python
params={"client": "firefox", "ds": "yt", "q": query}
```

Use `timeout=5`. Provider failure contributes an empty batch. Deduplicate case-insensitively while keeping first-seen order.

- [ ] **Step 4: Implement YouTube Data API competitor tags**

Search request:

```python
session.get(
    "https://www.googleapis.com/youtube/v3/search",
    params={
        "part": "id",
        "q": f"{seed} lyrics",
        "type": "video",
        "maxResults": 10,
        "order": "relevance",
        "key": api_key,
    },
    timeout=10,
)
```

Details request:

```python
session.get(
    "https://www.googleapis.com/youtube/v3/videos",
    params={
        "part": "snippet",
        "id": ",".join(video_ids),
        "key": api_key,
    },
    timeout=10,
)
```

Read only `item.get("snippet", {}).get("tags", [])`.

- [ ] **Step 5: Add partial-result behavior**

Without `YOUTUBE_API_KEY`, `/seo/research` returns queries/suggestions, empty competitor tags, ranked foundation/genre tags, and:

```json
{"warning": "youtube_api_key_missing"}
```

- [ ] **Step 6: Run GREEN and commit**

```bash
python -m pytest local_lyric_optimizer/tests/test_seo.py local_lyric_optimizer/tests/test_app.py -q
git add local_lyric_optimizer
git commit -m "feat: add local lyric SEO research"
```

---

### Task 4: Strict lyric-video description builder

**Files:**
- Create: `local_lyric_optimizer/description.py`
- Create: `local_lyric_optimizer/tests/test_description.py`
- Modify: `local_lyric_optimizer/app.py`

**Interfaces:**

```python
@dataclass(frozen=True)
class DescriptionInput:
    song_title: str
    artist: str
    genre: str
    mood: str
    lyrics: str
    spotify_url: str = ""
    apple_music_url: str = ""
    amazon_music_url: str = ""
    producers: str = ""
    songwriters: str = ""
    vocalists: str = ""
    visual_credit: str = ""
```

- `build_description_skeleton(data: DescriptionInput) -> str`
- `build_description_prompt(data: DescriptionInput) -> str`
- `POST /seo/description-prompt`

- [ ] **Step 1: Write failing description tests**

For `Blinding Lights`, `The Weeknd`, `Synth Pop`, mood `night drive`, and four lyric lines, assert this exact deterministic skeleton prefix/structure:

```text
Blinding Lights — The Weeknd | Synth Pop
Sing along with this night drive lyric video and follow every line of Blinding Lights.

🎧 STREAM / DOWNLOAD
Spotify: [Spotify URL]
Apple Music: [Apple Music URL]
Amazon Music: [Amazon Music URL]

📝 LYRICS
Line one
Line two
Line three
Line four

🎼 CREDITS
Producer(s): [Producer Name]
Songwriter(s): [Songwriter Name]
Vocalist(s): [Vocalist Name]
Video / Visual Credit: [Video / Visual Credit]
```

- [ ] **Step 2: Run RED**

```bash
python -m pytest local_lyric_optimizer/tests/test_description.py -q
```

- [ ] **Step 3: Implement skeleton and prompt**

The AI prompt explicitly requires the first two lines, title, artist, genre, mood, Spotify/Apple/Amazon, complete untruncated supplied lyrics, all four credit fields, and no invented credits.

- [ ] **Step 4: Expose endpoint**

`POST /seo/description-prompt` returns JSON keys `prompt` and `skeleton`, both non-empty strings.

- [ ] **Step 5: Run GREEN and commit**

```bash
python -m pytest local_lyric_optimizer/tests -q
git add local_lyric_optimizer
git commit -m "feat: add lyric video description builder"
```

---

### Task 5: TypeScript loopback client

**Files:**
- Create: `src/services/localLyricOptimizer.ts`
- Create: `src/services/localLyricOptimizer.test.ts`

**Interfaces:**

```ts
export interface LocalLyricSegment {
  start: number;
  end: number;
  text: string;
}

export interface LocalLyricTranscript {
  text: string;
  language: string | null;
  language_probability: number | null;
  segments: LocalLyricSegment[];
}

export interface LocalLyricSeoResearch {
  queries: string[];
  suggestions: string[];
  competitor_tags: string[];
  ranked_tags: string[];
  warning: string | null;
}
```

Functions:
- `checkLocalLyricOptimizer(options?)`
- `transcribeLyricsFile(file, options?)`
- `researchLocalLyricSeo(seed, genre, options?)`
- `buildLocalLyricDescription(input, options?)`

- [ ] **Step 1: Write failing client tests**

Inject `fetchImpl`. Verify multipart upload filename, default URL `http://127.0.0.1:8765/lyrics/transcribe`, health parsing, 415/422 backend messages, network failure mapping, and SEO warning passthrough.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test src/services/localLyricOptimizer.test.ts
```

- [ ] **Step 3: Implement loopback URL validation**

Permit only hostnames `localhost`, `127.0.0.1`, and `::1` for the runtime-configured service URL. Reject other hosts before uploading audio.

- [ ] **Step 4: Implement error mapping**

A connection failure must surface exactly:

```text
Local Lyrics Service is not running on this computer. Start it, then try again.
```

When the browser exposes a permission/CORS cause, append a concise note about allowing loopback/local-network access.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --experimental-strip-types --test src/services/localLyricOptimizer.test.ts
git add src/services/localLyricOptimizer.ts src/services/localLyricOptimizer.test.ts
git commit -m "feat: add local lyric optimizer browser client"
```

---

### Task 6: Replace lyric extraction while preserving stems

**Files:**
- Modify: `src/services/browserAudioTools.ts`
- Modify: `src/services/browserAudioTools.test.ts`
- Modify: `src/components/TrackOptionsMenu.tsx`
- Modify: `src/services/trackActionButtons.test.ts`

**Interfaces:**
- Add dependency `transcribeFile?: (file: File) => Promise<LocalLyricTranscript>`.
- Preserve `runLocalAudioTool(track, 'lyrics', ...) -> AudioToolJobResult`.
- Preserve all stem behavior.
- `AudioToolJobResult.lyrics` changes from LRC text to clean transcript text; `files.lrc` and `files.plain` remain.

- [ ] **Step 1: Replace old lyric regression with a failing local-service regression**

```ts
const calls: string[] = [];
const deps = baseDeps();
deps.decodeStems = async () => { throw new Error('lyrics must not decode stems'); };
deps.separate = async () => { throw new Error('lyrics must not run Demucs'); };
deps.transcribeFile = async (file) => {
  calls.push(file.name);
  return {
    text: 'Hello world',
    language: 'en',
    language_probability: 0.99,
    segments: [{ start: 0, end: 1.5, text: 'Hello world' }],
  };
};
const result = await runLocalAudioTool(baseTrack, 'lyrics', undefined, undefined, deps);
assert.equal(result.lyrics, 'Hello world');
assert.deepEqual(calls, ['Local-Song.wav']);
assert.match(result.files?.lrc || '', /^blob:local\//);
assert.match(result.files?.plain || '', /^blob:local\//);
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test src/services/browserAudioTools.test.ts
```

- [ ] **Step 3: Implement lyric branch**

Load the source file, call `transcribeLyricsFile`, convert `segments` to `buildLyricsFiles` input, save LRC/plain artifacts, and return clean `transcript.text` in `lyrics`. Do not call PCM decoding, browser Whisper, or Demucs for lyric extraction.

- [ ] **Step 4: Update UI copy**

Menu label: `Extract Lyrics — Local Intel`.

Dialog title: `Local Intel Lyrics`.

Initial progress: `Connecting to Local Lyrics Service…`.

Success: `Clean lyrics saved to this track.`.

Description: `Transcribes this MP3/WAV with Faster Whisper on your Intel CPU through the local companion service. Stem separation remains a separate tool.`

- [ ] **Step 5: Run GREEN and commit**

```bash
node --experimental-strip-types --test src/services/browserAudioTools.test.ts
node --experimental-strip-types --test src/services/trackActionButtons.test.ts
git add src/services/browserAudioTools.ts src/services/browserAudioTools.test.ts src/components/TrackOptionsMenu.tsx src/services/trackActionButtons.test.ts
git commit -m "feat: route lyric extraction through local Faster Whisper"
```

---

### Task 7: Prefer local SEO, retain OAuth fallback

**Files:**
- Modify: `src/components/YouTubeHub.tsx`
- Modify: `src/services/youtubeLyricsSeo.test.ts`
- Preserve: `src/services/youtubeBrowser.ts`
- Preserve: `src/services/youtubeUploadCore.ts`

**Interfaces:**
- Local first: `researchLocalLyricSeo(seed, genre)`.
- Fallback: existing `/api/youtube/seo-research` bridge backed by `YouTubeBrowserClient.researchLyricSEO()`.
- Cache remains `cacheYouTubeSEOResearch(seed, { suggestions, competitorTags })`.

- [ ] **Step 1: Add failing local-first/fallback test**

Require the Hub wrapper to call the local research service first. If it throws or returns `warning === 'youtube_api_key_missing'`, require the existing `/api/youtube/seo-research` path to run and cache its result.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test src/services/youtubeLyricsSeo.test.ts
```

- [ ] **Step 3: Implement local-first flow**

```ts
try {
  const local = await researchLocalLyricSeo(seed, primaryGenre);
  cacheYouTubeSEOResearch(seed, {
    suggestions: local.suggestions,
    competitorTags: local.competitor_tags,
  });
  if (!local.warning) return;
} catch (error) {
  console.warn('[YouTube SEO] Local optimizer unavailable; using OAuth research.', error);
}

const response = await fetch(`/api/youtube/seo-research?seed=${encodeURIComponent(seed)}`);
if (response.ok) cacheYouTubeSEOResearch(seed, await response.json());
```

Use the track's existing tags to derive a simple genre string for the local request; do not change `Track` schema.

- [ ] **Step 4: Preserve description regressions**

The existing tests must still prove full `track.lyrics` appears in `📝 LYRICS`, and the server prompt still includes Spotify, Apple Music, Amazon Music, Producer, Songwriter(s), Vocalist(s), and visual credit requirements.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --experimental-strip-types --test src/services/youtubeLyricsSeo.test.ts
node --experimental-strip-types --test src/services/youtubeBrowser.test.ts
node --experimental-strip-types --test src/services/youtubeUploadCore.test.ts
git add src/components/YouTubeHub.tsx src/services/youtubeLyricsSeo.test.ts
git commit -m "feat: prefer local lyric SEO with OAuth fallback"
```

---

### Task 8: Remove browser Whisper, document Intel setup, and verify

**Files:**
- Delete after reference check: `src/services/lyricsWorkerClient.ts`
- Delete after reference check: `src/services/lyricsWorkerClient.test.ts`
- Delete after reference check: `src/workers/lyrics.worker.ts`
- Delete after reference check: `src/workers/lyricsPipeline.worker.ts`
- Modify conditionally: `package.json`
- Modify conditionally: `package-lock.json`
- Delete conditionally: `scripts/copy-transformers-wasm.mjs`
- Create: `local_lyric_optimizer/README.md`
- Modify: `.gitignore`
- Create: `.github/workflows/local-lyric-optimizer-verify.yml`

**Interfaces:**
- Keep `src/services/lyricsCore.ts` for LRC formatting.
- Keep `src/services/demucsCore.ts`, `src/services/stemsWorkerClient.ts`, `src/workers/stems.worker.ts`, and `onnxruntime-web` for stems.

- [ ] **Step 1: Verify reference safety**

Search production sources for `lyricsWorkerClient`, `lyrics.worker`, `lyricsPipeline.worker`, and `@huggingface/transformers`. The three lyric worker modules must have no live caller after Task 6. Remove `@huggingface/transformers` plus `predev`/`prebuild` WASM-copy wiring only if no other live source imports it.

- [ ] **Step 2: Delete obsolete browser Whisper files/tests**

Delete the worker/client files above once the reference check passes.

- [ ] **Step 3: Add exact Intel installation README**

Windows PowerShell:

```powershell
cd local_lyric_optimizer
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

macOS/Linux:

```bash
cd local_lyric_optimizer
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

State that the selected model downloads on first use, runs locally afterward, and incurs no OpenAI transcription API charge.

- [ ] **Step 4: Update ignore rules**

Add `.venv/` and `local_lyric_optimizer/.env`; keep `.env.example` tracked.

- [ ] **Step 5: Add focused CI**

Install Python requirements plus `pytest` and `httpx`; install Node dependencies; run:

```bash
python -m pytest local_lyric_optimizer/tests -q
node --experimental-strip-types --test src/services/localLyricOptimizer.test.ts
node --experimental-strip-types --test src/services/browserAudioTools.test.ts
node --experimental-strip-types --test src/services/stemsWorkerClient.test.ts
node --experimental-strip-types --test src/services/youtubeLyricsSeo.test.ts
node --experimental-strip-types --test src/services/youtubeBrowser.test.ts
node --experimental-strip-types --test src/services/youtubeUploadCore.test.ts
npm run build
```

- [ ] **Step 6: Final acceptance review**

Confirm all eight facts:

1. Lyric extraction no longer loads browser Whisper.
2. Faster Whisper model construction is CPU/int8.
3. Clean lyrics are stored in `Track.lyrics`.
4. LRC/plain downloads still derive from returned timestamps.
5. Stem separation remains unchanged.
6. Local SEO is preferred and OAuth fallback remains.
7. Description generation still preserves full lyrics and all requested streaming/credit fields.
8. Service is loopback-only by default with explicit CORS and no committed secrets.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove browser Whisper and document local optimizer"
```

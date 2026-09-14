# Local Intel Lyric Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser Whisper lyric extractor with a loopback-only Python `faster-whisper` service optimized for Intel CPU, while preserving stem separation and integrating local lyric SEO research plus the existing YouTube lyric-description flow.

**Architecture:** EZ-WAY keeps `runLocalAudioTool(track, 'lyrics')` as its app-level entry point, but that branch uploads the original MP3/WAV to a local FastAPI companion at `http://127.0.0.1:8765`. The companion performs CPU/int8 Faster Whisper transcription and optional YouTube SEO research; the existing browser OAuth research remains the fallback. Stem separation stays browser-local and independent.

**Tech Stack:** Python 3, `faster-whisper`, FastAPI, Uvicorn, `requests`, React/Vite/TypeScript, Node test runner, existing YouTube OAuth bridge.

**Spec:** `docs/superpowers/specs/2026-09-14-local-intel-lyric-optimizer-design.md`

## Global Constraints

- Faster Whisper transcription must use `device="cpu"` and `compute_type="int8"`.
- Default model size is `small`; `base` is the only alternate model size required.
- Default CPU thread count is `max(1, min(8, os.cpu_count() or 4))`; `LYRIC_CPU_THREADS` overrides it.
- Accept only MP3 and WAV uploads; default maximum upload size is 250 MB.
- The service binds to `127.0.0.1:8765` by default and never exposes wildcard CORS.
- No OpenAI transcription API and no cloud-hosted Whisper.
- Preserve `Track.lyrics`; store clean untimestamped lyrics there.
- Preserve browser HTDemucs stem separation.
- Keep the existing browser OAuth lyric-SEO research as fallback.
- Do not HTML-scrape YouTube; competitor tags come from YouTube Data API `snippet.tags`.
- Routine CI must mock Whisper inference and must not download a model.

---

### Task 1: Intel Faster Whisper transcription core

**Files:**
- Create: `local_lyric_optimizer/__init__.py`
- Create: `local_lyric_optimizer/config.py`
- Create: `local_lyric_optimizer/transcriber.py`
- Create: `local_lyric_optimizer/requirements.txt`
- Create: `local_lyric_optimizer/tests/test_transcriber.py`

**Interfaces:**
- Produces: `OptimizerConfig.from_env() -> OptimizerConfig`
- Produces: `TranscriptSegment(start: float, end: float, text: str)`
- Produces: `TranscriptionResult(text: str, language: str | None, language_probability: float | None, segments: list[TranscriptSegment])`
- Produces: `FasterWhisperTranscriber.transcribe(path: Path, language: str | None = None) -> TranscriptionResult`

- [ ] **Step 1: Write failing configuration/model tests**

```python
from local_lyric_optimizer.config import OptimizerConfig
from local_lyric_optimizer.transcriber import FasterWhisperTranscriber


def test_defaults_are_intel_cpu_int8(monkeypatch):
    monkeypatch.delenv("LYRIC_MODEL_SIZE", raising=False)
    monkeypatch.delenv("LYRIC_CPU_THREADS", raising=False)
    cfg = OptimizerConfig.from_env()
    assert cfg.model_size == "small"
    assert cfg.device == "cpu"
    assert cfg.compute_type == "int8"
    assert 1 <= cfg.cpu_threads <= 8


def test_model_factory_uses_cpu_int8():
    calls = []
    class FakeModel:
        def __init__(self, *args, **kwargs):
            calls.append((args, kwargs))
    cfg = OptimizerConfig(model_size="base", cpu_threads=4)
    FasterWhisperTranscriber(cfg, model_class=FakeModel)._get_model()
    assert calls[0][0] == ("base",)
    assert calls[0][1]["device"] == "cpu"
    assert calls[0][1]["compute_type"] == "int8"
    assert calls[0][1]["cpu_threads"] == 4
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
python -m pytest local_lyric_optimizer/tests/test_transcriber.py -q
```

Expected: import/module failures because the package does not exist yet.

- [ ] **Step 3: Implement configuration and lazy model loading**

Core shape:

```python
@dataclass(frozen=True)
class OptimizerConfig:
    model_size: str = "small"
    cpu_threads: int = 4
    device: str = "cpu"
    compute_type: str = "int8"

    @classmethod
    def from_env(cls):
        model = os.getenv("LYRIC_MODEL_SIZE", "small").strip().lower()
        if model not in {"base", "small"}:
            model = "small"
        default_threads = max(1, min(8, os.cpu_count() or 4))
        threads = max(1, int(os.getenv("LYRIC_CPU_THREADS", default_threads)))
        return cls(model_size=model, cpu_threads=threads)
```

The transcriber must instantiate:

```python
WhisperModel(
    self.config.model_size,
    device="cpu",
    compute_type="int8",
    cpu_threads=self.config.cpu_threads,
)
```

- [ ] **Step 4: Add transcript-cleaning tests before implementation**

Test a mocked Faster Whisper result containing repeated adjacent segments and whitespace. Expected clean output:

```text
First line
Second line
```

No lyric words may be paraphrased or corrected.

- [ ] **Step 5: Implement `transcribe()` minimally**

Use:

```python
segments, info = model.transcribe(
    str(path),
    language=language or None,
    vad_filter=True,
    beam_size=5,
)
```

Normalize each segment with whitespace collapsing, drop empty text, drop exact adjacent duplicates case-insensitively, and join accepted segments with `\n`.

- [ ] **Step 6: Run Task 1 tests GREEN**

```bash
python -m pytest local_lyric_optimizer/tests/test_transcriber.py -q
```

- [ ] **Step 7: Commit**

```bash
git add local_lyric_optimizer

git commit -m "feat: add Intel Faster Whisper transcription core"
```

---

### Task 2: FastAPI health and lyric upload contract

**Files:**
- Create: `local_lyric_optimizer/app.py`
- Create: `local_lyric_optimizer/.env.example`
- Create: `local_lyric_optimizer/tests/test_app.py`
- Modify: `local_lyric_optimizer/requirements.txt`

**Interfaces:**
- Consumes: `OptimizerConfig`, `FasterWhisperTranscriber`
- Produces: `GET /health`
- Produces: `POST /lyrics/transcribe` multipart `file` plus optional `language`

- [ ] **Step 1: Write failing endpoint tests**

Use FastAPI `TestClient` with an injected fake transcriber. Cover:

```python
assert client.get("/health").json() == {
    "ok": True,
    "service": "ezway-local-lyric-optimizer",
    "model": "small",
    "device": "cpu",
    "compute_type": "int8",
}
```

Also assert `.mp3` and `.wav` are accepted, `.flac` returns 415, empty upload returns 422, over-limit upload returns 413, and the temporary file no longer exists after both success and failure.

- [ ] **Step 2: Run endpoint tests RED**

```bash
python -m pytest local_lyric_optimizer/tests/test_app.py -q
```

- [ ] **Step 3: Implement loopback FastAPI app and explicit CORS**

Use `CORSMiddleware` with parsed `EZWAY_ALLOWED_ORIGINS`; never include `*`.

Required defaults:

```python
DEFAULT_ORIGINS = [
    "https://ezwaypro.theartistcut.com",
    "https://main.d1wu55zn1feotm.amplifyapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
```

Save upload to `tempfile.NamedTemporaryFile(delete=False, suffix=suffix)`, call the transcriber, and delete the temp path in `finally`.

- [ ] **Step 4: Return exact transcription JSON contract**

```json
{
  "text": "First line\nSecond line",
  "language": "en",
  "language_probability": 0.98,
  "segments": [
    {"start": 0.0, "end": 3.2, "text": "First line"}
  ]
}
```

No usable text must return 422.

- [ ] **Step 5: Run Task 1 + 2 tests GREEN**

```bash
python -m pytest local_lyric_optimizer/tests -q
```

- [ ] **Step 6: Commit**

```bash
git add local_lyric_optimizer

git commit -m "feat: expose local lyric transcription API"
```

---

### Task 3: Local lyric keyword and competitor-tag research

**Files:**
- Create: `local_lyric_optimizer/seo.py`
- Create: `local_lyric_optimizer/tests/test_seo.py`
- Modify: `local_lyric_optimizer/app.py`

**Interfaces:**
- Produces: `build_modifier_queries(seed: str) -> list[str]`
- Produces: `fetch_suggestions(seed: str, session=requests) -> list[str]`
- Produces: `fetch_competitor_tags(seed: str, api_key: str, session=requests) -> list[str]`
- Produces: `rank_tags(competitor_tags: list[str], genre: str = "") -> list[str]`
- Produces: `POST /seo/research`

- [ ] **Step 1: Write failing pure-function tests**

```python
def test_modifier_queries():
    assert build_modifier_queries("Blinding Lights") == [
        "Blinding Lights",
        "Blinding Lights lyrics",
        "Blinding Lights lyric video",
        "Blinding Lights karaoke",
        "Blinding Lights clean lyrics",
    ]


def test_lyric_tags_are_ranked_first():
    ranked = rank_tags(
        ["Synth Pop", "Lyrics", "Official Video", "Synth Pop", "Sing Along"],
        "pop",
    )
    assert ranked[:6] == [
        "lyrics", "lyric video", "lyrics video", "sing along", "clean lyrics", "official lyrics"
    ]
    assert ranked.index("synth pop") < ranked.index("pop")
```

- [ ] **Step 2: Run tests RED**

```bash
python -m pytest local_lyric_optimizer/tests/test_seo.py -q
```

- [ ] **Step 3: Implement YouTube-scoped autocomplete**

Each query calls:

```text
https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=<encoded query>
```

Use `timeout=5`. Provider failure returns no suggestions for that query. Deduplicate case-insensitively while preserving first-seen order.

- [ ] **Step 4: Implement Data API competitor research**

Search endpoint:

```text
https://www.googleapis.com/youtube/v3/search
```

Parameters:

```python
{
    "part": "id",
    "q": f"{seed} lyrics",
    "type": "video",
    "maxResults": 10,
    "order": "relevance",
    "key": api_key,
}
```

Then retrieve:

```text
https://www.googleapis.com/youtube/v3/videos?part=snippet&id=<comma-separated ids>&key=<key>
```

Read only `item["snippet"].get("tags", [])`.

- [ ] **Step 5: Add missing-key partial-result test and endpoint**

`POST /seo/research` without `YOUTUBE_API_KEY` must still return deterministic queries and autocomplete suggestions, plus:

```json
{"warning": "youtube_api_key_missing"}
```

The frontend uses that warning to trigger OAuth fallback.

- [ ] **Step 6: Run SEO tests GREEN**

```bash
python -m pytest local_lyric_optimizer/tests/test_seo.py local_lyric_optimizer/tests/test_app.py -q
```

- [ ] **Step 7: Commit**

```bash
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
- Produces: `DescriptionInput`
- Produces: `build_description_skeleton(data: DescriptionInput) -> str`
- Produces: `build_description_prompt(data: DescriptionInput) -> str`
- Produces: `POST /seo/description-prompt`

- [ ] **Step 1: Write failing description tests**

Given title `Blinding Lights`, artist `The Weeknd`, genre `Synth Pop`, mood `night drive`, and four lyric lines, assert the skeleton contains all four lines and this exact section order:

```text
Blinding Lights — The Weeknd | Synth Pop
<second hook line>

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

- [ ] **Step 2: Run description tests RED**

```bash
python -m pytest local_lyric_optimizer/tests/test_description.py -q
```

- [ ] **Step 3: Implement deterministic skeleton and AI prompt**

The prompt must explicitly require: first two lines, title, artist, genre, mood, all three streaming services, full untruncated lyrics, all four credit lines, and no invented credits.

- [ ] **Step 4: Add `/seo/description-prompt` endpoint**

Response:

```json
{
  "prompt": "complete AI instruction string",
  "skeleton": "complete deterministic description"
}
```

- [ ] **Step 5: Run all Python tests GREEN**

```bash
python -m pytest local_lyric_optimizer/tests -q
```

- [ ] **Step 6: Commit**

```bash
git add local_lyric_optimizer

git commit -m "feat: add lyric video description builder"
```

---

### Task 5: TypeScript loopback client

**Files:**
- Create: `src/services/localLyricOptimizer.ts`
- Create: `src/services/localLyricOptimizer.test.ts`

**Interfaces:**
- Produces: `LocalLyricSegment`
- Produces: `LocalLyricTranscript`
- Produces: `LocalLyricSeoResearch`
- Produces: `checkLocalLyricOptimizer(options?)`
- Produces: `transcribeLyricsFile(file, options?)`
- Produces: `researchLocalLyricSeo(seed, genre, options?)`
- Produces: `buildLocalLyricDescription(input, options?)`

- [ ] **Step 1: Write failing client tests**

Tests must inject `fetchImpl` and verify:

```ts
const body = capturedInit?.body as FormData;
assert.equal((body.get('file') as File).name, 'song.wav');
assert.equal(capturedUrl, 'http://127.0.0.1:8765/lyrics/transcribe');
```

Also test health, 415/422 error messages, missing service (`TypeError: fetch failed`), and research warning passthrough.

- [ ] **Step 2: Run tests RED**

```bash
node --experimental-strip-types --test src/services/localLyricOptimizer.test.ts
```

- [ ] **Step 3: Implement loopback-only base URL validation**

Allow only `localhost`, `127.0.0.1`, and `[::1]` unless an explicit test override supplies a fetch/base URL. Reject arbitrary LAN/public hosts before sending audio.

- [ ] **Step 4: Implement friendly connection error mapping**

Network failure message:

```text
Local Lyrics Service is not running on this computer. Start it, then try again.
```

Permission/CORS-style browser failures should mention loopback/local-network permission instead of only `Failed to fetch`.

- [ ] **Step 5: Run client tests GREEN**

```bash
node --experimental-strip-types --test src/services/localLyricOptimizer.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/services/localLyricOptimizer.ts src/services/localLyricOptimizer.test.ts

git commit -m "feat: add local lyric optimizer browser client"
```

---

### Task 6: Replace the app lyric path without touching stems

**Files:**
- Modify: `src/services/browserAudioTools.ts`
- Modify: `src/services/browserAudioTools.test.ts`
- Modify: `src/components/TrackOptionsMenu.tsx`
- Modify or create focused UI/source audit test under `src/services/`

**Interfaces:**
- Consumes: `transcribeLyricsFile(file)`
- Preserves: `runLocalAudioTool(track, 'lyrics', ...) -> AudioToolJobResult`
- Preserves: `runLocalAudioTool(track, 'stems', ...)`
- Changes lyric result semantics: `AudioToolJobResult.lyrics` is clean text; `files.lrc` and `files.plain` remain downloadable artifacts.

- [ ] **Step 1: Rewrite lyric-path tests first**

Replace the old Demucs-before-Whisper assertions with:

```ts
const calls: string[] = [];
const deps = baseDeps();
deps.transcribeFile = async (file) => {
  calls.push(`transcribe:${file.name}`);
  return {
    text: 'Hello world',
    language: 'en',
    language_probability: 0.99,
    segments: [{ start: 0, end: 1.5, text: 'Hello world' }],
  };
};
const result = await runLocalAudioTool(baseTrack, 'lyrics', undefined, undefined, deps);
assert.equal(result.lyrics, 'Hello world');
assert.deepEqual(calls, ['transcribe:Local-Song.wav']);
```

Add a guard that `decodeStems` and `separate` throw if called during `lyrics`; the lyric test must still pass.

- [ ] **Step 2: Run browser audio tests RED**

```bash
node --experimental-strip-types --test src/services/browserAudioTools.test.ts
```

- [ ] **Step 3: Change only the lyric branch**

Add `transcribeFile?: (file: File) => Promise<LocalLyricTranscript>` to dependencies. In the lyrics branch, load the original source file, call the local service, map segments to `buildLyricsFiles`, create LRC/plain downloads, and return:

```ts
{
  status: 'completed',
  action: 'lyrics',
  lyrics: transcript.text,
  language: transcript.language,
  language_probability: transcript.language_probability,
  files: persisted.urls,
}
```

Do not decode PCM or invoke Demucs in this branch.

- [ ] **Step 4: Update Track Options copy**

Visible action: `Extract Lyrics — Local Intel`.

Dialog title: `Local Intel Lyrics`.

Explanatory copy must say the selected MP3/WAV is transcribed by the local Faster Whisper companion on this computer and that stem separation remains separate.

Initial progress: `Connecting to Local Lyrics Service…`.

Success: `Clean lyrics saved to this track.`.

- [ ] **Step 5: Run browser audio and track-action tests GREEN**

```bash
node --experimental-strip-types --test src/services/browserAudioTools.test.ts
node --experimental-strip-types --test src/services/trackActionButtons.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/services/browserAudioTools.ts src/services/browserAudioTools.test.ts src/components/TrackOptionsMenu.tsx src/services/trackActionButtons.test.ts

git commit -m "feat: route lyric extraction through local Faster Whisper"
```

---

### Task 7: Prefer local SEO research and retain OAuth fallback

**Files:**
- Modify: `src/components/YouTubeHub.tsx`
- Modify: `src/services/youtubeLyricsSeo.test.ts`
- Keep behavior in: `src/services/youtubeBrowser.ts`
- Keep behavior in: `src/services/youtubeUploadCore.ts`

**Interfaces:**
- Consumes: `researchLocalLyricSeo(seed, genre)`
- Fallback: existing `/api/youtube/seo-research` bridge backed by `YouTubeBrowserClient.researchLyricSEO()`
- Produces: same `cacheYouTubeSEOResearch(seed, { suggestions, competitorTags })` call used today.

- [ ] **Step 1: Add failing source/behavior tests**

Require `YouTubeHub.tsx` to import the local client, attempt local research first, and call the existing `/api/youtube/seo-research` path if the local response has `warning === 'youtube_api_key_missing'` or the local request throws.

- [ ] **Step 2: Run lyric SEO tests RED**

```bash
node --experimental-strip-types --test src/services/youtubeLyricsSeo.test.ts
```

- [ ] **Step 3: Implement local-first research**

Pseudo-flow:

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

Do not remove or weaken the current OAuth implementation.

- [ ] **Step 4: Verify extracted lyrics still flow through existing description generation**

Keep the current `generateYouTubeSEO()` regression proving full `track.lyrics` is present in `📝 LYRICS`, and keep the existing server prompt regression for Spotify/Apple/Amazon and credits.

- [ ] **Step 5: Run YouTube tests GREEN**

```bash
node --experimental-strip-types --test src/services/youtubeLyricsSeo.test.ts
node --experimental-strip-types --test src/services/youtubeBrowser.test.ts
node --experimental-strip-types --test src/services/youtubeUploadCore.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/YouTubeHub.tsx src/services/youtubeLyricsSeo.test.ts

git commit -m "feat: prefer local lyric SEO with OAuth fallback"
```

---

### Task 8: Remove obsolete browser Whisper path, document setup, and verify

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
- Removes only browser Whisper implementation details.
- Keeps `lyricsCore.ts`, `demucsCore.ts`, `stemsWorkerClient.ts`, `stems.worker.ts`, and `onnxruntime-web` for stem separation.

- [ ] **Step 1: Prove obsolete references before deletion**

Repository search must show that `lyricsWorkerClient`, `lyrics.worker`, and `lyricsPipeline.worker` have no remaining production callers after Task 6. If `@huggingface/transformers` is referenced only by those files, remove the dependency and the predev/prebuild WASM-copy script. If another live feature references Transformers, keep the package/script and delete only the lyric-specific files.

- [ ] **Step 2: Delete obsolete browser lyric implementation/tests**

Remove the old worker files and tests that assert WebGPU/WASM Whisper behavior.

- [ ] **Step 3: Add local installation README**

Document Windows PowerShell:

```powershell
cd local_lyric_optimizer
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

Document macOS/Linux shell:

```bash
cd local_lyric_optimizer
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

Explain model download occurs on first use and there is no OpenAI API transcription cost.

- [ ] **Step 4: Ignore local Python runtime files**

Add `.venv/` and local `.env` files without ignoring the committed `.env.example`.

- [ ] **Step 5: Add focused CI workflow**

Workflow must set up Python and Node, install Python requirements plus `pytest`/`httpx`, run mocked Python tests, run focused TypeScript tests, and run production build. It must not invoke real Whisper inference.

Commands:

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

- [ ] **Step 6: Run final verification**

Run the complete focused command list above. Also run the existing Music Intelligence workflow only as a diagnostic if needed; distinguish pre-existing unrelated failures from regressions.

- [ ] **Step 7: Check final diff against acceptance criteria**

Confirm:

1. lyric extraction no longer imports/loads browser Whisper;
2. clean transcript is written to `track.lyrics`;
3. LRC/plain files still work from returned segments;
4. stem separation remains intact;
5. local SEO is preferred and OAuth fallback remains;
6. description template still contains full lyrics, Spotify, Apple Music, Amazon Music, and all credit fields;
7. local service is loopback-only with explicit CORS;
8. no secret values are committed.

- [ ] **Step 8: Commit**

```bash
git add -A

git commit -m "chore: remove browser Whisper and document local optimizer"
```

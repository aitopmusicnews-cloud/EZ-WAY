# EZ-WAY Audio Tools

EZ-WAY Audio Tools v5 keeps the existing lyrics/stem features and adds the shared **Music Intelligence** analyzer used across the app.

## 1. Music Intelligence

Every newly uploaded track can now be analyzed once and reused everywhere in EZ-WAY.

The v5 analyzer uses:

- **All-In-One-Infer (`harmonix-all`)** for BPM and functional song structure such as intro, verse, chorus, bridge, break, solo, instrumental, and outro.
- **LAION `larger_clap_music`** for multi-window genre, style, mood, and instrument/production classification.
- **Full-track chroma/key analysis** for musical key and Camelot key.
- Deterministic, evidence-grounded keywords from the detected music traits. No GPT/OpenAI call is required for core analysis.

The result is a reusable `MusicIntelligenceProfile`. Compact BPM/key/genre/mood/style/instrument/keyword values are also copied into the legacy track fields/tags for existing EZ-WAY features.

The canonical profile storage is now **AWS-oriented instead of Supabase-oriented**. The frontend uses a configurable Music Intelligence profile API and keeps a browser-local fallback for development. The AWS implementation under `aws/music-intelligence/` provides a DynamoDB table plus a Lambda/API contract for the same profile records.

## 2. Synced Lyrics

- Separates the vocal from the instrumental with Demucs `htdemucs`.
- Transcribes the isolated vocal with `faster-whisper-large-v3`.
- Saves real timestamped LRC lyrics back to the selected track.
- Produces downloadable `.lrc`, plain-text lyrics, and the isolated vocal.
- If a reliable transcript cannot be produced, the job fails instead of inventing lyrics or timestamps.

## 3. Stem Separation

- **Vocals + Instrumental**: produces `vocals.wav` and `instrumental.wav`/no-vocals output.
- **Full Separation**: produces `vocals.wav`, `drums.wav`, `bass.wav`, and `other.wav`.
- Also produces a ZIP containing the complete requested stem set.

## Modal deployment

The v5 worker lives at:

```text
modal/audio_tools_agent_v5.py
```

Prepare the Music Intelligence model cache without processing a catalog track:

```bash
modal run modal/audio_tools_agent_v5.py::prepare_music_intelligence_models
```

The existing Demucs/Whisper model preparation remains available through the current Audio Tools base worker if those weights have not already been prepared.

Deploy the v5 persistent API:

```bash
modal deploy modal/audio_tools_agent_v5.py
```

Modal will print a persistent URL for the `audio_tools_api_v5` ASGI application.

## Web application environment

Set the deployed Audio Tools URL:

```env
VITE_AUDIO_TOOLS_URL=https://YOUR-MODAL-AUDIO-TOOLS-V5-URL.modal.run
```

Do not add `/jobs` to that variable. The app automatically calls:

- `POST /jobs`
- `GET /jobs/{call_id}`
- `GET /files/{filename}`

The `POST /jobs` action can be `analysis`, `lyrics`, or `stems`.

For canonical Song Profile storage, the frontend accepts:

```env
VITE_MUSIC_INTELLIGENCE_API_URL=/api/music-intelligence
```

During the AWS transition, leave this variable unset until an authenticated EZ-WAY backend/proxy is ready to invoke the IAM-protected AWS Music Intelligence API. When unset, the feature branch uses its local cache for development and does not write analyzer profiles to Supabase.

See `aws/music-intelligence/README.md` for the DynamoDB/Lambda deployment path.

## Compute configuration

Lyrics and stem separation continue to use the existing Audio Tools GPU setting:

```bash
EZWAY_AUDIO_GPU=L4 modal deploy modal/audio_tools_agent_v5.py
```

Music Intelligence does **not** require a TPU. By default its v5 worker is CPU-backed. If you want faster catalog processing and your Modal account has GPU access, set a GPU explicitly:

```bash
EZWAY_ANALYSIS_GPU=L4 modal deploy modal/audio_tools_agent_v5.py
```

To force CPU analysis:

```bash
EZWAY_ANALYSIS_GPU=cpu modal deploy modal/audio_tools_agent_v5.py
```

The structure and semantic models remain cached in the existing `ezway-audio-tools-models` Modal Volume so each song does not re-download model weights.

## Automatic upload behavior

The upload sequence is now:

1. Read the track duration locally.
2. Upload the real audio master to cloud storage.
3. Create the track with `processing` status.
4. Submit one `analysis` job using the cloud audio URL.
5. Save the complete Music Intelligence profile through the configured profile storage layer.
6. Copy compatibility BPM/key/tags to the track and mark it `ready`.

Bulk uploads stay sequential to avoid hammering the worker. If analysis fails, the uploaded track remains in the library with `error` status instead of receiving fabricated metadata.

A failed retry of the same audio fingerprint does not erase a previously good Song Profile. If the audio file itself changes, the previous profile is not reused for the replacement audio.

## Source file requirement

The browser-to-Modal integration requires `track.file_url` to be reachable by Modal. Tracks whose source exists only as a browser `blob:` URL must first be uploaded to cloud storage before Audio Tools can process them.

## Security note

The current browser integration uses the public Modal ASGI URL. `EZWAY_AUDIO_PROXY_AUTH=1` should not be enabled until EZ-WAY routes Audio Tools calls through the server, because browser clients should not contain Modal proxy secrets. A server-side proxy is the recommended next hardening step before broad public exposure.

The AWS profile API template uses IAM authorization by default. Do not place AWS secret keys in Vite environment variables or browser code.
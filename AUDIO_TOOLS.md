# EZ-WAY Audio Tools

EZ-WAY now has two GPU-backed audio workflows:

1. **Synced Lyrics**
   - Separates the vocal from the instrumental with Demucs `htdemucs`.
   - Transcribes the isolated vocal with `faster-whisper-large-v3`.
   - Saves real timestamped LRC lyrics back to the selected track.
   - Produces downloadable `.lrc`, plain-text lyrics, and the isolated vocal.
   - If a reliable transcript cannot be produced, the job fails instead of inventing lyrics or timestamps.

2. **Stem Separation**
   - **Vocals + Instrumental**: produces `vocals.wav` and `instrumental.wav`/no-vocals output.
   - **Full Separation**: produces `vocals.wav`, `drums.wav`, `bass.wav`, and `other.wav`.
   - Also produces a ZIP containing the complete requested stem set.

## Modal deployment

The worker lives at:

```text
modal/audio_tools_agent.py
```

Prepare model weights without starting a paid audio-processing job:

```bash
modal run modal/audio_tools_agent.py::prepare_audio_models
```

Then deploy the persistent API:

```bash
modal deploy modal/audio_tools_agent.py
```

Modal will print a persistent URL for the `audio_tools_api` ASGI application.

## Render environment

In the EZ-WAY Render service, set:

```env
VITE_AUDIO_TOOLS_URL=https://YOUR-MODAL-AUDIO-TOOLS-URL.modal.run
```

Then redeploy EZ-WAY so Vite builds the URL into the web application.

Do not add `/jobs` to the environment variable. The app automatically calls:

- `POST /jobs`
- `GET /jobs/{call_id}`
- `GET /files/{filename}`

## GPU usage

The default worker GPU is Modal `L4` and can be changed at deploy time:

```bash
EZWAY_AUDIO_GPU=L4 modal deploy modal/audio_tools_agent.py
```

No stem separation or transcription job runs during deployment. GPU processing begins only after a user explicitly chooses **Generate Synced Lyrics**, **Create Vocals + Instrumental**, or **Create Full Stems** for a track.

## Source file requirement

The current browser-to-Modal integration requires `track.file_url` to be reachable by Modal. Tracks whose source exists only as a browser `blob:` URL must first be uploaded to cloud storage before Audio Tools can process them.

## Security note

The current browser integration uses the public Modal ASGI URL. `EZWAY_AUDIO_PROXY_AUTH=1` should not be enabled until EZ-WAY routes Audio Tools calls through the server, because browser clients should not contain Modal proxy secrets. A server-side proxy is the recommended next hardening step before broad public exposure.

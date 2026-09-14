# EZ-WAY Local Intel Lyric Optimizer

This companion service runs lyric transcription locally with Faster Whisper on the computer running EZ-WAY. It is configured for Intel-friendly CPU inference (`device=cpu`, `compute_type=int8`) and listens on loopback only by default at `http://127.0.0.1:8765`.

## Windows PowerShell

Run these commands from the EZ-WAY repository root:

```powershell
py -m venv local_lyric_optimizer\.venv
.\local_lyric_optimizer\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r local_lyric_optimizer\requirements.txt
copy local_lyric_optimizer\.env.example local_lyric_optimizer\.env
python -m uvicorn local_lyric_optimizer.app:app --host 127.0.0.1 --port 8765
```

## macOS / Linux

Run these commands from the EZ-WAY repository root:

```bash
python3 -m venv local_lyric_optimizer/.venv
source local_lyric_optimizer/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r local_lyric_optimizer/requirements.txt
cp local_lyric_optimizer/.env.example local_lyric_optimizer/.env
python -m uvicorn local_lyric_optimizer.app:app --host 127.0.0.1 --port 8765
```

Open `http://127.0.0.1:8765/health` to confirm the service is running. The selected Faster Whisper model downloads on first use and is then reused from the local model cache. Transcription stays local and does not use the OpenAI transcription API, so there is no OpenAI transcription API charge.

## Configuration

Copy `.env.example` to `.env` and adjust only what you need. Supported settings include:

- `LYRIC_MODEL_SIZE=small` — default; `base` is also supported.
- `LYRIC_CPU_THREADS` — optional CPU-thread override. The default is capped at 8 threads.
- `LYRIC_SERVICE_HOST=127.0.0.1` and `LYRIC_SERVICE_PORT=8765` — loopback service defaults.
- `LYRIC_MAX_UPLOAD_MB=250` — maximum MP3/WAV upload size.
- `EZWAY_ALLOWED_ORIGINS` — comma-separated browser origins; wildcard origins are rejected.
- `YOUTUBE_API_KEY` — optional. When absent, local autocomplete still works and EZ-WAY can use the existing connected YouTube OAuth research fallback for competitor tags.

## What EZ-WAY uses it for

- **Extract Lyrics — Local Intel:** sends the original MP3 or WAV to `/lyrics/transcribe`, stores clean untimestamped text in the track, and builds optional plain-text/LRC downloads from returned timestamps.
- **YouTube lyric SEO research:** queries `/seo/research` first for lyric-focused autocomplete and tag research. If local YouTube Data API research is unavailable, EZ-WAY retains its existing OAuth-based fallback.
- **Lyric-video descriptions:** `/description/prompt` and `/description/skeleton` preserve the full supplied lyrics and the streaming/credit sections used by the YouTube Hub.

Stem separation remains a separate browser HTDemucs feature and does not depend on Faster Whisper.
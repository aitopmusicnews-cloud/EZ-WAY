from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import modal

app = modal.App("ezway-audio-tools")

# Mount persistent Volumes under /mnt so they never collide with directories
# already populated by the container image.
MODEL_ROOT = "/mnt/ezway-models"
OUTPUT_ROOT = "/mnt/ezway-outputs"
AUDIO_GPU = os.getenv("EZWAY_AUDIO_GPU", "L4")
REQUIRE_PROXY_AUTH = os.getenv("EZWAY_AUDIO_PROXY_AUTH", "0").strip() == "1"

model_volume = modal.Volume.from_name("ezway-audio-tools-models", create_if_missing=True)
output_volume = modal.Volume.from_name("ezway-audio-tools-outputs", create_if_missing=True)

web_image = modal.Image.debian_slim(python_version="3.11").uv_pip_install(
    "fastapi[standard]>=0.115.8",
)

audio_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .uv_pip_install(
        "torch",
        "torchaudio",
        "demucs==4.0.1",
        "faster-whisper==1.2.1",
        "huggingface-hub[hf_xet]",
        "httpx",
    )
    .env(
        {
            "TORCH_HOME": f"{MODEL_ROOT}/torch",
            "HF_HOME": f"{MODEL_ROOT}/hf",
            "XDG_CACHE_HOME": f"{MODEL_ROOT}/cache",
        }
    )
)


def _safe_label(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-._")
    return value[:80] or "track"


def _guess_extension(url: str, content_type: str | None) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}:
        return suffix
    mapping = {
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/flac": ".flac",
        "audio/mp4": ".m4a",
        "audio/aac": ".aac",
        "audio/ogg": ".ogg",
    }
    return mapping.get((content_type or "").split(";")[0].strip().lower(), ".mp3")


def _download_audio(url: str, target_dir: Path) -> Path:
    import httpx

    with httpx.stream("GET", url, timeout=120.0, follow_redirects=True) as response:
        response.raise_for_status()
        extension = _guess_extension(url, response.headers.get("content-type"))
        destination = target_dir / f"source{extension}"
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
    return destination


def _demucs_output_dir(root: Path, source: Path) -> Path:
    return root / "htdemucs" / source.stem


def _run_demucs(source: Path, output_dir: Path, two_stem: bool) -> Path:
    command = [
        "python",
        "-m",
        "demucs",
        "-n",
        "htdemucs",
        "--device",
        "cuda",
        "--float32",
        "-o",
        str(output_dir),
    ]
    if two_stem:
        command.extend(["--two-stems", "vocals"])
    command.append(str(source))

    completed = subprocess.run(command, capture_output=True, text=True, timeout=1500)
    if completed.returncode != 0:
        tail = (completed.stdout + "\n" + completed.stderr)[-8000:]
        raise RuntimeError(f"Demucs separation failed.\n{tail}")

    stem_dir = _demucs_output_dir(output_dir, source)
    if not stem_dir.is_dir():
        raise RuntimeError(f"Demucs output folder was not created: {stem_dir}")
    return stem_dir


def _format_lrc_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    minutes = int(seconds // 60)
    remaining = seconds - minutes * 60
    whole_seconds = int(remaining)
    centiseconds = int(round((remaining - whole_seconds) * 100))
    if centiseconds >= 100:
        whole_seconds += 1
        centiseconds = 0
    if whole_seconds >= 60:
        minutes += 1
        whole_seconds = 0
    return f"[{minutes:02d}:{whole_seconds:02d}.{centiseconds:02d}]"


def _publish_file(source: Path, job_id: str, label: str, file_base_url: str) -> tuple[str, str]:
    safe_label = _safe_label(label)
    filename = f"audio-{job_id}-{safe_label}{source.suffix.lower()}"
    destination = Path(OUTPUT_ROOT) / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return filename, f"{file_base_url}/{filename}"


@app.function(
    image=audio_image,
    timeout=3600,
    volumes={MODEL_ROOT: model_volume},
)
def prepare_audio_models() -> dict:
    """Download Demucs and faster-whisper models without allocating a GPU."""
    Path(MODEL_ROOT).mkdir(parents=True, exist_ok=True)

    from demucs.pretrained import get_model
    from huggingface_hub import snapshot_download

    get_model("htdemucs")
    whisper_dir = Path(MODEL_ROOT) / "faster-whisper-large-v3"
    if not whisper_dir.is_dir() or not any(whisper_dir.iterdir()):
        snapshot_download(
            repo_id="Systran/faster-whisper-large-v3",
            local_dir=str(whisper_dir),
        )

    model_volume.commit()
    return {
        "status": "ready",
        "demucs": "htdemucs",
        "whisper": "Systran/faster-whisper-large-v3",
    }


@app.cls(
    image=audio_image,
    gpu=AUDIO_GPU,
    timeout=1800,
    scaledown_window=180,
    volumes={MODEL_ROOT: model_volume, OUTPUT_ROOT: output_volume},
)
class AudioToolsEngine:
    @modal.method()
    def separate_stems(self, payload: dict, file_base_url: str) -> dict:
        file_url = str(payload.get("file_url") or "").strip()
        if not file_url:
            raise ValueError("file_url is required")

        mode = str(payload.get("mode") or "vocals_instrumental")
        if mode not in {"vocals_instrumental", "full"}:
            raise ValueError("mode must be vocals_instrumental or full")

        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])
        track_name = str(payload.get("track_name") or "track")

        with tempfile.TemporaryDirectory(prefix="ezway-stems-") as temp_name:
            temp_dir = Path(temp_name)
            source = _download_audio(file_url, temp_dir)
            separated_root = temp_dir / "separated"
            stem_dir = _run_demucs(source, separated_root, two_stem=mode == "vocals_instrumental")

            if mode == "vocals_instrumental":
                requested = {
                    "vocals": stem_dir / "vocals.wav",
                    "instrumental": stem_dir / "no_vocals.wav",
                }
            else:
                requested = {
                    "vocals": stem_dir / "vocals.wav",
                    "drums": stem_dir / "drums.wav",
                    "bass": stem_dir / "bass.wav",
                    "other": stem_dir / "other.wav",
                }

            missing = [name for name, path in requested.items() if not path.is_file()]
            if missing:
                raise RuntimeError(f"Missing Demucs outputs: {', '.join(missing)}")

            published: dict[str, str] = {}
            zip_path = temp_dir / f"{_safe_label(track_name)}-stems.zip"
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, path in requested.items():
                    _, public_url = _publish_file(path, job_id, name, file_base_url)
                    published[name] = public_url
                    archive.write(path, arcname=f"{_safe_label(track_name)}-{name}.wav")

            _, bundle_url = _publish_file(zip_path, job_id, "stems", file_base_url)
            output_volume.commit()

            return {
                "status": "completed",
                "job_id": job_id,
                "action": "stems",
                "mode": mode,
                "engine": "demucs-htdemucs",
                "files": published,
                "bundle_url": bundle_url,
            }

    @modal.method()
    def generate_synced_lyrics(self, payload: dict, file_base_url: str) -> dict:
        file_url = str(payload.get("file_url") or "").strip()
        if not file_url:
            raise ValueError("file_url is required")

        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])
        track_name = str(payload.get("track_name") or "track")

        with tempfile.TemporaryDirectory(prefix="ezway-lyrics-") as temp_name:
            temp_dir = Path(temp_name)
            source = _download_audio(file_url, temp_dir)
            separated_root = temp_dir / "separated"
            stem_dir = _run_demucs(source, separated_root, two_stem=True)
            vocal_path = stem_dir / "vocals.wav"
            if not vocal_path.is_file():
                raise RuntimeError("Vocal stem was not produced, so lyrics were not generated")

            whisper_dir = Path(MODEL_ROOT) / "faster-whisper-large-v3"
            if not whisper_dir.is_dir() or not any(whisper_dir.iterdir()):
                raise RuntimeError(
                    "Whisper model is not prepared. Run prepare_audio_models before transcription."
                )

            from faster_whisper import WhisperModel

            model = WhisperModel(
                str(whisper_dir),
                device="cuda",
                compute_type="float16",
                local_files_only=True,
            )
            segments, info = model.transcribe(
                str(vocal_path),
                beam_size=5,
                word_timestamps=True,
                condition_on_previous_text=False,
                vad_filter=False,
            )

            lrc_lines: list[str] = []
            plain_lines: list[str] = []
            for segment in segments:
                text = (segment.text or "").strip()
                if not text:
                    continue
                lrc_lines.append(f"{_format_lrc_time(segment.start)} {text}")
                plain_lines.append(text)

            if not lrc_lines:
                raise RuntimeError(
                    "No reliable vocal transcript was detected. Lyrics were left unchanged rather than invented."
                )

            lyrics = "\n".join(lrc_lines)
            lrc_path = temp_dir / f"{_safe_label(track_name)}.lrc"
            txt_path = temp_dir / f"{_safe_label(track_name)}-lyrics.txt"
            lrc_path.write_text(lyrics + "\n", encoding="utf-8")
            txt_path.write_text("\n".join(plain_lines) + "\n", encoding="utf-8")

            _, lrc_url = _publish_file(lrc_path, job_id, "lyrics", file_base_url)
            _, txt_url = _publish_file(txt_path, job_id, "lyrics-plain", file_base_url)
            _, vocals_url = _publish_file(vocal_path, job_id, "vocals", file_base_url)
            output_volume.commit()

            return {
                "status": "completed",
                "job_id": job_id,
                "action": "lyrics",
                "engine": "demucs-htdemucs+faster-whisper-large-v3",
                "language": getattr(info, "language", None),
                "language_probability": getattr(info, "language_probability", None),
                "lyrics": lyrics,
                "files": {
                    "lrc": lrc_url,
                    "plain": txt_url,
                    "vocals": vocals_url,
                },
            }


@app.function(
    image=web_image,
    volumes={OUTPUT_ROOT: output_volume},
)
@modal.concurrent(max_inputs=30)
@modal.asgi_app(requires_proxy_auth=REQUIRE_PROXY_AUTH)
def audio_tools_api():
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse

    web = FastAPI(title="EZ-WAY Audio Tools")
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @web.get("/health")
    async def health():
        return {
            "status": "ok",
            "gpu": AUDIO_GPU,
            "tools": ["synced_lyrics", "vocals_instrumental", "full_stems"],
        }

    @web.post("/jobs")
    async def create_job(request: Request):
        payload = await request.json()
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="JSON body is required")

        action = str(payload.get("action") or "").strip()
        file_url = str(payload.get("file_url") or "").strip()
        if action not in {"lyrics", "stems"}:
            raise HTTPException(status_code=400, detail="action must be lyrics or stems")
        if not file_url or file_url.startswith("blob:"):
            raise HTTPException(
                status_code=400,
                detail="A cloud-accessible track file_url is required for Audio Tools",
            )

        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])
        base_url = str(request.base_url).rstrip("/")
        file_base_url = f"{base_url}/files"
        engine = AudioToolsEngine()

        if action == "lyrics":
            call = engine.generate_synced_lyrics.spawn(
                payload={**payload, "job_id": job_id},
                file_base_url=file_base_url,
            )
        else:
            mode = str(payload.get("mode") or "vocals_instrumental")
            if mode not in {"vocals_instrumental", "full"}:
                raise HTTPException(status_code=400, detail="Invalid stem mode")
            call = engine.separate_stems.spawn(
                payload={**payload, "job_id": job_id, "mode": mode},
                file_base_url=file_base_url,
            )

        return {
            "status": "accepted",
            "job_id": job_id,
            "call_id": call.object_id,
            "action": action,
            "gpu": AUDIO_GPU,
        }

    @web.get("/jobs/{call_id}")
    async def get_job(call_id: str):
        function_call = modal.FunctionCall.from_id(call_id)
        try:
            result = function_call.get(timeout=0)
        except TimeoutError:
            return JSONResponse({"status": "running", "call_id": call_id}, status_code=202)
        except modal.exception.OutputExpiredError:
            return JSONResponse({"error": "Job result expired"}, status_code=404)
        except Exception as error:
            return JSONResponse(
                {"status": "failed", "error": f"{type(error).__name__}: {error}"},
                status_code=500,
            )
        return result

    @web.get("/files/{filename}")
    async def get_file(filename: str):
        safe_name = Path(filename).name
        if safe_name != filename or not safe_name.startswith("audio-"):
            return JSONResponse({"error": "Invalid filename"}, status_code=400)
        if Path(safe_name).suffix.lower() not in {".wav", ".zip", ".lrc", ".txt"}:
            return JSONResponse({"error": "Unsupported file type"}, status_code=400)

        output_volume.reload()
        filepath = Path(OUTPUT_ROOT) / safe_name
        if not filepath.is_file():
            return JSONResponse({"error": "Audio output not found"}, status_code=404)

        media_types = {
            ".wav": "audio/wav",
            ".zip": "application/zip",
            ".lrc": "text/plain; charset=utf-8",
            ".txt": "text/plain; charset=utf-8",
        }
        return FileResponse(
            filepath,
            media_type=media_types[filepath.suffix.lower()],
            filename=safe_name,
        )

    return web

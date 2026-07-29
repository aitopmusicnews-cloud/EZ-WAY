from __future__ import annotations

import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path

import modal

import audio_tools_agent_v2 as base

# Reuse the existing app, Volumes, model cache, and stable endpoint name.
app = base.app

# Faster-Whisper/CTranslate2 GPU execution requires CUDA 12 cuBLAS and cuDNN 9.
# TorchAudio also needs TorchCodec to write Demucs WAV outputs. All dependency
# and environment build steps MUST happen before add_local_python_source().
CUDA_LIBRARY_PATH = (
    "/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:"
    "/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib"
)

audio_image = (
    base.audio_image
    .uv_pip_install(
        "torchcodec>=0.13,<0.14",
        "nvidia-cublas-cu12",
        "nvidia-cudnn-cu12==9.*",
    )
    .env({"LD_LIBRARY_PATH": CUDA_LIBRARY_PATH})
    .add_local_python_source("audio_tools_agent_v2")
)

web_image = base.web_image.add_local_python_source("audio_tools_agent_v2")


def _run_demucs(source: Path, output_dir: Path, two_stem: bool) -> Path:
    base._configure_runtime_cache()
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
        combined = (completed.stdout + "\n" + completed.stderr).strip()
        tail = combined[-2500:]
        raise RuntimeError(f"Demucs separation failed.\n{tail}")

    stem_dir = output_dir / "htdemucs" / source.stem
    if not stem_dir.is_dir():
        raise RuntimeError(f"Demucs output folder was not created: {stem_dir}")
    return stem_dir


@app.cls(
    image=audio_image,
    gpu=base.AUDIO_GPU,
    timeout=1800,
    scaledown_window=180,
    volumes={base.MODEL_ROOT: base.model_volume, base.OUTPUT_ROOT: base.output_volume},
)
class AudioToolsEngineV4:
    @modal.enter()
    def configure_runtime(self) -> None:
        base._configure_runtime_cache()

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
            source = base._download_audio(file_url, temp_dir)
            stem_dir = _run_demucs(
                source,
                temp_dir / "separated",
                two_stem=mode == "vocals_instrumental",
            )

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
            zip_path = temp_dir / f"{base._safe_label(track_name)}-stems.zip"
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, path in requested.items():
                    _, public_url = base._publish_file(path, job_id, name, file_base_url)
                    published[name] = public_url
                    archive.write(path, arcname=f"{base._safe_label(track_name)}-{name}.wav")

            _, bundle_url = base._publish_file(zip_path, job_id, "stems", file_base_url)
            base.output_volume.commit()

            return {
                "status": "completed",
                "job_id": job_id,
                "action": "stems",
                "mode": mode,
                "engine": "demucs-htdemucs+torchcodec",
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
            source = base._download_audio(file_url, temp_dir)
            stem_dir = _run_demucs(source, temp_dir / "separated", two_stem=True)
            vocal_path = stem_dir / "vocals.wav"
            if not vocal_path.is_file():
                raise RuntimeError("Vocal stem was not produced, so lyrics were not generated")

            whisper_dir = Path(base.MODEL_ROOT) / "faster-whisper-large-v3"
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
                lrc_lines.append(f"{base._format_lrc_time(segment.start)} {text}")
                plain_lines.append(text)

            if not lrc_lines:
                raise RuntimeError(
                    "No reliable vocal transcript was detected. Lyrics were left unchanged rather than invented."
                )

            lyrics = "\n".join(lrc_lines)
            lrc_path = temp_dir / f"{base._safe_label(track_name)}.lrc"
            txt_path = temp_dir / f"{base._safe_label(track_name)}-lyrics.txt"
            lrc_path.write_text(lyrics + "\n", encoding="utf-8")
            txt_path.write_text("\n".join(plain_lines) + "\n", encoding="utf-8")

            _, lrc_url = base._publish_file(lrc_path, job_id, "lyrics", file_base_url)
            _, txt_url = base._publish_file(txt_path, job_id, "lyrics-plain", file_base_url)
            _, vocals_url = base._publish_file(vocal_path, job_id, "vocals", file_base_url)
            base.output_volume.commit()

            return {
                "status": "completed",
                "job_id": job_id,
                "action": "lyrics",
                "engine": "demucs+torchcodec+faster-whisper-large-v3+cuda12",
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
    volumes={base.OUTPUT_ROOT: base.output_volume},
)
@modal.concurrent(max_inputs=30)
@modal.asgi_app(requires_proxy_auth=base.REQUIRE_PROXY_AUTH)
def audio_tools_api_fixed():
    from fastapi import Body, FastAPI, HTTPException
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
            "gpu": base.AUDIO_GPU,
            "tools": ["synced_lyrics", "vocals_instrumental", "full_stems"],
            "api": "fixed-json-body",
            "runtime": "torchcodec-0.13+whisper-cuda12-v4",
        }

    @web.post("/jobs")
    async def create_job(payload: dict = Body(...)):
        action = str(payload.get("action") or "").strip()
        file_url = str(payload.get("file_url") or "").strip()
        public_base_url = str(payload.get("public_base_url") or "").strip().rstrip("/")

        if action not in {"lyrics", "stems"}:
            raise HTTPException(status_code=400, detail="action must be lyrics or stems")
        if not file_url or file_url.startswith("blob:"):
            raise HTTPException(
                status_code=400,
                detail="A cloud-accessible track file_url is required for Audio Tools",
            )
        if not public_base_url.startswith("https://"):
            raise HTTPException(status_code=400, detail="Audio Tools public_base_url is required")

        job_id = str(payload.get("job_id") or uuid.uuid4().hex[:16])
        file_base_url = f"{public_base_url}/files"
        engine = AudioToolsEngineV4()

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
            "gpu": base.AUDIO_GPU,
        }

    @web.get("/jobs/{call_id}")
    async def get_job(call_id: str):
        function_call = modal.FunctionCall.from_id(call_id)
        try:
            result = await function_call.get.aio(timeout=0)
        except TimeoutError:
            return JSONResponse({"status": "running", "call_id": call_id}, status_code=202)
        except modal.exception.OutputExpiredError:
            return JSONResponse({"error": "Job result expired"}, status_code=404)
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            if len(message) > 3000:
                message = message[-3000:]
            return JSONResponse({"status": "failed", "error": message}, status_code=500)
        return result

    @web.get("/files/{filename}")
    async def get_file(filename: str):
        safe_name = Path(filename).name
        if safe_name != filename or not safe_name.startswith("audio-"):
            return JSONResponse({"error": "Invalid filename"}, status_code=400)
        if Path(safe_name).suffix.lower() not in {".wav", ".zip", ".lrc", ".txt"}:
            return JSONResponse({"error": "Unsupported file type"}, status_code=400)

        base.output_volume.reload()
        filepath = Path(base.OUTPUT_ROOT) / safe_name
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

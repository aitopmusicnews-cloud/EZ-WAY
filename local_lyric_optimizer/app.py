from __future__ import annotations

from pathlib import Path
import tempfile
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import OptimizerConfig, ServiceConfig
from .transcriber import FasterWhisperTranscriber, TranscriptionResult


SERVICE_NAME = "ezway-local-lyric-optimizer"
_ALLOWED_SUFFIXES = {".mp3", ".wav"}
_CHUNK_SIZE = 1024 * 1024


def _serialize_result(result: TranscriptionResult) -> dict[str, Any]:
    return {
        "text": result.text,
        "language": result.language,
        "language_probability": result.language_probability,
        "segments": [
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
            }
            for segment in result.segments
        ],
    }


async def _save_upload(upload: UploadFile, max_bytes: int, suffix: str) -> Path:
    temp_path: Path | None = None
    total = 0
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = Path(temp_file.name)
            while True:
                chunk = await upload.read(_CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="Audio file exceeds the configured upload limit.")
                temp_file.write(chunk)

        if total == 0:
            raise HTTPException(status_code=422, detail="Audio file is empty.")
        return temp_path
    except Exception:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


def create_app(
    *,
    optimizer_config: OptimizerConfig | None = None,
    service_config: ServiceConfig | None = None,
    transcriber: FasterWhisperTranscriber | Any | None = None,
) -> FastAPI:
    optimizer = optimizer_config or OptimizerConfig.from_env()
    service = service_config or ServiceConfig.from_env()
    lyric_transcriber = transcriber or FasterWhisperTranscriber(optimizer)

    app = FastAPI(title="EZ-WAY Local Lyric Optimizer")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(service.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.state.optimizer_config = optimizer
    app.state.service_config = service
    app.state.transcriber = lyric_transcriber

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "service": SERVICE_NAME,
            "model": optimizer.model_size,
            "device": optimizer.device,
            "compute_type": optimizer.compute_type,
        }

    @app.post("/lyrics/transcribe")
    async def transcribe_lyrics(
        file: UploadFile = File(...),
        language: str = Form(""),
    ) -> dict[str, Any]:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in _ALLOWED_SUFFIXES:
            raise HTTPException(status_code=415, detail="Only MP3 or WAV audio files are supported.")

        max_bytes = service.max_upload_mb * 1024 * 1024
        temp_path = await _save_upload(file, max_bytes, suffix)
        try:
            try:
                result = lyric_transcriber.transcribe(temp_path, language.strip() or None)
            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Local lyric model could not transcribe this file.",
                ) from exc

            if not result.text.strip():
                raise HTTPException(status_code=422, detail="No usable lyrics were detected.")
            return _serialize_result(result)
        finally:
            temp_path.unlink(missing_ok=True)

    return app


app = create_app()

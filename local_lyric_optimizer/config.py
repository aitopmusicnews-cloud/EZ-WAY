from __future__ import annotations

from dataclasses import dataclass
import os


DEFAULT_ALLOWED_ORIGINS = (
    "https://ezwaypro.theartistcut.com",
    "https://main.d1wu55zn1feotm.amplifyapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


@dataclass(frozen=True)
class OptimizerConfig:
    model_size: str = "small"
    cpu_threads: int = 4
    device: str = "cpu"
    compute_type: str = "int8"

    @classmethod
    def from_env(cls) -> "OptimizerConfig":
        model_size = os.getenv("LYRIC_MODEL_SIZE", "small").strip().lower()
        if model_size not in {"base", "small"}:
            model_size = "small"

        default_threads = max(1, min(8, os.cpu_count() or 4))
        raw_threads = os.getenv("LYRIC_CPU_THREADS", str(default_threads)).strip()
        try:
            cpu_threads = max(1, int(raw_threads))
        except ValueError:
            cpu_threads = default_threads

        return cls(model_size=model_size, cpu_threads=cpu_threads)


@dataclass(frozen=True)
class ServiceConfig:
    host: str = "127.0.0.1"
    port: int = 8765
    max_upload_mb: int = 250
    allowed_origins: tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS
    youtube_api_key: str = ""

    @classmethod
    def from_env(cls) -> "ServiceConfig":
        host = os.getenv("LYRIC_SERVICE_HOST", "127.0.0.1").strip() or "127.0.0.1"

        try:
            port = max(1, min(65535, int(os.getenv("LYRIC_SERVICE_PORT", "8765"))))
        except ValueError:
            port = 8765

        try:
            max_upload_mb = max(1, int(os.getenv("LYRIC_MAX_UPLOAD_MB", "250")))
        except ValueError:
            max_upload_mb = 250

        raw_origins = os.getenv("EZWAY_ALLOWED_ORIGINS", "").strip()
        if raw_origins:
            allowed_origins = tuple(
                origin.strip().rstrip("/")
                for origin in raw_origins.split(",")
                if origin.strip() and origin.strip() != "*"
            )
        else:
            allowed_origins = DEFAULT_ALLOWED_ORIGINS

        return cls(
            host=host,
            port=port,
            max_upload_mb=max_upload_mb,
            allowed_origins=allowed_origins,
            youtube_api_key=os.getenv("YOUTUBE_API_KEY", "").strip(),
        )

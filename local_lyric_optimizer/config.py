from __future__ import annotations

from dataclasses import dataclass
import os


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

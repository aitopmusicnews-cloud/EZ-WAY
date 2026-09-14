from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .config import OptimizerConfig


@dataclass(frozen=True)
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: str | None
    language_probability: float | None
    segments: list[TranscriptSegment]


class FasterWhisperTranscriber:
    def __init__(
        self,
        config: OptimizerConfig | None = None,
        *,
        model_class: type[Any] | None = None,
        model: Any | None = None,
    ) -> None:
        self.config = config or OptimizerConfig.from_env()
        self.model_class = model_class
        self._model = model

    def _get_model(self) -> Any:
        if self._model is not None:
            return self._model

        model_class = self.model_class
        if model_class is None:
            from faster_whisper import WhisperModel

            model_class = WhisperModel

        self._model = model_class(
            self.config.model_size,
            device="cpu",
            compute_type="int8",
            cpu_threads=self.config.cpu_threads,
        )
        return self._model

    @staticmethod
    def _clean_text(value: object) -> str:
        return " ".join(str(value or "").split()).strip()

    def _normalize_segments(self, segments: Iterable[Any]) -> list[TranscriptSegment]:
        accepted: list[TranscriptSegment] = []
        previous_key = ""

        for segment in segments:
            text = self._clean_text(getattr(segment, "text", ""))
            if not text:
                continue

            key = text.casefold()
            if key == previous_key:
                continue

            start = float(getattr(segment, "start", 0.0) or 0.0)
            end = float(getattr(segment, "end", start) or start)
            accepted.append(TranscriptSegment(start=start, end=end, text=text))
            previous_key = key

        return accepted

    def transcribe(self, path: Path, language: str | None = None) -> TranscriptionResult:
        model = self._get_model()
        raw_segments, info = model.transcribe(
            str(path),
            language=language or None,
            vad_filter=True,
            beam_size=5,
        )
        segments = self._normalize_segments(raw_segments)
        text = "\n".join(segment.text for segment in segments).strip()

        raw_probability = getattr(info, "language_probability", None)
        probability = float(raw_probability) if raw_probability is not None else None
        raw_language = getattr(info, "language", None)

        return TranscriptionResult(
            text=text,
            language=str(raw_language) if raw_language else None,
            language_probability=probability,
            segments=segments,
        )

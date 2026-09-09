from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

WORKER_DIR = Path(__file__).resolve().parents[1] / "aws" / "audio-tools" / "worker"
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from analyzer import MODEL_ROOT, download_audio  # noqa: E402
from render_audio_tools.mirflex_analyzer import (  # noqa: E402
    ANALYZER_VERSION,
    MirflexMusicIntelligenceEngine,
)

AUDIO_SUFFIXES = {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_label(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value).strip()).strip("-._")
    return clean[:80] or "track"


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


def download_source(
    payload: dict[str, Any],
    target_dir: Path,
    *,
    source_bucket: str,
    s3_client: Any,
    http_downloader: Callable[[str, Path], Path] = download_audio,
) -> Path:
    file_key = str(payload.get("file_key") or "").strip()
    if file_key:
        if not str(source_bucket or "").strip():
            raise RuntimeError("SOURCE_BUCKET is required when a job supplies file_key.")
        suffix = Path(file_key).suffix.lower()
        if suffix not in AUDIO_SUFFIXES:
            suffix = ".mp3"
        destination = target_dir / f"source{suffix}"
        s3_client.download_file(str(source_bucket), file_key, str(destination))
        return destination

    file_url = str(payload.get("file_url") or "").strip()
    if not file_url:
        raise RuntimeError("Audio job has no file_key or file_url source.")
    return http_downloader(file_url, target_dir)


def _run_demucs(source: Path, output_dir: Path, two_stem: bool) -> Path:
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("TORCH_HOME", str(MODEL_ROOT / "torch"))
    command = [
        "demucs-infer",
        "-n",
        "htdemucs",
        "--device",
        "cpu",
        "--float32",
        "-o",
        str(output_dir),
    ]
    if two_stem:
        command.extend(["--two-stems", "vocals"])
    command.append(str(source))
    completed = subprocess.run(command, capture_output=True, text=True, timeout=3300)
    if completed.returncode != 0:
        combined = (completed.stdout + "\n" + completed.stderr).strip()
        raise RuntimeError(f"Demucs separation failed.\n{combined[-2500:]}")
    stem_dir = output_dir / "htdemucs" / source.stem
    if not stem_dir.is_dir():
        raise RuntimeError(f"Demucs output folder was not created: {stem_dir}")
    return stem_dir


def whisper_model_name() -> str:
    return str(os.getenv("WHISPER_MODEL") or "base").strip() or "base"


def _build_whisper_model() -> Any:
    from faster_whisper import WhisperModel

    model_name = whisper_model_name()
    whisper_root = MODEL_ROOT / f"faster-whisper-{_safe_label(model_name)}"
    return WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        download_root=str(whisper_root),
    )


class AudioProcessor:
    def __init__(
        self,
        *,
        state: Any,
        source_bucket: str | None = None,
        output_bucket: str | None = None,
        s3_client: Any | None = None,
        analysis_engine_factory: Callable[[], Any] = MirflexMusicIntelligenceEngine,
        demucs_runner: Callable[[Path, Path, bool], Path] = _run_demucs,
        whisper_model_factory: Callable[[], Any] = _build_whisper_model,
        http_downloader: Callable[[str, Path], Path] = download_audio,
        presigned_seconds: int | None = None,
    ) -> None:
        self.state = state
        self.source_bucket = str(
            source_bucket if source_bucket is not None else os.getenv("SOURCE_BUCKET") or ""
        ).strip()
        self.output_bucket = str(
            output_bucket if output_bucket is not None else os.getenv("OUTPUT_BUCKET") or ""
        ).strip()
        if s3_client is None:
            import boto3

            region = str(
                os.getenv("AWS_REGION")
                or os.getenv("AWS_DEFAULT_REGION")
                or "us-west-2"
            ).strip()
            s3_client = boto3.client("s3", region_name=region)
        self.s3 = s3_client
        self.analysis_engine_factory = analysis_engine_factory
        self.demucs_runner = demucs_runner
        self.whisper_model_factory = whisper_model_factory
        self.http_downloader = http_downloader
        self.presigned_seconds = int(
            presigned_seconds
            if presigned_seconds is not None
            else os.getenv("PRESIGNED_SECONDS", "86400")
        )
        self._analysis_engine: Any | None = None

    def _upload_output(self, path: Path, job_id: str, label: str) -> str:
        if not self.output_bucket:
            raise RuntimeError("OUTPUT_BUCKET is required for generated audio files.")
        key = f"audio-tools/{_safe_label(job_id)}/{_safe_label(label)}{path.suffix.lower()}"
        self.s3.upload_file(str(path), self.output_bucket, key)
        return self.s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.output_bucket, "Key": key},
            ExpiresIn=self.presigned_seconds,
        )

    def _analysis(self, payload: dict[str, Any], source: Path) -> dict[str, Any]:
        if self._analysis_engine is None:
            self._analysis_engine = self.analysis_engine_factory()
        profile = self._analysis_engine.analyze_file(source)
        now = _now_iso()
        track_id = str(payload.get("track_id") or "").strip()
        if track_id:
            self.state.save_track_analysis({
                "track_id": track_id,
                "analyzer_version": str(profile.get("version") or ANALYZER_VERSION),
                "profile": profile,
                "status": "ready",
                "error": None,
                "source_fingerprint": payload.get("source_fingerprint"),
                "created_at": now,
                "updated_at": now,
            })
        return {"profile": profile}

    def _lyrics(self, payload: dict[str, Any], source: Path, temp_dir: Path) -> dict[str, Any]:
        job_id = str(payload.get("job_id") or payload.get("call_id") or "job")
        track_name = str(payload.get("track_name") or "track")

        model = self.whisper_model_factory()
        segments, info = model.transcribe(
            str(source),
            beam_size=1,
            word_timestamps=False,
            condition_on_previous_text=False,
            vad_filter=False,
        )
        lrc_lines: list[str] = []
        plain_lines: list[str] = []
        for segment in segments:
            text = str(getattr(segment, "text", "") or "").strip()
            if text:
                lrc_lines.append(f"{_format_lrc_time(getattr(segment, 'start', 0.0))} {text}")
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
        return {
            "lyrics": lyrics,
            "language": getattr(info, "language", None),
            "language_probability": getattr(info, "language_probability", None),
            "files": {
                "lrc": self._upload_output(lrc_path, job_id, "lyrics"),
                "plain": self._upload_output(txt_path, job_id, "lyrics-plain"),
            },
        }

    def _stems(self, payload: dict[str, Any], source: Path, temp_dir: Path) -> dict[str, Any]:
        job_id = str(payload.get("job_id") or payload.get("call_id") or "job")
        track_name = str(payload.get("track_name") or "track")
        mode = str(payload.get("mode") or "vocals_instrumental")
        stem_dir = self.demucs_runner(
            source,
            temp_dir / "separated",
            mode == "vocals_instrumental",
        )
        requested = (
            {
                "vocals": stem_dir / "vocals.wav",
                "instrumental": stem_dir / "no_vocals.wav",
            }
            if mode == "vocals_instrumental"
            else {
                "vocals": stem_dir / "vocals.wav",
                "drums": stem_dir / "drums.wav",
                "bass": stem_dir / "bass.wav",
                "other": stem_dir / "other.wav",
            }
        )
        missing = [name for name, path in requested.items() if not path.is_file()]
        if missing:
            raise RuntimeError(f"Missing Demucs outputs: {', '.join(missing)}")

        published = {
            name: self._upload_output(path, job_id, name)
            for name, path in requested.items()
        }
        zip_path = temp_dir / f"{_safe_label(track_name)}-stems.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, path in requested.items():
                archive.write(path, arcname=f"{_safe_label(track_name)}-{name}.wav")
        return {
            "mode": mode,
            "files": published,
            "bundle_url": self._upload_output(zip_path, job_id, "stems"),
        }

    def process(self, payload: dict[str, Any]) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="ezway-render-audio-") as temp_name:
            temp_dir = Path(temp_name)
            source = download_source(
                payload,
                temp_dir,
                source_bucket=self.source_bucket,
                s3_client=self.s3,
                http_downloader=self.http_downloader,
            )
            action = str(payload.get("action") or "").strip()
            if action == "analysis":
                return self._analysis(payload, source)
            if action == "lyrics":
                return self._lyrics(payload, source, temp_dir)
            if action == "stems":
                return self._stems(payload, source, temp_dir)
            raise ValueError(f"Unsupported Audio Tools action: {action}")

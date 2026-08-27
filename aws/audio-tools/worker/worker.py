from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import time
import zipfile
from decimal import Decimal
from pathlib import Path
from typing import Any

import boto3

from analyzer import ANALYZER_VERSION, MODEL_ROOT, MusicIntelligenceEngine, download_audio

QUEUE_URL = os.environ["QUEUE_URL"]
JOBS_TABLE = os.environ["JOBS_TABLE"]
TRACK_ANALYSIS_TABLE = os.environ["TRACK_ANALYSIS_TABLE"]
OUTPUT_BUCKET = os.environ["OUTPUT_BUCKET"]
AWS_REGION = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-west-2"))
VISIBILITY_TIMEOUT = int(os.getenv("VISIBILITY_TIMEOUT", "3600"))
PRESIGNED_SECONDS = int(os.getenv("PRESIGNED_SECONDS", "86400"))

sqs = boto3.client("sqs", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
jobs_table = dynamodb.Table(JOBS_TABLE)
track_analysis_table = dynamodb.Table(TRACK_ANALYSIS_TABLE)

_analysis_engine: MusicIntelligenceEngine | None = None


def _ddb_safe(value: Any) -> Any:
    return json.loads(json.dumps(value), parse_float=Decimal)


def _now_iso() -> str:
    from datetime import datetime, timezone

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


def _load_job(call_id: str) -> dict[str, Any]:
    return jobs_table.get_item(Key={"call_id": call_id}, ConsistentRead=True).get("Item") or {}


def _save_job(call_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    item = _load_job(call_id)
    item.update(updates)
    item["call_id"] = call_id
    item["updated_at"] = _now_iso()
    jobs_table.put_item(Item=_ddb_safe(item))
    return item


def _upload_output(path: Path, job_id: str, label: str) -> str:
    key = f"audio-tools/{job_id}/{_safe_label(label)}{path.suffix.lower()}"
    s3.upload_file(str(path), OUTPUT_BUCKET, key)
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": OUTPUT_BUCKET, "Key": key},
        ExpiresIn=PRESIGNED_SECONDS,
    )


def _run_demucs(source: Path, output_dir: Path, two_stem: bool) -> Path:
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("TORCH_HOME", str(MODEL_ROOT / "torch"))
    command = [
        "python", "-m", "demucs", "-n", "htdemucs", "--device", "cpu", "--float32",
        "-o", str(output_dir),
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


def _analysis(payload: dict[str, Any]) -> dict[str, Any]:
    global _analysis_engine
    if _analysis_engine is None:
        _analysis_engine = MusicIntelligenceEngine()
    profile = _analysis_engine.analyze_url(str(payload["file_url"]))
    return {"profile": profile}


def _lyrics(payload: dict[str, Any]) -> dict[str, Any]:
    from faster_whisper import WhisperModel

    job_id = str(payload["job_id"])
    track_name = str(payload.get("track_name") or "track")
    with tempfile.TemporaryDirectory(prefix="ezway-aws-lyrics-") as temp_name:
        temp_dir = Path(temp_name)
        source = download_audio(str(payload["file_url"]), temp_dir)
        stem_dir = _run_demucs(source, temp_dir / "separated", two_stem=True)
        vocal_path = stem_dir / "vocals.wav"
        if not vocal_path.is_file():
            raise RuntimeError("Vocal stem was not produced, so lyrics were not generated.")

        whisper_root = MODEL_ROOT / "faster-whisper-large-v3"
        model = WhisperModel(
            "large-v3",
            device="cpu",
            compute_type="int8",
            download_root=str(whisper_root),
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
            if text:
                lrc_lines.append(f"{_format_lrc_time(segment.start)} {text}")
                plain_lines.append(text)
        if not lrc_lines:
            raise RuntimeError("No reliable vocal transcript was detected. Lyrics were left unchanged rather than invented.")

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
                "lrc": _upload_output(lrc_path, job_id, "lyrics"),
                "plain": _upload_output(txt_path, job_id, "lyrics-plain"),
                "vocals": _upload_output(vocal_path, job_id, "vocals"),
            },
        }


def _stems(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload["job_id"])
    track_name = str(payload.get("track_name") or "track")
    mode = str(payload.get("mode") or "vocals_instrumental")
    with tempfile.TemporaryDirectory(prefix="ezway-aws-stems-") as temp_name:
        temp_dir = Path(temp_name)
        source = download_audio(str(payload["file_url"]), temp_dir)
        stem_dir = _run_demucs(source, temp_dir / "separated", two_stem=mode == "vocals_instrumental")
        requested = (
            {"vocals": stem_dir / "vocals.wav", "instrumental": stem_dir / "no_vocals.wav"}
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

        published = {name: _upload_output(path, job_id, name) for name, path in requested.items()}
        zip_path = temp_dir / f"{_safe_label(track_name)}-stems.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, path in requested.items():
                archive.write(path, arcname=f"{_safe_label(track_name)}-{name}.wav")
        return {
            "mode": mode,
            "files": published,
            "bundle_url": _upload_output(zip_path, job_id, "stems"),
        }


def _process_message(payload: dict[str, Any]) -> None:
    call_id = str(payload["call_id"])
    job_id = str(payload.get("job_id") or call_id)
    action = str(payload["action"])
    _save_job(call_id, {"status": "running", "error": None})

    try:
        if action == "analysis":
            result = _analysis(payload)
        elif action == "lyrics":
            result = _lyrics(payload)
        elif action == "stems":
            result = _stems(payload)
        else:
            raise ValueError(f"Unsupported Audio Tools action: {action}")

        completed = {
            "status": "completed",
            "job_id": job_id,
            "action": action,
            **result,
        }
        _save_job(call_id, completed)

        if action == "analysis" and result.get("profile") and payload.get("track_id"):
            profile = result["profile"]
            track_analysis_table.put_item(Item=_ddb_safe({
                "track_id": str(payload["track_id"]),
                "analyzer_version": str(profile.get("version") or ANALYZER_VERSION),
                "profile": profile,
                "status": "ready",
                "error": None,
                "source_fingerprint": payload.get("source_fingerprint"),
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }))
    except Exception as error:
        _save_job(call_id, {
            "status": "failed",
            "job_id": job_id,
            "action": action,
            "error": f"{type(error).__name__}: {error}",
        })


def run_forever() -> None:
    print(f"[AwsAudioToolsWorker] Starting in {AWS_REGION}; queue={QUEUE_URL}", flush=True)
    while True:
        result = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,
            VisibilityTimeout=VISIBILITY_TIMEOUT,
        )
        messages = result.get("Messages") or []
        if not messages:
            continue
        message = messages[0]
        receipt = message["ReceiptHandle"]
        try:
            payload = json.loads(message["Body"])
            _process_message(payload)
            sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=receipt)
        except Exception as error:
            print(f"[AwsAudioToolsWorker] Message handling failed: {type(error).__name__}: {error}", flush=True)
            time.sleep(2)


if __name__ == "__main__":
    run_forever()

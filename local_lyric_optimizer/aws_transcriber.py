"""
Amazon Transcribe-backed transcriber.

Replaces FasterWhisperTranscriber for cloud deployments.
Uploads audio to a temporary S3 object, starts a Transcribe job,
polls until complete, returns the same TranscriptionResult shape
the rest of the app expects.
"""
from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

import boto3

from .config import OptimizerConfig
from .transcriber import TranscriptSegment, TranscriptionResult

_POLL_INTERVAL_SECONDS = 3
_MAX_WAIT_SECONDS = 300  # 5 minutes


class AWSTranscriber:
    """Transcribe audio using Amazon Transcribe + S3."""

    def __init__(
        self,
        config: OptimizerConfig | None = None,
        *,
        bucket: str,
        region: str = "us-west-2",
    ) -> None:
        self.config = config or OptimizerConfig.from_env()
        self.bucket = bucket
        self.region = region
        self._s3 = boto3.client("s3", region_name=region)
        self._transcribe = boto3.client("transcribe", region_name=region)

    # ------------------------------------------------------------------
    # Public interface (same as FasterWhisperTranscriber)
    # ------------------------------------------------------------------

    def transcribe(self, path: Path, language: str | None = None) -> TranscriptionResult:
        key = f"transcribe-tmp/{uuid.uuid4().hex}{path.suffix.lower()}"
        job_name = f"ezway-{uuid.uuid4().hex}"

        # 1. Upload audio to S3
        self._s3.upload_file(str(path), self.bucket, key)

        try:
            # 2. Start transcription job
            media_uri = f"s3://{self.bucket}/{key}"
            kwargs: dict[str, Any] = {
                "TranscriptionJobName": job_name,
                "Media": {"MediaFileUri": media_uri},
                "OutputBucketName": self.bucket,
                "OutputKey": f"transcribe-tmp/{job_name}.json",
            }
            if language:
                # Amazon Transcribe uses BCP-47 codes e.g. "en-US"
                kwargs["LanguageCode"] = _to_transcribe_language(language)
            else:
                kwargs["IdentifyLanguage"] = True

            self._transcribe.start_transcription_job(**kwargs)

            # 3. Poll for completion
            result_key = _poll_for_result(self._transcribe, job_name, _MAX_WAIT_SECONDS)

            # 4. Download and parse result
            response = self._s3.get_object(Bucket=self.bucket, Key=result_key)
            import json
            payload = json.loads(response["Body"].read())
            return _parse_transcribe_result(payload)

        finally:
            # 5. Clean up S3 objects
            _delete_s3_key(self._s3, self.bucket, key)
            _delete_s3_key(self._s3, self.bucket, f"transcribe-tmp/{job_name}.json")


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _to_transcribe_language(code: str) -> str:
    """Map short codes like 'en' to Transcribe codes like 'en-US'."""
    mapping = {
        "en": "en-US",
        "es": "es-US",
        "fr": "fr-FR",
        "de": "de-DE",
        "pt": "pt-BR",
        "it": "it-IT",
        "ja": "ja-JP",
        "ko": "ko-KR",
        "zh": "zh-CN",
    }
    clean = str(code or "").strip().lower()
    return mapping.get(clean, clean if "-" in clean else f"{clean}-{clean.upper()}")


def _poll_for_result(
    transcribe_client: Any,
    job_name: str,
    max_wait: int,
) -> str:
    """Poll until job completes, return the S3 output key."""
    waited = 0
    while waited < max_wait:
        response = transcribe_client.get_transcription_job(
            TranscriptionJobName=job_name
        )
        status = response["TranscriptionJob"]["TranscriptionJobStatus"]
        if status == "COMPLETED":
            uri: str = response["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
            # URI is like https://s3.amazonaws.com/bucket/key
            # Extract just the key portion
            parts = uri.split(".amazonaws.com/", 1)
            path_part = parts[-1] if len(parts) > 1 else uri
            # Remove bucket prefix if present
            bucket_prefix = response["TranscriptionJob"]["Media"]["MediaFileUri"] \
                .split(".amazonaws.com/")[1].split("/")[0]
            if path_part.startswith(bucket_prefix + "/"):
                path_part = path_part[len(bucket_prefix) + 1:]
            return path_part
        if status == "FAILED":
            reason = response["TranscriptionJob"].get("FailureReason", "Unknown error")
            raise RuntimeError(f"Amazon Transcribe job failed: {reason}")
        time.sleep(_POLL_INTERVAL_SECONDS)
        waited += _POLL_INTERVAL_SECONDS
    raise TimeoutError(f"Amazon Transcribe job did not complete within {max_wait}s")


def _parse_transcribe_result(payload: dict[str, Any]) -> TranscriptionResult:
    """Convert Amazon Transcribe JSON output to TranscriptionResult."""
    results = payload.get("results", {})

    # Full transcript text
    transcripts = results.get("transcripts", [])
    full_text = transcripts[0].get("transcript", "").strip() if transcripts else ""

    # Build segments from items (word-level tokens)
    segments = _build_segments_from_items(results.get("items", []))

    # Detected language
    language_code = payload.get("results", {}).get("language_code") or \
                    payload.get("results", {}).get("language_identification", [{}])[0].get("code")
    language = language_code.split("-")[0] if language_code else None

    return TranscriptionResult(
        text=full_text,
        language=language,
        language_probability=1.0 if language else None,
        segments=segments,
    )


def _build_segments_from_items(items: list[dict]) -> list[TranscriptSegment]:
    """
    Group word-level items into line segments (split on punctuation pauses).
    Amazon Transcribe returns individual words with timestamps.
    """
    segments: list[TranscriptSegment] = []
    current_words: list[str] = []
    current_start: float = 0.0
    current_end: float = 0.0

    for item in items:
        item_type = item.get("type", "")
        alternatives = item.get("alternatives", [{}])
        content = alternatives[0].get("content", "").strip() if alternatives else ""

        if not content:
            continue

        if item_type == "pronunciation":
            start = float(item.get("start_time", current_end) or current_end)
            end = float(item.get("end_time", start) or start)
            if not current_words:
                current_start = start
            current_words.append(content)
            current_end = end

        elif item_type == "punctuation":
            if current_words:
                current_words[-1] += content
            # End segment on sentence-ending punctuation
            if content in {".", "?", "!"}:
                text = " ".join(current_words).strip()
                if text:
                    segments.append(
                        TranscriptSegment(
                            start=current_start,
                            end=current_end,
                            text=text,
                        )
                    )
                current_words = []
                current_start = current_end

    # Flush any remaining words
    if current_words:
        text = " ".join(current_words).strip()
        if text:
            segments.append(
                TranscriptSegment(
                    start=current_start,
                    end=current_end,
                    text=text,
                )
            )

    return segments


def _delete_s3_key(s3_client: Any, bucket: str, key: str) -> None:
    try:
        s3_client.delete_object(Bucket=bucket, Key=key)
    except Exception:
        pass  # Best-effort cleanup

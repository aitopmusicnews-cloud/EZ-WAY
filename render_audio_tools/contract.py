from __future__ import annotations

from typing import Any

SUPPORTED_ACTIONS = {"analysis", "lyrics", "stems"}
SUPPORTED_STEM_MODES = {"vocals_instrumental", "full"}
PUBLIC_FIELDS = (
    "call_id",
    "job_id",
    "status",
    "action",
    "mode",
    "track_id",
    "profile",
    "lyrics",
    "files",
    "bundle_url",
    "language",
    "language_probability",
    "error",
    "created_at",
    "updated_at",
)


def _clean(value: Any) -> str:
    return str(value or "").strip()


def normalize_job_request(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("A JSON job request is required.")

    action = _clean(payload.get("action"))
    if action not in SUPPORTED_ACTIONS:
        raise ValueError("action must be analysis, lyrics, or stems.")

    file_key = _clean(payload.get("file_key"))
    file_url = _clean(payload.get("file_url"))
    if file_url and not file_url.startswith("https://"):
        raise ValueError("file_url must be an HTTPS cloud audio URL.")
    if not file_key and not file_url:
        raise ValueError("A cloud audio source is required via file_key or file_url.")

    track_id = _clean(payload.get("track_id"))
    if not track_id:
        raise ValueError("track_id is required.")

    normalized: dict[str, Any] = {
        "action": action,
        "track_id": track_id,
        "track_name": _clean(payload.get("track_name")) or "track",
    }
    if file_key:
        normalized["file_key"] = file_key
    if file_url:
        normalized["file_url"] = file_url

    source_fingerprint = _clean(payload.get("source_fingerprint"))
    if source_fingerprint:
        normalized["source_fingerprint"] = source_fingerprint

    if action == "stems":
        mode = _clean(payload.get("mode")) or "vocals_instrumental"
        if mode not in SUPPORTED_STEM_MODES:
            raise ValueError("mode must be vocals_instrumental or full.")
        normalized["mode"] = mode

    return normalized


def poll_http_status(status: Any) -> int:
    return 202 if _clean(status) in {"accepted", "running"} else 200


def public_job_response(item: dict[str, Any] | None) -> dict[str, Any]:
    item = item or {}
    return {field: item[field] for field in PUBLIC_FIELDS if field in item}

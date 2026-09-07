from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

import httpx

from music_intelligence_core import build_profile

ANALYZER_VERSION = "music-intelligence-gemini-v2"
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
MODEL_ROOT = Path(os.getenv("MODEL_ROOT", "/models"))

GEMINI_ANALYSIS_SCHEMA = {
    "type": "object",
    "required": [
        "bpm",
        "bpm_confidence",
        "key",
        "camelot_key",
        "key_confidence",
        "genres",
        "moods",
        "styles",
        "instruments",
        "sections",
        "keywords",
    ],
    "properties": {
        "bpm": {"type": "integer", "minimum": 0, "maximum": 300},
        "bpm_confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "key": {"type": "string"},
        "camelot_key": {"type": "string"},
        "key_confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "genres": {"$ref": "#/$defs/rankedList"},
        "moods": {"$ref": "#/$defs/rankedList"},
        "styles": {"$ref": "#/$defs/rankedList"},
        "instruments": {"$ref": "#/$defs/instrumentList"},
        "sections": {
            "type": "array",
            "maxItems": 32,
            "items": {
                "type": "object",
                "required": ["label", "start", "end", "confidence"],
                "properties": {
                    "label": {"type": "string"},
                    "start": {"type": "number", "minimum": 0},
                    "end": {"type": "number", "minimum": 0},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "additionalProperties": False,
            },
        },
        "keywords": {
            "type": "array",
            "maxItems": 12,
            "items": {"type": "string"},
        },
    },
    "$defs": {
        "rankedItem": {
            "type": "object",
            "required": ["label", "score"],
            "properties": {
                "label": {"type": "string"},
                "score": {"type": "number", "minimum": 0, "maximum": 1},
            },
            "additionalProperties": False,
        },
        "rankedList": {
            "type": "array",
            "maxItems": 5,
            "items": {"$ref": "#/$defs/rankedItem"},
        },
        "instrumentList": {
            "type": "array",
            "maxItems": 6,
            "items": {"$ref": "#/$defs/rankedItem"},
        },
    },
    "additionalProperties": False,
}

ANALYSIS_PROMPT = """Analyze this complete music track as an audio recording.
Return only the requested structured music metadata. Estimate tempo, musical key,
Camelot key, genre, mood, style, audible instruments/production elements, and song
section boundaries from the audio. Use confidence scores from 0 to 1 and rank the
strongest labels first. For uncertain BPM or key, use your best evidence-based
estimate with a low confidence score. If no reliable key can be determined, use an
empty string for key and camelot_key. Section labels should be concise functional
names such as intro, verse, pre_chorus, chorus, bridge, instrumental, breakdown,
outro, or a similarly accurate label. Do not transcribe, quote, reconstruct, or
invent lyrics; lyric transcription is handled separately by Whisper. Keywords
should describe the sound, production, mood, genre, or instrumentation rather than
lyric content."""


def download_audio(url: str, target_dir: Path) -> Path:
    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    if suffix not in {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}:
        suffix = ".mp3"
    destination = target_dir / f"source{suffix}"
    with httpx.stream("GET", url, timeout=120.0, follow_redirects=True) as response:
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").split(";", 1)[0].lower()
        if destination.suffix == ".mp3":
            mapping = {
                "audio/wav": ".wav",
                "audio/x-wav": ".wav",
                "audio/flac": ".flac",
                "audio/mp4": ".m4a",
                "audio/aac": ".aac",
                "audio/ogg": ".ogg",
            }
            if content_type in mapping:
                destination = target_dir / f"source{mapping[content_type]}"
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
    return destination


def _list_or_empty(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = payload.get(key)
    return value if isinstance(value, list) else []


def _keywords_or_empty(payload: dict[str, Any]) -> list[str]:
    value = payload.get("keywords")
    return value if isinstance(value, list) else []


def profile_from_gemini_payload(payload: Any, model_name: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Gemini analysis response must be a JSON object.")

    return build_profile(
        bpm=payload.get("bpm"),
        bpm_confidence=payload.get("bpm_confidence"),
        key=payload.get("key"),
        camelot_key=payload.get("camelot_key"),
        key_confidence=payload.get("key_confidence"),
        genres=_list_or_empty(payload, "genres"),
        moods=_list_or_empty(payload, "moods"),
        styles=_list_or_empty(payload, "styles"),
        instruments=_list_or_empty(payload, "instruments"),
        sections=_list_or_empty(payload, "sections"),
        keywords=_keywords_or_empty(payload),
        analyzer_version=ANALYZER_VERSION,
        evidence={
            "provider": "gemini",
            "semantic_model": str(model_name).strip() or DEFAULT_GEMINI_MODEL,
            "analysis_device": "remote-api",
            "source": "audio-file",
        },
    )


def _parsed_response(response: Any) -> dict[str, Any]:
    parsed = getattr(response, "parsed", None)
    if hasattr(parsed, "model_dump"):
        parsed = parsed.model_dump()
    if isinstance(parsed, dict):
        return parsed

    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        raise ValueError("Gemini returned no structured analysis payload.")
    try:
        decoded = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError("Gemini returned invalid JSON analysis output.") from error
    if not isinstance(decoded, dict):
        raise ValueError("Gemini analysis response must be a JSON object.")
    return decoded


class MusicIntelligenceEngine:
    def __init__(self) -> None:
        from google import genai

        api_key = str(os.getenv("GEMINI_API_KEY") or "").strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is required for music analysis.")

        self.model_name = str(os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL
        self.client = genai.Client(api_key=api_key)

    def analyze_url(self, file_url: str) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="ezway-gemini-analysis-") as temp_name:
            temp_dir = Path(temp_name)
            source = download_audio(file_url, temp_dir)
            uploaded = None
            try:
                uploaded = self.client.files.upload(file=str(source))
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=[ANALYSIS_PROMPT, uploaded],
                    config={
                        "temperature": 0.1,
                        "response_mime_type": "application/json",
                        "response_json_schema": GEMINI_ANALYSIS_SCHEMA,
                    },
                )
                return profile_from_gemini_payload(_parsed_response(response), self.model_name)
            finally:
                uploaded_name = getattr(uploaded, "name", None)
                if uploaded_name:
                    try:
                        self.client.files.delete(name=uploaded_name)
                    except Exception as error:
                        print(
                            f"[GeminiMusicAnalyzer] Could not delete temporary Gemini file: {type(error).__name__}: {error}",
                            flush=True,
                        )

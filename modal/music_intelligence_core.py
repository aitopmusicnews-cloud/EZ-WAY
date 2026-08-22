from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable

GENRE_CONFIDENCE_THRESHOLD = 0.55
GENRE_CONFIDENCE_MARGIN = 0.03


def normalize_probability(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))


def aggregate_rankings(
    window_scores: Iterable[dict[str, float]],
    *,
    limit: int = 5,
) -> list[dict[str, float | str]]:
    totals: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)

    for window in window_scores:
        for label, score in window.items():
            clean_label = str(label).strip()
            if not clean_label:
                continue
            totals[clean_label] += normalize_probability(score)
            counts[clean_label] += 1

    ranked = [
        {
            "label": label,
            "score": totals[label] / max(1, counts[label]),
        }
        for label in totals
    ]
    ranked.sort(key=lambda item: (-float(item["score"]), str(item["label"]).lower()))
    return ranked[: max(0, int(limit))]


def _format_timestamp(seconds: float) -> str:
    whole = max(0, int(float(seconds)))
    minutes, seconds = divmod(whole, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def segments_to_chapters(segments: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    chapters: list[dict[str, Any]] = []
    ignored = {"start", "end", ""}

    for raw in segments:
        label = str(raw.get("label") or "").strip().lower()
        if label in ignored:
            continue
        try:
            start = max(0.0, float(raw.get("start") or 0.0))
            end = max(start, float(raw.get("end") or start))
        except (TypeError, ValueError):
            continue

        display = {
            "inst": "Instrumental",
        }.get(label, label.replace("_", " ").title())

        chapters.append(
            {
                "label": display,
                "start": round(start, 3),
                "end": round(end, 3),
                "timestamp": _format_timestamp(start),
            }
        )

    return chapters


def build_profile(
    *,
    bpm: float | int | None,
    sections: list[dict[str, Any]],
    genres: list[dict[str, Any]],
    moods: list[dict[str, Any]],
    instruments: list[dict[str, Any]],
    analyzer_version: str,
    key: str | None = None,
    camelot_key: str | None = None,
    key_confidence: float | None = None,
    bpm_confidence: float | None = None,
    styles: list[dict[str, Any]] | None = None,
    keywords: list[str] | None = None,
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clean_genres = [
        {"label": str(item.get("label") or "").strip(), "score": normalize_probability(item.get("score"))}
        for item in genres
        if str(item.get("label") or "").strip()
    ]
    clean_moods = [
        {"label": str(item.get("label") or "").strip(), "score": normalize_probability(item.get("score"))}
        for item in moods
        if str(item.get("label") or "").strip()
    ]
    clean_instruments = [
        {"label": str(item.get("label") or "").strip(), "score": normalize_probability(item.get("score"))}
        for item in instruments
        if str(item.get("label") or "").strip()
    ]
    clean_styles = [
        {"label": str(item.get("label") or "").strip(), "score": normalize_probability(item.get("score"))}
        for item in (styles or [])
        if str(item.get("label") or "").strip()
    ]

    primary_genre = clean_genres[0]["label"] if clean_genres else "Unknown"
    primary_genre_score = float(clean_genres[0]["score"]) if clean_genres else 0.0
    second_genre_score = float(clean_genres[1]["score"]) if len(clean_genres) > 1 else 0.0
    genre_confident = (
        primary_genre_score >= GENRE_CONFIDENCE_THRESHOLD
        and (primary_genre_score - second_genre_score) >= GENRE_CONFIDENCE_MARGIN
    )

    warnings: list[str] = []
    if not genre_confident:
        warnings.append("Genre classification is uncertain")
    if not sections:
        warnings.append("No reliable song sections were detected.")

    try:
        normalized_bpm = int(round(float(bpm))) if bpm is not None else 0
    except (TypeError, ValueError):
        normalized_bpm = 0

    clean_sections: list[dict[str, Any]] = []
    for section in sections:
        try:
            start = max(0.0, float(section.get("start") or 0.0))
            end = max(start, float(section.get("end") or start))
        except (TypeError, ValueError):
            continue
        label = str(section.get("label") or "unknown").strip().lower() or "unknown"
        clean_section = {
            "label": label,
            "start": round(start, 3),
            "end": round(end, 3),
        }
        if section.get("confidence") is not None:
            clean_section["confidence"] = normalize_probability(section.get("confidence"))
        clean_sections.append(clean_section)

    deduped_keywords: list[str] = []
    seen: set[str] = set()
    for keyword in keywords or []:
        clean = str(keyword).strip()
        key_value = clean.casefold()
        if clean and key_value not in seen:
            seen.add(key_value)
            deduped_keywords.append(clean)

    return {
        "version": analyzer_version,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "bpm": normalized_bpm,
        "bpm_confidence": normalize_probability(bpm_confidence) if bpm_confidence is not None else None,
        "key": str(key or "").strip() or None,
        "camelot_key": str(camelot_key or "").strip() or None,
        "key_confidence": normalize_probability(key_confidence) if key_confidence is not None else None,
        "primary_genre": primary_genre,
        "genre_confident": genre_confident,
        "genres": clean_genres,
        "moods": clean_moods,
        "styles": clean_styles,
        "instruments": clean_instruments,
        "sections": clean_sections,
        "chapters": segments_to_chapters(clean_sections),
        "keywords": deduped_keywords,
        "evidence": evidence or {},
        "warnings": warnings,
    }

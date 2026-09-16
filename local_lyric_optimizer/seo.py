from __future__ import annotations

from collections import Counter
from typing import Any

import requests


AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search"
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
FOUNDATION_LYRIC_TAGS = (
    "lyrics",
    "lyric video",
    "lyrics video",
    "sing along",
    "clean lyrics",
    "official lyrics",
)


def build_modifier_queries(seed: str) -> list[str]:
    clean_seed = " ".join(str(seed or "").split()).strip()
    if not clean_seed:
        return []
    return [
        clean_seed,
        f"{clean_seed} lyrics",
        f"{clean_seed} lyric video",
        f"{clean_seed} karaoke",
        f"{clean_seed} clean lyrics",
    ]


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = " ".join(str(value or "").split()).strip()
        key = cleaned.casefold()
        if not cleaned or key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
    return result


def _suggestion_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, (list, tuple)) and item:
        return str(item[0])
    return ""


def fetch_suggestions(seed: str, *, session: Any = requests) -> list[str]:
    suggestions: list[str] = []
    for query in build_modifier_queries(seed):
        try:
            response = session.get(
                AUTOCOMPLETE_URL,
                params={"client": "firefox", "ds": "yt", "q": query},
                timeout=5,
            )
            response.raise_for_status()
            payload = response.json()
            batch = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
            if isinstance(batch, list):
                suggestions.extend(
                    text
                    for item in batch
                    if (text := _suggestion_text(item).strip())
                )
        except Exception:
            continue
    return _dedupe_preserving_order(suggestions)


def fetch_competitor_tags(seed: str, api_key: str, *, session: Any = requests) -> list[str]:
    if not str(api_key or "").strip():
        return []
    try:
        search_response = session.get(
            YOUTUBE_SEARCH_URL,
            params={
                "part": "id",
                "q": f"{' '.join(str(seed or '').split()).strip()} lyrics",
                "type": "video",
                "maxResults": 10,
                "order": "relevance",
                "key": api_key,
            },
            timeout=10,
        )
        search_response.raise_for_status()
        search_payload = search_response.json()
        video_ids = [
            str(item.get("id", {}).get("videoId", "")).strip()
            for item in search_payload.get("items", [])
            if isinstance(item, dict) and item.get("id", {}).get("videoId")
        ]
        if not video_ids:
            return []

        videos_response = session.get(
            YOUTUBE_VIDEOS_URL,
            params={
                "part": "snippet",
                "id": ",".join(video_ids),
                "key": api_key,
            },
            timeout=10,
        )
        videos_response.raise_for_status()
        videos_payload = videos_response.json()
        tags: list[str] = []
        for item in videos_payload.get("items", []):
            if not isinstance(item, dict):
                continue
            raw_tags = item.get("snippet", {}).get("tags", [])
            if isinstance(raw_tags, list):
                tags.extend(str(tag).strip() for tag in raw_tags if str(tag).strip())
        return tags
    except Exception:
        return []


def rank_tags(competitor_tags: list[str], genre: str = "") -> list[str]:
    foundation = list(FOUNDATION_LYRIC_TAGS)
    foundation_keys = {tag.casefold() for tag in foundation}

    normalized: list[str] = []
    first_index: dict[str, int] = {}
    for raw_tag in competitor_tags or []:
        cleaned = " ".join(str(raw_tag or "").split()).strip().lower()
        key = cleaned.casefold()
        if not cleaned or key in foundation_keys:
            continue
        if key not in first_index:
            first_index[key] = len(first_index)
        normalized.append(cleaned)

    counts = Counter(tag.casefold() for tag in normalized)
    display_by_key: dict[str, str] = {}
    for tag in normalized:
        display_by_key.setdefault(tag.casefold(), tag)
    competitor_ranked = [
        display_by_key[key]
        for key in sorted(counts, key=lambda value: (-counts[value], first_index[value]))
    ]

    result = foundation + competitor_ranked
    clean_genre = " ".join(str(genre or "").split()).strip().lower()
    if clean_genre and clean_genre.casefold() not in {tag.casefold() for tag in result}:
        result.append(clean_genre)
    return result


def research_lyric_seo(
    seed: str,
    *,
    genre: str = "",
    api_key: str = "",
    session: Any = requests,
) -> dict[str, Any]:
    queries = build_modifier_queries(seed)
    suggestions = fetch_suggestions(seed, session=session)
    clean_key = str(api_key or "").strip()
    competitor_tags = fetch_competitor_tags(seed, clean_key, session=session) if clean_key else []
    warning = None if clean_key else "youtube_api_key_missing"
    return {
        "queries": queries,
        "suggestions": suggestions,
        "competitor_tags": competitor_tags,
        "ranked_tags": rank_tags(competitor_tags, genre),
        "warning": warning,
    }

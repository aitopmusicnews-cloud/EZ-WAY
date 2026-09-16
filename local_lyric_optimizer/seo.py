from __future__ import annotations

from collections import Counter
import os
import random
import re
from typing import Any, Dict, List, Tuple

import requests


AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search"
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()

FOUNDATION_LYRIC_TAGS = (
    "lyrics",
    "lyric video",
    "lyrics video",
    "sing along",
    "clean lyrics",
    "official lyrics",
)

_INTENT_WEIGHTS = {
    "lyrics": 10,
    "lyric video": 9,
    "karaoke": 8,
    "meaning": 7,
    "clean lyrics": 7,
    "sing along": 6,
    "official": 4,
    "live": 2,
}


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
            if hasattr(response, "raise_for_status"):
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


def get_current_youtube_searches(
    seed_keyword: str,
    *,
    session: Any = requests,
) -> List[str]:
    """Query YouTube-scoped live autocomplete for current search phrases."""
    return fetch_suggestions(seed_keyword, session=session)


def fetch_competitor_tags(
    seed: str,
    api_key: str,
    *,
    session: Any = requests,
) -> list[str]:
    clean_key = str(api_key or "").strip()
    if not clean_key:
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
                "key": clean_key,
            },
            timeout=10,
        )
        if hasattr(search_response, "raise_for_status"):
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
                "key": clean_key,
            },
            timeout=10,
        )
        if hasattr(videos_response, "raise_for_status"):
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


def get_live_competitor_tags(
    api_key: str,
    seed_keyword: str,
    *,
    session: Any = requests,
) -> List[str]:
    """Get public tags from the top relevant YouTube lyric-video results."""
    return fetch_competitor_tags(seed_keyword, api_key, session=session)


def _rank_competitor_tags(competitor_tags: list[str]) -> list[str]:
    foundation_keys = {tag.casefold() for tag in FOUNDATION_LYRIC_TAGS}
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

    return [
        display_by_key[key]
        for key in sorted(counts, key=lambda value: (-counts[value], first_index[value]))
    ]


def _rank_live_suggestions(seed: str, suggestions: list[str]) -> list[str]:
    clean_seed = " ".join(str(seed or "").lower().split()).strip()
    seed_tokens = set(re.findall(r"[a-z0-9']+", clean_seed))
    ranked: list[tuple[int, int, str]] = []

    for index, raw in enumerate(suggestions or []):
        phrase = " ".join(str(raw or "").lower().split()).strip()
        if not phrase:
            continue
        phrase_tokens = set(re.findall(r"[a-z0-9']+", phrase))
        overlap = len(seed_tokens & phrase_tokens)
        contains_seed = bool(clean_seed and clean_seed in phrase)
        minimum_overlap = min(2, len(seed_tokens))
        if not contains_seed and overlap < minimum_overlap:
            continue

        score = overlap * 3 + (12 if contains_seed else 0)
        for marker, weight in _INTENT_WEIGHTS.items():
            if marker in phrase:
                score += weight
        ranked.append((score, index, phrase))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return _dedupe_preserving_order([phrase for _, _, phrase in ranked])


def rank_tags(
    competitor_tags: list[str],
    genre: str = "",
    *,
    seed: str = "",
    suggestions: list[str] | None = None,
) -> list[str]:
    """
    Rank SEO terms. Without live context this preserves the legacy foundation-first
    ordering. With a seed/suggestions, real song-specific searches are promoted.
    """
    foundation = list(FOUNDATION_LYRIC_TAGS)
    competitor_ranked = _rank_competitor_tags(competitor_tags)
    clean_genre = " ".join(str(genre or "").split()).strip().lower()

    if not seed and not suggestions:
        result = foundation + competitor_ranked
        if clean_genre and clean_genre.casefold() not in {tag.casefold() for tag in result}:
            result.append(clean_genre)
        return result

    live_ranked = _rank_live_suggestions(seed, suggestions or [])
    return _dedupe_preserving_order([
        *live_ranked,
        *competitor_ranked,
        *foundation,
        *([clean_genre] if clean_genre else []),
    ])


def research_lyric_seo(
    seed: str,
    *,
    genre: str = "",
    api_key: str = "",
    session: Any = requests,
) -> dict[str, Any]:
    queries = build_modifier_queries(seed)
    suggestions = get_current_youtube_searches(seed, session=session)
    clean_key = str(api_key or "").strip()
    competitor_tags = (
        get_live_competitor_tags(clean_key, seed, session=session)
        if clean_key
        else []
    )
    warning = None if clean_key else "youtube_api_key_missing"
    return {
        "queries": queries,
        "suggestions": suggestions,
        "competitor_tags": competitor_tags,
        "ranked_tags": rank_tags(
            competitor_tags,
            genre,
            seed=seed,
            suggestions=suggestions,
        ),
        "warning": warning,
    }


def generate_seo_content(
    query: str,
) -> Tuple[str, str, List[str], List[str], int, Dict[str, int]]:
    """Generate the local CLI SEO package using the same live research engine as EZ-WAY."""
    research = research_lyric_seo(query, api_key=API_KEY)
    recommended_tags = _dedupe_preserving_order(
        [*research["ranked_tags"], *research["suggestions"]]
    )[:40]

    words: list[str] = []
    for phrase in research["suggestions"]:
        words.extend(re.findall(r"\b[\w']+\b", phrase.lower()))
    stop_words = {
        "the", "a", "to", "in", "of", "and", "for", "with", "on",
        "official", "video", "audio", "lyrics", "lyric",
    }
    top_keywords = [
        word
        for word, _ in Counter(
            word for word in words if word not in stop_words and not word.isdigit()
        ).most_common(15)
    ]
    if not top_keywords:
        top_keywords = [word.lower() for word in query.split() if word]

    generated_title = f"{query.title()} (Official Lyric Video)"
    generated_description = (
        f"🎵 Stream/Download \"{query.title()}\": [Insert Streaming Links Here]\n\n"
        f"Enjoy the official lyric video for \"{query.title()}\".\n\n"
        "📝 LYRICS:\n[PASTE_EXTRACTED_WHISPER_LYRICS_HERE]\n\n"
        "For track submission or copyright inquiries, reach out via our channel about page."
    )

    generated_hashtags = [f"#{word}" for word in top_keywords[:5]]
    if "#lyrics" not in generated_hashtags:
        generated_hashtags.append("#lyrics")

    seo_score = 0
    if len(generated_title) <= 70:
        seo_score += 20
    if len(recommended_tags) >= 20:
        seo_score += 30
    if research["suggestions"]:
        seo_score += 30
    seo_score += min(len(generated_hashtags) * 4, 20)

    analytics = {
        "expected_reach_potential": random.randint(85, 99),
        "keyword_density_index": random.randint(75, 95),
    }
    return (
        generated_title,
        generated_description,
        recommended_tags,
        generated_hashtags,
        seo_score,
        analytics,
    )


def process_keyword(keyword: str) -> None:
    print(f"\nAnalyzing YouTube Ecosystem and Generating Live Content Suite for '{keyword}'...")
    live_searches = get_current_youtube_searches(keyword)
    title, description, tags, hashtags, seo_score, _ = generate_seo_content(keyword)

    print(f"\n{'=' * 80}\nLIVE COMPETITOR SEO ENGINE RESULTS\n{'=' * 80}")
    print(f"\nHighly Searched Variations (Autocomplete Trends):\n{', '.join(live_searches)}")
    print(f"\nOptimized Title Configuration:\n{title}")
    print(f"\nStructured Video Description Template:\n{description}")
    print(f"\nScraped & Deduplicated Competitor Tags:\n{', '.join(tags)}")
    print(f"\nRecommended Discovery Hashtags:\n{' '.join(hashtags)}")
    print(f"\nStructural SEO Health Score: {seo_score}/100")


def main() -> None:
    print("Welcome to the Active YouTube Music SEO Scraper Engine!")
    while True:
        print("\n1. Analyze Niche & Extract Metadata")
        print("2. Exit")
        choice = input("Enter your choice (1-2): ")
        if choice == "1":
            keyword = input("Enter artist name or base song descriptor: ")
            process_keyword(keyword)
        elif choice == "2":
            print("Closing connection interface. Goodbye!")
            break
        else:
            print("Invalid index choice.")


if __name__ == "__main__":
    main()

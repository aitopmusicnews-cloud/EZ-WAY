from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .creative_direction import CreativeDirector, SongThesis
from .retry import with_retry


_DEFAULT_VISUAL_BANS = [
    "generic neon cyberpunk",
    "sports car without lyric support",
    "money props without lyric support",
    "generic city skyline",
    "smoke-filled portrait",
    "cracked face or statue",
    "random floating fragments",
]


class SongIntelligenceEngine:
    """Combine measured/heuristic song signals with a high-level creative thesis."""

    def __init__(
        self,
        *,
        creative_director: CreativeDirector | None,
        max_attempts: int = 3,
        base_delay_seconds: float = 0.75,
        on_attempt=None,
    ) -> None:
        self.creative_director = creative_director
        self.max_attempts = max(1, int(max_attempts))
        self.base_delay_seconds = max(0.0, float(base_delay_seconds))
        self.on_attempt = on_attempt or (lambda _attempt, _outcome, _error: None)

    async def synthesize(
        self,
        audio: dict[str, Any] | None,
        lyrics: dict[str, Any] | None,
        lyrics_text: str | None,
        creative_controls: dict[str, str] | None,
    ) -> dict[str, Any]:
        audio_signal = dict(audio or {})
        lyric_signal = dict(lyrics or {})
        controls = dict(creative_controls or {})
        context = {
            "audio": audio_signal,
            "lyrics": lyric_signal,
            "full_lyrics": lyrics_text or "",
            "creative_controls": controls,
        }

        if self.creative_director is not None:
            try:
                thesis = await with_retry(
                    lambda: self.creative_director.build_song_thesis(context=context),
                    max_attempts=self.max_attempts,
                    base_delay_seconds=self.base_delay_seconds,
                    on_attempt=self.on_attempt,
                )
                return {
                    "audio": audio_signal,
                    "lyrics": lyric_signal,
                    "song_thesis": asdict(thesis),
                    "status": "advanced",
                }
            except Exception:
                pass

        thesis = fallback_song_thesis(audio_signal, lyric_signal)
        return {
            "audio": audio_signal,
            "lyrics": lyric_signal,
            "song_thesis": asdict(thesis),
            "status": "creative_direction_degraded",
        }


def fallback_song_thesis(audio: dict[str, Any], lyrics: dict[str, Any]) -> SongThesis:
    themes = [str(item) for item in (lyrics.get("themes") or []) if str(item).strip()]
    keywords = [str(item) for item in (lyrics.get("keywords") or []) if str(item).strip()]
    imagery = [str(item) for item in (lyrics.get("imagery") or []) if str(item).strip()]
    mood = lyrics.get("mood") or audio.get("mood") or {}
    mood_label = (
        str(mood.get("label", "introspective"))
        if isinstance(mood, dict)
        else str(mood or "introspective")
    )
    theme = themes[0] if themes else "personal reflection"
    permissions = list(dict.fromkeys([*imagery, *keywords[:6]]))
    if not permissions:
        permissions = [theme]
    musical_tags = [str(item) for item in (audio.get("style_tags") or []) if str(item).strip()]
    if not musical_tags:
        musical_tags = [mood_label]
    campaign_anchor = ", ".join(permissions[:2])
    return SongThesis(
        core_meaning=theme,
        emotional_arc=mood_label,
        musical_personality=musical_tags[:5],
        lyrical_world={
            "people": [],
            "objects": permissions[:4],
            "places": [],
            "symbols": imagery[:4],
        },
        creative_contradiction="No advanced cross-modal contradiction analysis was available.",
        signature_moment="Use the strongest measured energy transition and repeated lyric imagery.",
        visual_permissions=permissions[:10],
        visual_bans=list(_DEFAULT_VISUAL_BANS),
        artist_role_recommendation="none",
        campaign_thesis=f"A {mood_label} visual story about {theme}, anchored by {campaign_anchor}.",
    )

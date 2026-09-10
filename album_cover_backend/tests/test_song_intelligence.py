import pytest

from app.creative_direction import SongThesis
from app.errors import CloudflareServiceError


class StubDirector:
    async def build_song_thesis(self, *, context):
        assert context["audio"]["tempo_bpm"] == 88
        assert context["lyrics"]["themes"] == ["loss and memory"]
        assert "I left your letter" in context["full_lyrics"]
        return SongThesis(
            core_meaning="letting go",
            emotional_arc="guarded to accepting",
            musical_personality=["restrained", "warm"],
            lyrical_world={"people": [], "objects": ["letter"], "places": [], "symbols": ["door"]},
            creative_contradiction="warm production under painful lyrics",
            signature_moment="last refrain",
            visual_permissions=["letter", "door"],
            visual_bans=["sports car"],
            artist_role_recommendation="partial",
            campaign_thesis="graceful release after private grief",
        )


class FailingDirector:
    def __init__(self):
        self.calls = 0

    async def build_song_thesis(self, *, context):
        self.calls += 1
        raise CloudflareServiceError("capacity")


class BuggyDirector:
    async def build_song_thesis(self, *, context):
        raise TypeError("programming defect")


@pytest.mark.asyncio
async def test_song_intelligence_combines_baseline_analysis_with_thesis():
    from app.song_intelligence import SongIntelligenceEngine

    engine = SongIntelligenceEngine(creative_director=StubDirector())
    report = await engine.synthesize(
        audio={"tempo_bpm": 88, "section_summary": {}},
        lyrics={"themes": ["loss and memory"], "keywords": ["letter"]},
        lyrics_text="I left your letter by the door",
        creative_controls={"creative_strength": "balanced"},
    )

    assert report["song_thesis"]["campaign_thesis"] == "graceful release after private grief"
    assert report["status"] == "advanced"
    assert report["audio"]["tempo_bpm"] == 88


@pytest.mark.asyncio
async def test_song_intelligence_marks_degraded_fallback_after_retry_exhaustion():
    from app.song_intelligence import SongIntelligenceEngine

    director = FailingDirector()
    engine = SongIntelligenceEngine(
        creative_director=director,
        max_attempts=2,
        base_delay_seconds=0,
    )
    report = await engine.synthesize(
        audio={"tempo_bpm": 72, "mood": {"label": "dark"}},
        lyrics={"themes": ["loss and memory"], "keywords": ["ghost", "door"]},
        lyrics_text="ghost at the door",
        creative_controls={"creative_strength": "balanced"},
    )

    assert director.calls == 2
    assert report["status"] == "creative_direction_degraded"
    assert report["song_thesis"]["campaign_thesis"]
    assert "ghost" in report["song_thesis"]["visual_permissions"]


@pytest.mark.asyncio
async def test_song_intelligence_does_not_hide_programming_errors():
    from app.song_intelligence import SongIntelligenceEngine

    engine = SongIntelligenceEngine(creative_director=BuggyDirector(), max_attempts=1)
    with pytest.raises(TypeError, match="programming defect"):
        await engine.synthesize(
            audio={}, lyrics={}, lyrics_text="", creative_controls={}
        )

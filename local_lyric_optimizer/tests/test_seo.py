from local_lyric_optimizer.seo import (
    FOUNDATION_LYRIC_TAGS,
    build_modifier_queries,
    fetch_competitor_tags,
    fetch_suggestions,
    rank_tags,
    research_lyric_seo,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self):
        self.calls = []

    def get(self, url, *, params=None, timeout=None):
        self.calls.append((url, params, timeout))
        if "suggestqueries.google.com" in url:
            query = params["q"]
            return FakeResponse([query, [f"{query} official", f"{query} live"]])
        if url.endswith("/search"):
            return FakeResponse({
                "items": [
                    {"id": {"videoId": "one"}},
                    {"id": {"videoId": "two"}},
                ]
            })
        if url.endswith("/videos"):
            return FakeResponse({
                "items": [
                    {"snippet": {"tags": ["Synth Pop", "Lyrics", "Night Drive"]}},
                    {"snippet": {"tags": ["synth pop", "Sing Along", "Official Video"]}},
                ]
            })
        raise AssertionError(f"unexpected URL: {url}")


class NestedAutocompleteSession:
    def __init__(self):
        self.calls = []

    def get(self, url, *, params=None, timeout=None):
        self.calls.append((url, params, timeout))
        query = params["q"]
        return FakeResponse([
            query,
            [
                [f"{query} official lyrics", 0, []],
                [f"{query} karaoke", 0, []],
            ],
        ])


def test_modifier_queries_are_lyric_focused():
    assert build_modifier_queries("Blinding Lights") == [
        "Blinding Lights",
        "Blinding Lights lyrics",
        "Blinding Lights lyric video",
        "Blinding Lights karaoke",
        "Blinding Lights clean lyrics",
    ]


def test_autocomplete_queries_youtube_scope_and_dedupes_in_order():
    session = FakeSession()
    suggestions = fetch_suggestions("Blinding Lights", session=session)

    assert suggestions[:4] == [
        "Blinding Lights official",
        "Blinding Lights live",
        "Blinding Lights lyrics official",
        "Blinding Lights lyrics live",
    ]
    autocomplete_calls = [call for call in session.calls if "suggestqueries.google.com" in call[0]]
    assert len(autocomplete_calls) == 5
    assert all(call[1]["client"] == "firefox" for call in autocomplete_calls)
    assert all(call[1]["ds"] == "yt" for call in autocomplete_calls)
    assert all(call[2] == 5 for call in autocomplete_calls)


def test_autocomplete_extracts_text_from_nested_youtube_suggestion_entries():
    session = NestedAutocompleteSession()
    suggestions = fetch_suggestions("Blinding Lights", session=session)

    assert suggestions[:2] == [
        "Blinding Lights official lyrics",
        "Blinding Lights karaoke",
    ]
    assert not any(suggestion.startswith("[") for suggestion in suggestions)


def test_competitor_tags_use_top_ten_relevance_search_and_snippet_tags():
    session = FakeSession()
    tags = fetch_competitor_tags("Blinding Lights", "test-key", session=session)

    assert tags == ["Synth Pop", "Lyrics", "Night Drive", "synth pop", "Sing Along", "Official Video"]
    search_call = next(call for call in session.calls if call[0].endswith("/search"))
    assert search_call[1] == {
        "part": "id",
        "q": "Blinding Lights lyrics",
        "type": "video",
        "maxResults": 10,
        "order": "relevance",
        "key": "test-key",
    }
    videos_call = next(call for call in session.calls if call[0].endswith("/videos"))
    assert videos_call[1]["part"] == "snippet"
    assert videos_call[1]["id"] == "one,two"


def test_lyric_foundation_tags_rank_before_repeated_competitor_and_genre_tags():
    result = rank_tags(
        ["Synth Pop", "Lyrics", "Synth Pop", "Official Video", "Sing Along", "Night Drive"],
        genre="pop",
    )

    assert result[: len(FOUNDATION_LYRIC_TAGS)] == list(FOUNDATION_LYRIC_TAGS)
    assert result.index("synth pop") < result.index("night drive")
    assert result.index("synth pop") < result.index("pop")
    assert len(result) == len({tag.casefold() for tag in result})


def test_missing_api_key_returns_partial_research_instead_of_crashing():
    session = FakeSession()
    result = research_lyric_seo("Blinding Lights", genre="pop", api_key="", session=session)

    assert result["queries"] == build_modifier_queries("Blinding Lights")
    assert result["suggestions"]
    assert result["competitor_tags"] == []
    assert result["ranked_tags"][: len(FOUNDATION_LYRIC_TAGS)] == list(FOUNDATION_LYRIC_TAGS)
    assert result["warning"] == "youtube_api_key_missing"
    assert not any("youtube/v3/search" in call[0] for call in session.calls)

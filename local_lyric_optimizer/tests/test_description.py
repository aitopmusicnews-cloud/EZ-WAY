from local_lyric_optimizer.description import (
    DescriptionInput,
    build_description_prompt,
    build_description_skeleton,
)


def sample_input():
    return DescriptionInput(
        song_title="Blinding Lights",
        artist="The Weeknd",
        genre="Synth Pop",
        mood="night drive",
        lyrics="Line one\nLine two\nLine three\nLine four",
    )


def test_description_skeleton_has_exact_required_structure_and_full_lyrics():
    result = build_description_skeleton(sample_input())

    expected = """Blinding Lights — The Weeknd | Synth Pop
Sing along with this night drive lyric video and follow every line of Blinding Lights.

🎧 STREAM / DOWNLOAD
Spotify: [Spotify URL]
Apple Music: [Apple Music URL]
Amazon Music: [Amazon Music URL]

📝 LYRICS
Line one
Line two
Line three
Line four

🎼 CREDITS
Producer(s): [Producer Name]
Songwriter(s): [Songwriter Name]
Vocalist(s): [Vocalist Name]
Video / Visual Credit: [Video / Visual Credit]"""
    assert result == expected


def test_description_skeleton_uses_supplied_links_and_credits_without_inventing_values():
    data = DescriptionInput(
        song_title="Song",
        artist="Artist",
        genre="R&B",
        mood="warm",
        lyrics="Actual lyric",
        spotify_url="https://spotify.example/song",
        apple_music_url="https://apple.example/song",
        amazon_music_url="https://amazon.example/song",
        producers="Producer A",
        songwriters="Writer A",
        vocalists="Singer A",
        visual_credit="Director A",
    )
    result = build_description_skeleton(data)
    assert "Spotify: https://spotify.example/song" in result
    assert "Apple Music: https://apple.example/song" in result
    assert "Amazon Music: https://amazon.example/song" in result
    assert "Producer(s): Producer A" in result
    assert "Songwriter(s): Writer A" in result
    assert "Vocalist(s): Singer A" in result
    assert "Video / Visual Credit: Director A" in result


def test_prompt_requires_full_untruncated_lyrics_and_all_sections():
    prompt = build_description_prompt(sample_input())
    required = [
        "first two lines",
        "Blinding Lights",
        "The Weeknd",
        "Synth Pop",
        "night drive",
        "Spotify",
        "Apple Music",
        "Amazon Music",
        "complete supplied lyrics",
        "Producer(s)",
        "Songwriter(s)",
        "Vocalist(s)",
        "Video / Visual Credit",
        "Line four",
        "Do not invent credits",
    ]
    for phrase in required:
        assert phrase in prompt

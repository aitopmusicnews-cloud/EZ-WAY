from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DescriptionInput:
    song_title: str
    artist: str
    genre: str
    mood: str
    lyrics: str
    spotify_url: str = ""
    apple_music_url: str = ""
    amazon_music_url: str = ""
    producers: str = ""
    songwriters: str = ""
    vocalists: str = ""
    visual_credit: str = ""


def _clean(value: object) -> str:
    return " ".join(str(value or "").split()).strip()


def _value_or_placeholder(value: str, placeholder: str) -> str:
    cleaned = _clean(value)
    return cleaned or placeholder


def build_description_skeleton(data: DescriptionInput) -> str:
    song_title = _clean(data.song_title) or "Untitled Song"
    artist = _clean(data.artist) or "Artist"
    genre = _clean(data.genre) or "Music"
    mood = _clean(data.mood) or genre.lower()
    lyrics = str(data.lyrics or "").strip() or "[PASTE_LYRICS_HERE]"

    return "\n".join([
        f"{song_title} — {artist} | {genre}",
        f"Sing along with this {mood} lyric video and follow every line of {song_title}.",
        "",
        "🎧 STREAM / DOWNLOAD",
        f"Spotify: {_value_or_placeholder(data.spotify_url, '[Spotify URL]')}",
        f"Apple Music: {_value_or_placeholder(data.apple_music_url, '[Apple Music URL]')}",
        f"Amazon Music: {_value_or_placeholder(data.amazon_music_url, '[Amazon Music URL]')}",
        "",
        "📝 LYRICS",
        lyrics,
        "",
        "🎼 CREDITS",
        f"Producer(s): {_value_or_placeholder(data.producers, '[Producer Name]')}",
        f"Songwriter(s): {_value_or_placeholder(data.songwriters, '[Songwriter Name]')}",
        f"Vocalist(s): {_value_or_placeholder(data.vocalists, '[Vocalist Name]')}",
        f"Video / Visual Credit: {_value_or_placeholder(data.visual_credit, '[Video / Visual Credit]')}",
    ])


def build_description_prompt(data: DescriptionInput) -> str:
    skeleton = build_description_skeleton(data)
    return f"""You are an expert YouTube Music SEO assistant specializing in full-track lyric videos.

Create a search-optimized YouTube description for \"{_clean(data.song_title)}\" by {_clean(data.artist)} in the {_clean(data.genre)} genre with a {_clean(data.mood)} mood.

Requirements:
- The first two lines must feature the song title, artist, genre, and mood in a natural search-optimized hook.
- Include a STREAM / DOWNLOAD section with Spotify, Apple Music, and Amazon Music.
- Include a LYRICS section containing the complete supplied lyrics exactly as provided. Do not summarize, truncate, rewrite, or omit lyric lines.
- Include Producer(s), Songwriter(s), Vocalist(s), and Video / Visual Credit fields.
- Do not invent credits or streaming links. Keep placeholders when values were not supplied.
- Keep the output clean and ready to paste into YouTube.

The complete supplied lyrics are:
{str(data.lyrics or '').strip() or '[PASTE_LYRICS_HERE]'}

Use this required structure:
{skeleton}
""".strip()

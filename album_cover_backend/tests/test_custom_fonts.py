from pathlib import Path

import pytest


EXPECTED_CUSTOM_FONTS = {
    "armadillo": ("Armadillo", "Armadillo.ttf"),
    "charles-wright-singapore": ("Charles Wright Singapore", "CharlesWrightSingapore.otf"),
    "oxidaren": ("Oxidaren", "Oxidaren.otf"),
    "scapholene": ("Scapholene", "Scapholene.ttf"),
    "serati": ("Serati", "Serati-Regular.otf"),
    "trigram": ("Trigram", "Trigram-Regular.otf"),
    "achtung-bravo": ("Achtung Bravo", "Achtung Bravo Mac.ttf"),
    "asterisk-mono": ("Asterisk Mono", "AsteriskMono-Regular.otf"),
    "chainsaw-carnage": ("Chainsaw Carnage", "ChainsawCarnage.otf"),
    "digit-tech": ("Digit Tech", "DigitTech16-Regular.otf"),
    "dystopian-canticle": ("Dystopian Canticle", "Dystopian-Canticle-Regular.otf"),
    "eightgon": ("Eightgon", "Eightgon-Regular.otf"),
    "goodlookingfont": ("GoodLookingFont", "GoodLookingFont.otf"),
    "help-me": ("Help Me", "HelpMe.ttf"),
    "jogrunge": ("JOGRUNGE", "JOGRUNGE.otf"),
    "london-psycho": ("London Psycho", "London Psycho B&W Black Outline-COLR.otf"),
    "lumierepolis": ("Lumierepolis", "Lumierepolis-Regular.otf"),
    "midnight-letters": ("Midnight Letters", "MidnightLetters-Regular.otf"),
    "moonlit-flow": ("Moonlit Flow", "MoonlitFlow-Regular.otf"),
    "powderworks": ("Powderworks", "powdwrk5.ttf"),
}


def test_custom_font_manifest_contains_the_20_approved_families():
    from app.custom_fonts import CUSTOM_FONTS

    actual = {key: (value.label, value.filename) for key, value in CUSTOM_FONTS.items()}
    assert actual == EXPECTED_CUSTOM_FONTS


def test_custom_font_path_uses_server_font_root_and_rejects_unknown(tmp_path: Path):
    from app.custom_fonts import resolve_custom_font_path

    expected = tmp_path / "Armadillo.ttf"
    expected.write_bytes(b"font")

    assert resolve_custom_font_path("armadillo", root=tmp_path) == expected
    assert resolve_custom_font_path("does-not-exist", root=tmp_path) is None


def test_release_compositor_prefers_named_custom_font(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    from PIL import ImageFont
    from app import release_compositor

    system_font = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    if not system_font.exists():
        pytest.skip("system test font is unavailable")

    target = tmp_path / "Armadillo.ttf"
    target.write_bytes(system_font.read_bytes())
    monkeypatch.setenv("ALBUM_COVER_FONT_ROOT", str(tmp_path))

    font = release_compositor._font("armadillo", 48)
    assert isinstance(font, ImageFont.FreeTypeFont)
    assert font.path == str(target)

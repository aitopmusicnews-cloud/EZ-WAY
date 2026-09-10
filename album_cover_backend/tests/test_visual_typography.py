from pathlib import Path

import pytest
from pydantic import ValidationError


def test_release_text_accepts_approved_custom_fonts_and_normalized_anchors():
    from app.schemas import ReleaseTextSettings

    settings = ReleaseTextSettings.model_validate(
        {
            "title": {"font_style": "armadillo", "x": 0.25, "y": 0.3},
            "artist": {"font_style": "moonlit-flow", "x": 0.75, "y": 0.8},
        }
    )

    assert settings.title.font_style == "armadillo"
    assert settings.title.x == 0.25
    assert settings.title.y == 0.3
    assert settings.artist.font_style == "moonlit-flow"
    assert settings.artist.x == 0.75
    assert settings.artist.y == 0.8


def test_release_text_rejects_unknown_fonts_and_out_of_bounds_anchors():
    from app.schemas import ReleaseTextSettings

    with pytest.raises(ValidationError):
        ReleaseTextSettings.model_validate({"title": {"font_style": "../../secret"}})
    with pytest.raises(ValidationError):
        ReleaseTextSettings.model_validate({"title": {"x": 1.2, "y": 0.5}})


def test_compositor_uses_normalized_anchor_when_present():
    from app.release_compositor import _position_from_anchor

    x, y, alignment = _position_from_anchor(
        width=200,
        height=80,
        anchor_x=0.25,
        anchor_y=0.75,
    )
    assert (x, y, alignment) == (156.0, 728.0, "center")


def test_font_preview_uses_whitelisted_server_font_without_exposing_binary(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    from PIL import Image
    from app.font_preview import render_font_preview

    system_font = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    if not system_font.exists():
        pytest.skip("system test font is unavailable")

    target = tmp_path / "Armadillo.ttf"
    target.write_bytes(system_font.read_bytes())
    monkeypatch.setenv("ALBUM_COVER_FONT_ROOT", str(tmp_path))

    result = render_font_preview("armadillo", text="Midnight Drive", size=72, color="#F5F1E8")
    assert result.source == "custom"
    assert result.mime_type == "image/png"
    assert b"Armadillo.ttf" not in result.content
    image = Image.open(__import__("io").BytesIO(result.content))
    assert image.width > 1
    assert image.height > 1

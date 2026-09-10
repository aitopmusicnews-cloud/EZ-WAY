from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageDraw

from .custom_fonts import CUSTOM_FONTS, resolve_custom_font_path
from .release_compositor import _font, _hex_color


BUILTIN_FONT_IDS = frozenset({"editorial", "serif", "sans", "sans-bold", "script", "marker", "vintage"})
ALLOWED_FONT_IDS = BUILTIN_FONT_IDS | frozenset(CUSTOM_FONTS.keys())


@dataclass(frozen=True, slots=True)
class FontPreviewResult:
    content: bytes
    mime_type: str
    source: str


def render_font_preview(font_style: str, *, text: str, size: int = 64, color: str = "#F5F1E8") -> FontPreviewResult:
    style = str(font_style or "").strip().lower()
    if style not in ALLOWED_FONT_IDS:
        raise ValueError("Unknown font style.")

    label = str(text or "Album Title").strip()[:80] or "Album Title"
    point_size = max(24, min(120, int(size or 64)))
    rgb = _hex_color(str(color or "")) or (245, 241, 232)
    font = _font(style, point_size)

    measure = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    measure_draw = ImageDraw.Draw(measure)
    bbox = measure_draw.textbbox((0, 0), label, font=font, stroke_width=1)
    text_width = max(1, bbox[2] - bbox[0])
    text_height = max(1, bbox[3] - bbox[1])
    width = min(900, max(300, text_width + 64))
    height = min(220, max(112, text_height + 52))

    image = Image.new("RGBA", (width, height), (18, 18, 18, 255))
    draw = ImageDraw.Draw(image)
    x = width / 2
    y = height / 2
    draw.text(
        (x + 2, y + 2),
        label,
        font=font,
        anchor="mm",
        fill=(0, 0, 0, 170),
        stroke_width=1,
        stroke_fill=(0, 0, 0, 180),
    )
    draw.text(
        (x, y),
        label,
        font=font,
        anchor="mm",
        fill=(*rgb, 255),
        stroke_width=1,
        stroke_fill=(0, 0, 0, 190),
    )

    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    custom_path = resolve_custom_font_path(style)
    source = "custom" if style in CUSTOM_FONTS and custom_path is not None else "built-in"
    return FontPreviewResult(content=output.getvalue(), mime_type="image/png", source=source)

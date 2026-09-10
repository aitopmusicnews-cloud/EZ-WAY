from __future__ import annotations

from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .custom_fonts import resolve_custom_font_path
from .storage import LocalStorage, WORKING_IMAGE_SIZE


DEFAULT_RELEASE_TEXT = {
    "show_title": True,
    "show_artist": True,
    "parental_advisory": False,
    "title": {
        "position": "top-center",
        "size": 104,
        "font_style": "editorial",
        "case": "original",
        "treatment": "light",
        "color": "#F5F1E8",
    },
    "artist": {
        "position": "bottom-center",
        "size": 42,
        "font_style": "serif",
        "case": "original",
        "treatment": "light",
        "color": "#F5F1E8",
    },
    "advisory": {"position": "bottom-right", "size": "small"},
}


def normalize_release_settings(value: dict[str, Any] | None, *, parental_advisory: bool = False) -> dict[str, Any]:
    source = value or {}
    result = {
        "show_title": bool(source.get("show_title", True)),
        "show_artist": bool(source.get("show_artist", True)),
        "parental_advisory": bool(source.get("parental_advisory", parental_advisory)),
        "title": {**DEFAULT_RELEASE_TEXT["title"], **dict(source.get("title") or {})},
        "artist": {**DEFAULT_RELEASE_TEXT["artist"], **dict(source.get("artist") or {})},
        "advisory": {**DEFAULT_RELEASE_TEXT["advisory"], **dict(source.get("advisory") or {})},
    }
    return result


def compose_release_layers(
    raw: bytes,
    *,
    title: str | None,
    artist: str | None,
    settings: dict[str, Any] | None,
) -> bytes:
    values = normalize_release_settings(settings)
    with Image.open(BytesIO(raw)) as source:
        canvas = ImageOps.fit(
            source.convert("RGB"),
            (WORKING_IMAGE_SIZE, WORKING_IMAGE_SIZE),
            method=Image.Resampling.LANCZOS,
        ).convert("RGBA")

    if values["show_title"] and title:
        canvas = _draw_text_layer(canvas, title, values["title"], role="title")
    if values["show_artist"] and artist:
        canvas = _draw_text_layer(canvas, artist, values["artist"], role="artist")
    if values["parental_advisory"]:
        canvas = _draw_advisory(canvas, values["advisory"])

    output = BytesIO()
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()


def _draw_text_layer(image: Image.Image, text: str, style: dict[str, Any], *, role: str) -> Image.Image:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    size = _bounded_int(style.get("size"), 104 if role == "title" else 42, 24, 180)
    font = _font(style.get("font_style"), size)
    label = _apply_case(text, str(style.get("case") or "original"))
    max_width = 880 if role == "title" else 820
    lines = _wrap(draw, label, font, max_width=max_width, max_lines=3 if role == "title" else 2)
    line_gap = max(4, int(size * 0.08))
    heights = [max(1, draw.textbbox((0, 0), line, font=font, stroke_width=2)[3]) for line in lines]
    total_h = sum(heights) + line_gap * max(0, len(lines) - 1)
    widths = [draw.textbbox((0, 0), line, font=font, stroke_width=2)[2] for line in lines]
    block_w = max(widths or [1])
    anchor_x = style.get("x")
    anchor_y = style.get("y")
    if anchor_x is not None and anchor_y is not None:
        x, y, alignment = _position_from_anchor(
            width=block_w,
            height=total_h,
            anchor_x=float(anchor_x),
            anchor_y=float(anchor_y),
        )
    else:
        position = str(style.get("position") or ("top-center" if role == "title" else "bottom-center"))
        x, y, alignment = _position(block_w, total_h, position)
    fill, stroke_fill, stroke_width = _treatment(style)

    for line, line_h, line_w in zip(lines, heights, widths):
        line_x = x
        if alignment == "center":
            line_x = x + (block_w - line_w) / 2
        elif alignment == "right":
            line_x = x + block_w - line_w
        draw.text((line_x + 3, y + 4), line, font=font, fill=(0, 0, 0, 150), stroke_width=max(0, stroke_width - 1), stroke_fill=(0, 0, 0, 155))
        draw.text((line_x, y), line, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
        y += line_h + line_gap

    return Image.alpha_composite(image, overlay)


def _font(style: Any, size: int) -> ImageFont.ImageFont:
    name = str(style or "editorial").lower()
    custom_path = resolve_custom_font_path(name)
    if custom_path is not None:
        try:
            return ImageFont.truetype(str(custom_path), size=size)
        except OSError:
            pass
    if name == "script":
        return LocalStorage._font_from_candidates(size, LocalStorage._script_font_candidates("luxury_script"))
    if name == "marker":
        return LocalStorage._font_from_candidates(size, LocalStorage._marker_font_candidates())
    if name in {"editorial", "italic"}:
        return LocalStorage._font_from_candidates(size, LocalStorage._italic_serif_candidates())
    if name in {"serif", "vintage"}:
        return LocalStorage._font_from_candidates(size, LocalStorage._display_serif_candidates())
    return LocalStorage._font(size, bold=name in {"bold", "sans-bold"})


def _apply_case(text: str, case: str) -> str:
    if case == "upper":
        return text.upper()
    if case == "lower":
        return text.lower()
    return text


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, *, max_width: int, max_lines: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    if len(lines) <= max_lines:
        return lines
    kept = lines[:max_lines]
    kept[-1] = " ".join(lines[max_lines - 1 :])
    return kept


def _position_from_anchor(*, width: int, height: int, anchor_x: float, anchor_y: float) -> tuple[float, float, str]:
    normalized_x = max(0.0, min(1.0, float(anchor_x)))
    normalized_y = max(0.0, min(1.0, float(anchor_y)))
    x = normalized_x * WORKING_IMAGE_SIZE - width / 2
    y = normalized_y * WORKING_IMAGE_SIZE - height / 2
    x = max(0.0, min(float(WORKING_IMAGE_SIZE - width), x))
    y = max(0.0, min(float(WORKING_IMAGE_SIZE - height), y))
    return float(x), float(y), "center"


def _position(width: int, height: int, position: str) -> tuple[float, float, str]:
    margin = 48
    if position.startswith("top"):
        y = 48
    elif position.startswith("center"):
        y = max(margin, (WORKING_IMAGE_SIZE - height) / 2)
    else:
        y = max(margin, WORKING_IMAGE_SIZE - height - 58)

    if position.endswith("left"):
        return float(margin), float(y), "left"
    if position.endswith("right"):
        return float(max(margin, WORKING_IMAGE_SIZE - width - margin)), float(y), "right"
    return float(max(margin, (WORKING_IMAGE_SIZE - width) / 2)), float(y), "center"


def _treatment(style: dict[str, Any]) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int], int]:
    custom = _hex_color(str(style.get("color") or ""))
    treatment = str(style.get("treatment") or "light").lower()
    if custom:
        fill = (*custom, 255)
    elif treatment == "dark":
        fill = (24, 24, 24, 255)
    else:
        fill = (245, 241, 232, 255)
    if treatment == "outline":
        return fill, (0, 0, 0, 235), 4
    if treatment == "dark":
        return fill, (245, 245, 245, 170), 1
    return fill, (0, 0, 0, 210), 2


def _hex_color(value: str) -> tuple[int, int, int] | None:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        return None
    try:
        return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return None


def _draw_advisory(image: Image.Image, style: dict[str, Any]) -> Image.Image:
    size_name = str(style.get("size") or "small")
    scale = {"small": 1.0, "medium": 1.25, "large": 1.5}.get(size_name, 1.0)
    width, height = int(200 * scale), int(94 * scale)
    margin = 34
    position = str(style.get("position") or "bottom-right")
    x = margin if position == "bottom-left" else WORKING_IMAGE_SIZE - width - margin
    y = WORKING_IMAGE_SIZE - height - 30
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((x, y, x + width, y + height), fill=(245, 245, 242, 248), outline=(0, 0, 0, 255), width=max(3, int(4 * scale)))
    band_h = int(39 * scale)
    draw.rectangle((x + 4, y + 4, x + width - 4, y + band_h), fill=(0, 0, 0, 255))
    top_font = LocalStorage._font(max(15, int(21 * scale)), bold=True)
    bottom_font = LocalStorage._font(max(13, int(17 * scale)), bold=True)
    LocalStorage._center_text(draw, (x + width / 2, y + int(20 * scale)), "PARENTAL ADVISORY", top_font, fill=(255, 255, 255, 255))
    LocalStorage._center_text(draw, (x + width / 2, y + int(65 * scale)), "EXPLICIT CONTENT", bottom_font, fill=(0, 0, 0, 255))
    return Image.alpha_composite(image, overlay)


def _bounded_int(value: Any, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(low, min(high, number))

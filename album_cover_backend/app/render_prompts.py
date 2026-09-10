from __future__ import annotations

from typing import Any

from .style_presets import StylePreset


_NO_TEXT_BLOCK = (
    "NO TITLE. NO ARTIST LETTERING. NO TYPOGRAPHY. NO LOGOS. "
    "NO PARENTAL ADVISORY. NO WATERMARKS."
)


def build_creative_control_prompt(
    base_prompt: str, controls: dict[str, Any] | None = None
) -> str:
    values = controls or {}
    if not any(str(value).strip() for value in values.values() if value is not None):
        return base_prompt.strip()

    strength = str(values.get("creative_strength") or "balanced").strip().lower()
    if strength == "strict":
        authority = (
            "Follow the user creative controls strictly. User-specified subject, scene, must-include, "
            "and avoid instructions outrank automatic creative choices. Do not substitute a different central subject or setting."
        )
    elif strength == "loose":
        authority = "Use the user creative controls as guidance while allowing tasteful interpretation."
    else:
        authority = "Follow the user creative controls closely while preserving tasteful creative judgment."

    lines = ["USER CREATIVE CONTROLS — PRIORITY INSTRUCTIONS", authority]
    labels = (
        ("subject_hint", "Primary subject"),
        ("scene_hint", "Scene / setting"),
        ("style_preset", "Visual style"),
        ("composition_preset", "Composition"),
        ("color_mood", "Color / mood"),
        ("must_include", "Must include"),
        ("avoid", "Avoid / do not include"),
    )
    for key, label in labels:
        value = str(values.get(key) or "").strip()
        if value and value != "auto":
            lines.append(f"{label}: {value}.")
    return " ".join(lines + ["SONG-DRIVEN CREATIVE BRIEF:", base_prompt.strip()]).strip()


_RENDER_VARIATIONS = {
    1: "Strongest direct execution; disciplined commercial polish.",
    2: "Preserve the exact central concept and metaphor; vary crop, camera distance, and lighting only.",
    3: "Preserve the exact concept; explore a bolder material or color execution only.",
}


def build_production_brief(
    *,
    concept: dict[str, Any],
    creative_controls: dict[str, Any] | None,
    visual_bible: dict[str, Any] | None = None,
    render_index: int,
) -> str:
    """Build a priority-ordered FLUX brief that never exceeds Schnell's 2048-char cap."""
    controls = creative_controls or {}
    parts: list[str] = []
    strength = str(controls.get("creative_strength") or "balanced").lower()
    if strength == "strict":
        parts.append(
            "STRICT USER CONTROL: user subject, scene, must-include, avoid, style and composition outrank all automatic choices."
        )
    else:
        parts.append("USER CONTROL: follow supplied creative controls closely.")

    control_bits = []
    for key, label in (
        ("subject_hint", "subject"),
        ("scene_hint", "scene"),
        ("style_preset", "style"),
        ("composition_preset", "composition"),
        ("color_mood", "color/mood"),
        ("must_include", "must include"),
        ("avoid", "avoid"),
    ):
        value = str(controls.get(key) or "").strip()
        if value and value.lower() != "auto":
            control_bits.append(f"{label}: {value}")
    if control_bits:
        parts.append("CONTROLS: " + "; ".join(control_bits)[:520] + ".")

    if visual_bible and str(concept.get("artist_presence") or "none").lower() != "none":
        guide = _compact_reference_guide(visual_bible)
        if guide:
            parts.append("REFERENCE IDENTITY GUIDE: " + guide[:360] + ".")

    parts.extend(
        [
            f"CONCEPT: {concept.get('name', 'Untitled')}.",
            f"SUBJECT: {concept.get('subject', '')}. ACTION/SYMBOL: {concept.get('action_or_symbol', '')}.",
            f"SETTING: {concept.get('setting', '')}.",
            f"COMPOSITION/CAMERA: {concept.get('composition', '')}; {concept.get('camera', '')}.",
            f"LIGHTING: {concept.get('lighting', '')}.",
            f"MEDIUM/TEXTURE: {concept.get('medium', '')}; {concept.get('texture', '')}.",
            f"PALETTE: {concept.get('palette', '')}.",
        ]
    )
    must = concept.get("must_include") or []
    avoid = concept.get("avoid") or []
    if must:
        parts.append("MUST INCLUDE: " + "; ".join(str(v) for v in must)[:280] + ".")

    # The no-text block is intentionally before low-priority prompt-seed prose so
    # it can never be lost to the provider limit.
    parts.append(_NO_TEXT_BLOCK)
    if avoid:
        parts.append("AVOID: " + "; ".join(str(v) for v in avoid)[:280] + ".")
    parts.append("EXECUTION VARIATION: " + _RENDER_VARIATIONS.get(render_index, _RENDER_VARIATIONS[2]))

    seed = str(concept.get("image_prompt_seed") or concept.get("image_prompt") or "").strip()
    if seed:
        parts.append("DIRECTOR DETAIL: " + seed[:520] + ".")

    prompt = " ".join(part.strip() for part in parts if part.strip())
    if len(prompt) <= 2048:
        return prompt

    # Trim only lower-priority detail. Strict controls and no-text are never removed.
    removable_prefixes = ("DIRECTOR DETAIL:", "PALETTE:", "MEDIUM/TEXTURE:", "LIGHTING:", "SETTING:")
    trimmed = list(parts)
    for prefix in removable_prefixes:
        for index, part in enumerate(trimmed):
            if part.startswith(prefix) and len(prompt) > 2048:
                trimmed[index] = part[: max(60, len(part) // 2)]
                prompt = " ".join(p.strip() for p in trimmed if p.strip())
    if len(prompt) > 2048:
        # Keep the opening priority instructions and the no-text sentence intact.
        no_text_index = prompt.find(_NO_TEXT_BLOCK)
        if no_text_index >= 0 and no_text_index + len(_NO_TEXT_BLOCK) > 2048:
            essentials = " ".join(
                p for p in trimmed if p.startswith(("STRICT USER CONTROL", "USER CONTROL", "CONTROLS:", "SUBJECT:", "MUST INCLUDE:"))
            )
            prompt = f"{essentials[:1750]} {_NO_TEXT_BLOCK}"
        else:
            prompt = prompt[:2048]
    return prompt[:2048]


def _compact_reference_guide(bible: dict[str, Any]) -> str:
    appearance = bible.get("appearance") or {}
    bits: list[str] = []
    if isinstance(appearance, dict):
        for key in ("hair", "facial_hair", "distinctive_features", "skin_tone"):
            value = appearance.get(key)
            if isinstance(value, list):
                bits.extend(str(v) for v in value if str(v).strip())
            elif value:
                bits.append(str(value))
    for key in ("do_not_change", "wardrobe_language", "accessories"):
        value = bible.get(key) or []
        if isinstance(value, list):
            bits.extend(str(v) for v in value if str(v).strip())
    return "; ".join(dict.fromkeys(bits))


def build_render_prompt(
    *,
    base_brief: str,
    concept: dict[str, Any],
    render_index: int,
    style_preset: StylePreset,
    improvement_feedback: list[str] | None = None,
) -> str:
    feedback = ""
    if improvement_feedback:
        feedback = " Improvements required: " + "; ".join(improvement_feedback[:8]) + "."
    execution = _RENDER_VARIATIONS.get(
        render_index,
        "Preserve the exact concept while changing only execution details, never the central story.",
    )
    return " ".join(
        [
            base_brief.strip(),
            f"CONCEPT: {concept.get('name', 'Untitled')}.",
            f"Subject: {concept.get('subject', '')}.",
            f"Setting: {concept.get('setting', '')}.",
            f"Action or symbol: {concept.get('action_or_symbol', '')}.",
            f"Camera: {concept.get('camera', '')}.",
            f"Medium: {concept.get('medium', '')}.",
            f"Palette: {concept.get('palette', '')}.",
            f"Typography-safe zone: {concept.get('typography_zone', '')}.",
            f"Primary image direction: {concept.get('image_prompt', '')}.",
            style_preset.prompt_fragment(),
            execution,
            feedback,
            "Do not borrow the subject, setting, camera, or central metaphor from another concept.",
            "No generated title, artist text, fake logos, label marks, or watermarks.",
        ]
    ).strip()

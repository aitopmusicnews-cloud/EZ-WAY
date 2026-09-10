from __future__ import annotations

import re
from typing import Any

from .creative_direction import ConceptDraft


RUBRIC_MAXIMA: dict[str, float] = {
    "song_specificity": 25.0,
    "originality": 20.0,
    "emotional_power": 15.0,
    "visual_memorability": 15.0,
    "artist_campaign_value": 10.0,
    "flux_executability": 10.0,
    "typography_compatibility": 5.0,
}

_TEXT_RISK_TERMS = (
    "render the title",
    "write the title",
    "album title text",
    "artist lettering",
    "parental advisory",
    "watermark",
    "logo text",
)


def score_concept(
    concept: ConceptDraft,
    song_thesis: dict[str, Any],
    creative_controls: dict[str, Any] | None,
    suggested_scores: dict[str, float] | None = None,
) -> dict[str, float]:
    controls = creative_controls or {}
    if _hard_failure(concept, controls):
        return {key: 0.0 for key in RUBRIC_MAXIMA}

    suggested = suggested_scores or {}
    scores: dict[str, float] = {}
    for key, maximum in RUBRIC_MAXIMA.items():
        value = suggested.get(key)
        if value is None:
            value = _deterministic_component(key, concept, song_thesis)
        scores[key] = round(max(0.0, min(float(value), maximum)), 2)
    return scores


def score_total(score_map: dict[str, float]) -> float:
    return round(sum(max(0.0, min(float(score_map.get(key, 0.0)), maximum)) for key, maximum in RUBRIC_MAXIMA.items()), 2)


def select_diverse_concepts(
    concepts: list[ConceptDraft], total_scores: dict[str, float], count: int = 3
) -> list[ConceptDraft]:
    ordered = sorted(concepts, key=lambda item: (-float(total_scores.get(item.id, 0.0)), item.id))
    selected: list[ConceptDraft] = []
    for candidate in ordered:
        if any(_near_duplicate(candidate, existing) for existing in selected):
            continue
        selected.append(candidate)
        if len(selected) == count:
            break
    return selected


def _hard_failure(concept: ConceptDraft, controls: dict[str, Any]) -> bool:
    required = (
        concept.id,
        concept.name,
        concept.subject,
        concept.setting,
        concept.camera,
        concept.composition,
        concept.medium,
        concept.typography_zone,
    )
    if any(not str(value).strip() for value in required):
        return True

    all_text = " ".join(
        [
            concept.name,
            concept.one_line_pitch,
            concept.subject,
            concept.setting,
            concept.action_or_symbol,
            concept.image_prompt_seed,
            *concept.must_include,
            *concept.avoid,
        ]
    ).lower()
    if any(term in all_text for term in _TEXT_RISK_TERMS):
        return True

    if str(controls.get("creative_strength", "")).lower() == "strict":
        subject_hint = str(controls.get("subject_hint") or "").strip()
        scene_hint = str(controls.get("scene_hint") or "").strip()
        must_include = str(controls.get("must_include") or "").strip()
        if subject_hint and not _contains_important_terms(concept.subject, subject_hint):
            return True
        if scene_hint and not _contains_important_terms(concept.setting, scene_hint):
            return True
        if must_include:
            combined = " ".join(
                [concept.subject, concept.setting, concept.action_or_symbol, *concept.must_include]
            )
            if not _contains_important_terms(combined, must_include):
                return True
    return False


def _contains_important_terms(actual: str, requested: str) -> bool:
    actual_tokens = set(_tokens(actual))
    requested_tokens = [token for token in _tokens(requested) if len(token) > 2]
    if not requested_tokens:
        return True
    # Treat strict guidance as satisfied when most meaningful terms survive; this
    # avoids brittle failures on articles/prepositions while still preventing a
    # different central subject or setting from slipping through.
    matched = sum(token in actual_tokens for token in requested_tokens)
    return matched / len(requested_tokens) >= 0.60


def _near_duplicate(left: ConceptDraft, right: ConceptDraft) -> bool:
    fields = (
        "subject",
        "setting",
        "medium",
        "visual_metaphor",
        "artist_presence",
        "dominant_shape",
    )
    equal = 0
    for field in fields:
        if _normalized(getattr(left, field)) == _normalized(getattr(right, field)):
            equal += 1
    return equal >= 4


def _normalized(value: str) -> str:
    return " ".join(_tokens(value))


def _tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", str(value).lower())


def _deterministic_component(
    key: str, concept: ConceptDraft, song_thesis: dict[str, Any]
) -> float:
    maximum = RUBRIC_MAXIMA[key]
    thesis_text = " ".join(
        [
            str(song_thesis.get("campaign_thesis") or ""),
            str(song_thesis.get("core_meaning") or ""),
            " ".join(str(x) for x in (song_thesis.get("visual_permissions") or [])),
        ]
    ).lower()
    concept_text = " ".join(
        [
            concept.why_it_fits,
            concept.subject,
            concept.setting,
            concept.action_or_symbol,
            concept.visual_metaphor,
        ]
    ).lower()
    specificity_overlap = len(set(_tokens(thesis_text)) & set(_tokens(concept_text)))
    detail = min(1.0, len(set(_tokens(concept_text))) / 45.0)

    if key == "song_specificity":
        return min(maximum, maximum * (0.55 + min(specificity_overlap, 10) * 0.035))
    if key == "originality":
        return maximum * (0.58 + detail * 0.32)
    if key == "emotional_power":
        return maximum * (0.58 + min(1.0, len(_tokens(concept.visual_metaphor)) / 8.0) * 0.30)
    if key == "visual_memorability":
        return maximum * (0.58 + min(1.0, len(_tokens(concept.subject)) / 10.0) * 0.28)
    if key == "artist_campaign_value":
        return maximum * (0.72 if concept.artist_presence != "none" else 0.62)
    if key == "flux_executability":
        complexity = len(_tokens(concept.subject + " " + concept.setting + " " + concept.action_or_symbol))
        return maximum * (0.88 if complexity <= 45 else 0.66)
    if key == "typography_compatibility":
        return maximum * (0.92 if concept.typography_zone.strip() else 0.0)
    return maximum * 0.6

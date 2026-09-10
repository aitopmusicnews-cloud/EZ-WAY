from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(slots=True)
class SongThesis:
    core_meaning: str
    emotional_arc: str
    musical_personality: list[str]
    lyrical_world: dict[str, list[str]]
    creative_contradiction: str
    signature_moment: str
    visual_permissions: list[str]
    visual_bans: list[str]
    artist_role_recommendation: str
    campaign_thesis: str

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "SongThesis":
        required = (
            "core_meaning",
            "emotional_arc",
            "musical_personality",
            "lyrical_world",
            "creative_contradiction",
            "signature_moment",
            "visual_permissions",
            "visual_bans",
            "artist_role_recommendation",
            "campaign_thesis",
        )
        missing = [key for key in required if key not in value]
        if missing:
            raise ValueError(f"song thesis missing fields: {', '.join(missing)}")
        world = value["lyrical_world"]
        if not isinstance(world, dict):
            raise ValueError("lyrical_world must be an object")
        normalized_world = {
            key: [str(item).strip() for item in (world.get(key) or []) if str(item).strip()]
            for key in ("people", "objects", "places", "symbols")
        }
        return cls(
            core_meaning=str(value["core_meaning"]).strip(),
            emotional_arc=str(value["emotional_arc"]).strip(),
            musical_personality=_string_list(value["musical_personality"]),
            lyrical_world=normalized_world,
            creative_contradiction=str(value["creative_contradiction"]).strip(),
            signature_moment=str(value["signature_moment"]).strip(),
            visual_permissions=_string_list(value["visual_permissions"]),
            visual_bans=_string_list(value["visual_bans"]),
            artist_role_recommendation=str(value["artist_role_recommendation"]).strip(),
            campaign_thesis=str(value["campaign_thesis"]).strip(),
        )


@dataclass(slots=True)
class ConceptDraft:
    id: str
    name: str
    one_line_pitch: str
    why_it_fits: str
    subject: str
    artist_presence: str
    setting: str
    action_or_symbol: str
    wardrobe_or_material: str
    camera: str
    composition: str
    lighting: str
    medium: str
    palette: str
    texture: str
    dominant_shape: str
    visual_metaphor: str
    typography_zone: str
    must_include: list[str] = field(default_factory=list)
    avoid: list[str] = field(default_factory=list)
    image_prompt_seed: str = ""

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "ConceptDraft":
        scalar_fields = (
            "id",
            "name",
            "one_line_pitch",
            "why_it_fits",
            "subject",
            "artist_presence",
            "setting",
            "action_or_symbol",
            "wardrobe_or_material",
            "camera",
            "composition",
            "lighting",
            "medium",
            "palette",
            "texture",
            "dominant_shape",
            "visual_metaphor",
            "typography_zone",
        )
        missing = [key for key in scalar_fields if key not in value]
        if missing:
            raise ValueError(f"concept missing fields: {', '.join(missing)}")
        return cls(
            **{key: str(value[key]).strip() for key in scalar_fields},
            must_include=_string_list(value.get("must_include", [])),
            avoid=_string_list(value.get("avoid", [])),
            image_prompt_seed=str(value.get("image_prompt_seed", "")).strip(),
        )


@dataclass(slots=True)
class ConceptCritique:
    concept_id: str
    problems: list[str]
    rebuild_required: bool
    revision_direction: str
    suggested_scores: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "ConceptCritique":
        scores = value.get("suggested_scores") or {}
        if not isinstance(scores, dict):
            raise ValueError("suggested_scores must be an object")
        return cls(
            concept_id=str(value.get("concept_id", "")).strip(),
            problems=_string_list(value.get("problems", [])),
            rebuild_required=bool(value.get("rebuild_required", False)),
            revision_direction=str(value.get("revision_direction", "")).strip(),
            suggested_scores={str(key): float(score) for key, score in scores.items()},
        )


class CreativeDirector(Protocol):
    async def build_song_thesis(self, *, context: dict[str, Any]) -> SongThesis: ...

    async def create_concepts(
        self, *, context: dict[str, Any], count: int
    ) -> list[ConceptDraft]: ...

    async def critique_concepts(
        self, *, context: dict[str, Any], concepts: list[ConceptDraft]
    ) -> list[ConceptCritique]: ...

    async def revise_concepts(
        self,
        *,
        context: dict[str, Any],
        concepts: list[ConceptDraft],
        critiques: list[ConceptCritique],
    ) -> list[ConceptDraft]: ...


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise ValueError("expected a list")
    return [str(item).strip() for item in value if str(item).strip()]

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class ArtistVisualBible:
    reference_type: str
    appearance: dict[str, Any] = field(default_factory=dict)
    wardrobe_language: list[str] = field(default_factory=list)
    accessories: list[str] = field(default_factory=list)
    attitude: list[str] = field(default_factory=list)
    visual_identity: list[str] = field(default_factory=list)
    do_not_change: list[str] = field(default_factory=list)
    uncertainties: list[str] = field(default_factory=list)

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "ArtistVisualBible":
        appearance = value.get("appearance") or {}
        if not isinstance(appearance, dict):
            raise ValueError("appearance must be an object")
        return cls(
            reference_type=str(value.get("reference_type") or "artist"),
            appearance={str(k): v for k, v in appearance.items()},
            wardrobe_language=_list(value.get("wardrobe_language")),
            accessories=_list(value.get("accessories")),
            attitude=_list(value.get("attitude")),
            visual_identity=_list(value.get("visual_identity")),
            do_not_change=_list(value.get("do_not_change")),
            uncertainties=_list(value.get("uncertainties")),
        )

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _list(value: Any) -> list[str]:
    if not isinstance(value, (list, tuple)):
        return []
    return [str(item).strip() for item in value if str(item).strip()]

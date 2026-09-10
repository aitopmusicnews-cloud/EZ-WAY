from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


MoodPath = Literal["auto", "blend", "audio", "lyrics"]
StylePreset = Literal["auto", "photo", "cinematic", "illustration", "painting", "collage", "minimal"]
CompositionPreset = Literal["auto", "close-up", "portrait", "wide", "centered", "off-center", "minimal"]
CreativeStrength = Literal["loose", "balanced", "strict"]
TextPosition = Literal[
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
]
TextFontStyle = Literal["editorial", "serif", "sans", "sans-bold", "script", "marker", "vintage"]
TextCase = Literal["original", "upper", "lower"]
TextTreatment = Literal["light", "dark", "outline"]
ReferenceType = Literal["artist", "character", "style"]


class CreativeControls(BaseModel):
    subject_hint: str | None = Field(default=None, max_length=300)
    scene_hint: str | None = Field(default=None, max_length=300)
    style_preset: StylePreset = "auto"
    composition_preset: CompositionPreset = "auto"
    color_mood: str | None = Field(default=None, max_length=200)
    must_include: str | None = Field(default=None, max_length=500)
    avoid: str | None = Field(default=None, max_length=500)
    creative_strength: CreativeStrength = "balanced"

    def as_prompt_dict(self) -> dict[str, str]:
        values = self.model_dump()
        return {key: str(value).strip() for key, value in values.items() if value is not None and str(value).strip()}


class TextLayerStyle(BaseModel):
    position: TextPosition = "top-center"
    size: int = Field(default=104, ge=24, le=180)
    font_style: TextFontStyle = "editorial"
    case: TextCase = "original"
    treatment: TextTreatment = "light"
    color: str = Field(default="#F5F1E8", pattern=r"^#[0-9A-Fa-f]{6}$")


class AdvisoryStyle(BaseModel):
    position: Literal["bottom-left", "bottom-right"] = "bottom-right"
    size: Literal["small", "medium", "large"] = "small"


class ReleaseTextSettings(BaseModel):
    show_title: bool = True
    show_artist: bool = True
    parental_advisory: bool = False
    title: TextLayerStyle = Field(default_factory=TextLayerStyle)
    artist: TextLayerStyle = Field(
        default_factory=lambda: TextLayerStyle(
            position="bottom-center", size=42, font_style="serif"
        )
    )
    advisory: AdvisoryStyle = Field(default_factory=AdvisoryStyle)


class GenerateRequest(BaseModel):
    mood_path: MoodPath = "auto"
    variation_count: int = Field(default=6, ge=3, le=8)
    run_async: bool = True


class RegenerateRequest(CreativeControls):
    mood_path: Literal["blend", "audio", "lyrics"] = "blend"
    variation_count: int = Field(default=6, ge=3, le=8)
    run_async: bool = True


class ImproveRequest(CreativeControls):
    source_variation_id: str
    mood_path: Literal["blend", "audio", "lyrics"] = "blend"
    variation_count: int = Field(default=6, ge=3, le=8)
    run_async: bool = True


class ConceptResponse(BaseModel):
    id: str
    ordinal: int
    name: str
    subject: str
    setting: str
    action_or_symbol: str
    camera: str
    medium: str
    palette: str
    typography_zone: str
    image_prompt: str
    one_line_pitch: str | None = None
    why_it_fits: str | None = None
    artist_presence: str | None = None
    wardrobe_or_material: str | None = None
    composition: str | None = None
    lighting: str | None = None
    texture: str | None = None
    dominant_shape: str | None = None
    visual_metaphor: str | None = None
    must_include: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    critique: dict[str, Any] | None = None
    scores: dict[str, Any] | None = None
    total_score: float | None = None
    rank: int | None = None
    selected_for_render: bool = False


class VariationResponse(BaseModel):
    id: str
    position: int
    image_url: str
    download_url: str
    mime_type: str
    width: int
    height: int
    selected: bool
    concept_id: str | None = None
    concept_name: str | None = None
    render_index: int | None = None
    rank: int | None = None
    selection_tier: str = "unranked"
    cover_score: float | None = None
    thumbnail_score: float | None = None
    commercial_score: float | None = None
    critic_feedback: dict[str, Any] | None = None
    platform_scores: dict[str, Any] | None = None
    market_positioning: dict[str, Any] | None = None
    created_at: datetime


class VariationSetResponse(BaseModel):
    id: str
    set_number: int
    mood_path: str
    prompt: str
    requested_count: int
    concept_count: int = 0
    selected_concept_count: int = 0
    renders_per_concept: int = 0
    concepts: list[ConceptResponse] = Field(default_factory=list)
    winner_variation_id: str | None = None
    runner_up_variation_id: str | None = None
    critic_status: str = "pending"
    status: str
    error: dict[str, Any] | None
    created_at: datetime
    variations: list[VariationResponse]


class AuditEventResponse(BaseModel):
    id: int
    step: str
    attempt: int
    outcome: str
    message: str | None
    details: dict[str, Any] | None
    created_at: datetime


class GenerationResponse(BaseModel):
    id: str
    collection_id: str
    version: int
    input_hash: str
    status: str
    cache_hit: bool = False
    has_audio: bool
    has_lyrics: bool
    title: str | None
    artist: str | None
    parental_advisory: bool
    release_text: dict[str, Any] | None = None
    song_thesis: dict[str, Any] | None = None
    creative_direction_status: str | None = None
    artist_reference: dict[str, Any] | None = None
    analysis: dict[str, Any] | None
    conflict: dict[str, Any] | None
    last_error: dict[str, Any] | None
    selected_variation_id: str | None
    created_at: datetime
    updated_at: datetime
    variation_sets: list[VariationSetResponse]
    audit_events: list[AuditEventResponse] = Field(default_factory=list)


class HistoryResponse(BaseModel):
    collection_id: str
    versions: list[GenerationResponse]


class MetricsTrendPoint(BaseModel):
    version: int
    set_number: int
    average_score: float | None = None
    winner_score: float | None = None
    created_at: datetime


class CollectionMetricsResponse(BaseModel):
    collection_id: str
    versions: int
    variation_sets: int
    covers_generated: int
    scored_covers: int
    selected_covers: int
    successful_versions: int
    failed_versions: int
    success_rate: float
    critic_completion_rate: float
    average_cover_score: float | None = None
    average_thumbnail_score: float | None = None
    average_commercial_score: float | None = None
    best_cover_score: float | None = None
    release_ready_covers: int
    retries: int
    failed_steps: int
    cache_hits: int
    status_counts: dict[str, int] = Field(default_factory=dict)
    set_status_counts: dict[str, int] = Field(default_factory=dict)
    platform_averages: dict[str, float] = Field(default_factory=dict)
    quality_trend: list[MetricsTrendPoint] = Field(default_factory=list)
    latest_update: datetime | None = None


class ErrorResponse(BaseModel):
    detail: str
    code: str

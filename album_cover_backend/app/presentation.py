from __future__ import annotations

from .market_positioning import position_cover
from .models import Generation
from .schemas import (
    AuditEventResponse,
    ConceptResponse,
    GenerationResponse,
    VariationResponse,
    VariationSetResponse,
)


def generation_response(
    generation: Generation, *, cache_hit: bool = False, include_audit: bool = True
) -> GenerationResponse:
    analysis = generation.analysis_json or {}
    structured_signal = analysis.get("structured_signal") or {}
    audio_signal = analysis.get("audio") or {}
    lyric_signal = analysis.get("lyrics") or {}
    genre = structured_signal.get("inferred_genre") or audio_signal.get("inferred_genre")
    mood_value = structured_signal.get("mood") or audio_signal.get("mood") or lyric_signal.get("mood")
    mood = mood_value.get("label") if isinstance(mood_value, dict) else mood_value

    sets = []
    for item in generation.variation_sets:
        concepts_by_id = {concept.id: concept for concept in item.concepts}
        concepts = []
        for concept in item.concepts:
            stored = concept.scores_json or {}
            meta = stored.get("meta") if isinstance(stored, dict) else None
            meta = meta if isinstance(meta, dict) else {}
            rubric = stored.get("rubric") if isinstance(stored, dict) else stored
            critique = stored.get("critique") if isinstance(stored, dict) else None
            concepts.append(
                ConceptResponse(
                    id=concept.id,
                    ordinal=concept.ordinal,
                    name=concept.name,
                    subject=concept.subject,
                    setting=concept.setting,
                    action_or_symbol=concept.action_or_symbol,
                    camera=concept.camera,
                    medium=concept.medium,
                    palette=concept.palette,
                    typography_zone=concept.typography_zone,
                    image_prompt=concept.image_prompt,
                    one_line_pitch=meta.get("one_line_pitch"),
                    why_it_fits=meta.get("why_it_fits"),
                    artist_presence=meta.get("artist_presence"),
                    wardrobe_or_material=meta.get("wardrobe_or_material"),
                    composition=meta.get("composition"),
                    lighting=meta.get("lighting"),
                    texture=meta.get("texture"),
                    dominant_shape=meta.get("dominant_shape"),
                    visual_metaphor=meta.get("visual_metaphor"),
                    must_include=list(meta.get("must_include") or []),
                    avoid=list(meta.get("avoid") or []),
                    critique=critique if isinstance(critique, dict) else None,
                    scores=rubric if isinstance(rubric, dict) else None,
                    total_score=concept.total_score,
                    rank=concept.rank,
                    selected_for_render=bool(concept.selected_for_render),
                )
            )
        variations = []
        for variation in item.variations:
            concept = concepts_by_id.get(variation.concept_candidate_id)
            market_positioning = variation.market_positioning_json
            if market_positioning is None and (
                variation.critic_scores_json or variation.platform_scores_json
            ):
                market_positioning = position_cover(
                    critic_scores=variation.critic_scores_json,
                    platform_scores=variation.platform_scores_json,
                    concept_name=concept.name if concept else None,
                    genre=str(genre) if genre else None,
                    mood=str(mood) if mood else None,
                )
            variations.append(
                VariationResponse(
                    id=variation.id,
                    position=variation.position,
                    image_url=f"/media/{variation.image_path}",
                    download_url=f"/api/variations/{variation.id}/download",
                    mime_type=variation.mime_type,
                    width=variation.width,
                    height=variation.height,
                    selected=generation.selected_variation_id == variation.id,
                    concept_id=variation.concept_candidate_id,
                    concept_name=concept.name if concept else None,
                    render_index=variation.render_index,
                    rank=variation.rank,
                    selection_tier=variation.selection_tier or "unranked",
                    cover_score=variation.cover_score,
                    thumbnail_score=variation.thumbnail_score,
                    commercial_score=variation.commercial_score,
                    critic_feedback=variation.cover_feedback_json,
                    platform_scores=variation.platform_scores_json,
                    market_positioning=market_positioning,
                    created_at=variation.created_at,
                )
            )
        sets.append(
            VariationSetResponse(
                id=item.id,
                set_number=item.set_number,
                mood_path=item.mood_path,
                prompt=item.prompt,
                requested_count=item.requested_count,
                concept_count=item.concept_count,
                selected_concept_count=item.selected_concept_count,
                renders_per_concept=item.renders_per_concept,
                concepts=concepts,
                winner_variation_id=None,
                runner_up_variation_id=None,
                critic_status=item.critic_status,
                status=item.status,
                error=item.error_json,
                created_at=item.created_at,
                variations=variations,
            )
        )
    audit = (
        [
            AuditEventResponse(
                id=event.id,
                step=event.step,
                attempt=event.attempt,
                outcome=event.outcome,
                message=event.message,
                details=event.details_json,
                created_at=event.created_at,
            )
            for event in generation.audit_events
        ]
        if include_audit
        else []
    )
    reference = analysis.get("artist_reference")
    public_reference = None
    if isinstance(reference, dict):
        public_reference = {
            key: value
            for key, value in reference.items()
            if key not in {"path"}
        }
    return GenerationResponse(
        id=generation.id,
        collection_id=generation.collection_id,
        version=generation.version,
        input_hash=generation.input_hash,
        status=generation.status,
        cache_hit=cache_hit,
        has_audio=bool(generation.audio_path),
        has_lyrics=bool(generation.lyrics_text),
        title=generation.title,
        artist=generation.artist,
        parental_advisory=bool(generation.parental_advisory),
        release_text=analysis.get("_release_text"),
        song_thesis=analysis.get("song_thesis"),
        creative_direction_status=analysis.get("creative_direction_status"),
        artist_reference=public_reference,
        analysis=generation.analysis_json,
        conflict=generation.conflict_json,
        last_error=generation.last_error,
        selected_variation_id=generation.selected_variation_id,
        created_at=generation.created_at,
        updated_at=generation.updated_at,
        variation_sets=sets,
        audit_events=audit,
    )

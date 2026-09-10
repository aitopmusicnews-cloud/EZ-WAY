from __future__ import annotations

from contextvars import ContextVar
from dataclasses import asdict
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .concept_quality import score_concept, score_total, select_diverse_concepts
from .concept_ranking import deterministic_rank
from .creative_direction import ConceptCritique, ConceptDraft
from .errors import PipelineError
from .major_label_service import MajorLabelGenerationService
from .models import ConceptCandidate, Generation, Variation, VariationSet
from .prompts import build_image_prompt
from .release_compositor import compose_release_layers, normalize_release_settings
from .render_prompts import build_creative_control_prompt, build_production_brief
from .retry import with_retry
from .signals import combine_signals
from .song_intelligence import SongIntelligenceEngine, fallback_song_thesis


class CloudflareMajorLabelGenerationService(MajorLabelGenerationService):
    """Song intelligence -> major-label concept competition -> FLUX -> user choice.

    Finished covers are intentionally not AI-ranked. Concept scoring happens only
    before rendering to avoid spending FLUX calls on weak/repetitive directions.
    """

    _active_improvement_source: ContextVar[dict[str, Any] | None] = ContextVar(
        "album_cover_improvement_source", default=None
    )

    def __init__(self, *, concept_ranker: object | None = None, cover_critic: object | None = None, **kwargs: Any) -> None:
        super().__init__(concept_ranker=concept_ranker, cover_critic=cover_critic, **kwargs)

    def set_release_settings(
        self, db: Session, generation_id: str, settings: dict[str, Any]
    ) -> Generation:
        generation = self.get(db, generation_id)
        analysis = dict(generation.analysis_json or {})
        normalized = normalize_release_settings(
            settings, parental_advisory=bool(generation.parental_advisory)
        )
        generation.parental_advisory = bool(normalized["parental_advisory"])
        analysis["_release_text"] = normalized
        generation.analysis_json = analysis
        db.commit()
        return self.get(db, generation_id)

    def save_reference_input(
        self,
        db: Session,
        generation_id: str,
        *,
        content: bytes,
        mime_type: str,
        reference_type: str,
        content_hash: str,
    ) -> Generation:
        generation = self.get(db, generation_id)
        suffix = {"image/png": ".png", "image/webp": ".webp"}.get(mime_type, ".jpg")
        relative = Path("references") / generation.id / f"source{suffix}"
        absolute = self.storage.root / relative
        absolute.parent.mkdir(parents=True, exist_ok=True)
        self.storage._atomic_write(absolute, content)
        analysis = dict(generation.analysis_json or {})
        analysis["artist_reference"] = {
            "path": relative.as_posix(),
            "mime_type": mime_type,
            "reference_type": reference_type,
            "hash": content_hash,
            "visual_bible": None,
        }
        generation.analysis_json = analysis
        db.commit()
        return self.get(db, generation.id)

    async def _create_and_fill_set(
        self,
        db: Session,
        generation: Generation,
        variation_count: int,
        mood_path: str,
        creative_controls: dict[str, str] | None = None,
    ) -> None:
        if not 3 <= variation_count <= 8:
            raise ValueError("variation_count must be between 3 and 8")

        controls = dict(creative_controls or {})
        generation = self.get(db, generation.id)
        analysis = dict(generation.analysis_json or {})
        await self._ensure_song_intelligence(db, generation, analysis, controls)
        generation = self.get(db, generation.id)
        analysis = dict(generation.analysis_json or {})
        await self._ensure_visual_bible(db, generation, analysis)
        generation = self.get(db, generation.id)
        analysis = dict(generation.analysis_json or {})

        signal = combine_signals(
            analysis.get("audio"), analysis.get("lyrics"), mood_path=mood_path
        )
        set_number = max((item.set_number for item in generation.variation_sets), default=0) + 1
        seed = f"{generation.input_hash}:set:{set_number}:path:{mood_path}"
        base_brief = build_creative_control_prompt(
            build_image_prompt(
                signal,
                mood_path,
                title=None,
                artist=None,
                parental_advisory=False,
                creative_seed=seed,
            ),
            controls,
        )

        advanced = self._supports_advanced_director()
        if advanced:
            concepts, critiques, scores, selected, degraded = await self._advanced_competition(
                db,
                generation,
                signal=signal,
                controls=controls,
                requested_count=variation_count,
                seed=seed,
            )
            ranking_json: dict[str, Any] = {
                "mode": "pre_render_concept_curation",
                "quality_floor": 70.0,
                "selected_concept_ids": [item.id for item in selected],
                "concept_scores": scores,
                "creative_controls": controls,
                "finished_cover_ranking": False,
                "degraded": degraded,
            }
        else:
            concepts, critiques, scores, selected, ranking_json = await self._legacy_competition(
                db, generation, signal, base_brief, seed, variation_count
            )

        if not selected:
            raise ValueError("No viable cover concepts passed the planning gate")

        selected_ids = {item.id for item in selected}
        ranks = {
            concept_id: index
            for index, (concept_id, _total) in enumerate(
                sorted(
                    ((cid, score_total(score_map)) for cid, score_map in scores.items()),
                    key=lambda row: (-row[1], row[0]),
                ),
                start=1,
            )
        }
        variation_set = VariationSet(
            id=str(uuid4()),
            generation_id=generation.id,
            set_number=set_number,
            mood_path=mood_path,
            prompt=base_brief,
            requested_count=variation_count,
            concept_count=len(concepts),
            selected_concept_count=len(selected),
            renders_per_concept=max(1, (variation_count + len(selected) - 1) // len(selected)),
            concept_ranking_json=ranking_json,
            ai_winner_variation_id=None,
            ai_runner_up_variation_id=None,
            critic_status="user_choice",
            status="rendering",
        )
        db.add(variation_set)
        db.flush()

        critique_map = {item.concept_id: item for item in critiques}
        for ordinal, concept in enumerate(concepts, start=1):
            meta = asdict(concept)
            critique = critique_map.get(concept.id)
            db.add(
                ConceptCandidate(
                    id=concept.id,
                    variation_set_id=variation_set.id,
                    ordinal=ordinal,
                    name=concept.name,
                    subject=concept.subject,
                    setting=concept.setting,
                    action_or_symbol=concept.action_or_symbol,
                    camera=concept.camera,
                    medium=concept.medium,
                    palette=concept.palette,
                    typography_zone=concept.typography_zone,
                    image_prompt=concept.image_prompt_seed or concept.one_line_pitch,
                    scores_json={
                        "rubric": scores.get(concept.id, {}),
                        "meta": meta,
                        "critique": asdict(critique) if critique else None,
                    },
                    total_score=score_total(scores.get(concept.id, {})),
                    rank=ranks.get(concept.id),
                    selected_for_render=concept.id in selected_ids,
                )
            )

        generation.status = "generating"
        generation.last_error = None
        db.commit()
        self._audit(
            db,
            generation.id,
            "concept_competition",
            1,
            "succeeded" if not ranking_json.get("degraded") else "fallback",
            f"Curated {len(selected)} distinct directions before rendering; final covers remain user-choice only.",
            ranking_json,
            variation_set.id,
        )
        await self._fill_set(db, generation, variation_set)

    async def _ensure_song_intelligence(
        self,
        db: Session,
        generation: Generation,
        analysis: dict[str, Any],
        controls: dict[str, Any],
    ) -> None:
        if analysis.get("song_thesis"):
            return
        if self.creative_director is not None and hasattr(self.creative_director, "build_song_thesis"):
            engine = SongIntelligenceEngine(
                creative_director=self.creative_director,
                max_attempts=self.settings.retry_max_attempts,
                base_delay_seconds=self.settings.retry_base_delay_seconds,
                on_attempt=lambda attempt, outcome, error: self._retry_audit(
                    db, generation.id, None, "song_thesis", attempt, outcome, error
                ),
            )
            report = await engine.synthesize(
                analysis.get("audio") or {},
                analysis.get("lyrics") or {},
                generation.lyrics_text,
                controls,
            )
        else:
            thesis = fallback_song_thesis(
                analysis.get("audio") or {}, analysis.get("lyrics") or {}
            )
            report = {
                "audio": analysis.get("audio") or {},
                "lyrics": analysis.get("lyrics") or {},
                "song_thesis": asdict(thesis),
                "status": "creative_direction_degraded",
            }

        updated = dict(generation.analysis_json or {})
        updated["song_intelligence"] = report
        updated["song_thesis"] = report["song_thesis"]
        updated["creative_direction_status"] = report["status"]
        generation.analysis_json = updated
        db.commit()

    async def _ensure_visual_bible(
        self, db: Session, generation: Generation, analysis: dict[str, Any]
    ) -> None:
        reference = analysis.get("artist_reference")
        if not isinstance(reference, dict) or reference.get("visual_bible"):
            return
        if not self.creative_director or not hasattr(self.creative_director, "analyze_reference"):
            return
        path = reference.get("path")
        if not path:
            return
        try:
            async def operation():
                return await self.creative_director.analyze_reference(
                    image_bytes=self.storage.absolute(str(path)).read_bytes(),
                    mime_type=str(reference.get("mime_type") or "image/jpeg"),
                    reference_type=str(reference.get("reference_type") or "artist"),
                )

            bible = await with_retry(
                operation,
                max_attempts=self.settings.retry_max_attempts,
                base_delay_seconds=self.settings.retry_base_delay_seconds,
                on_attempt=lambda attempt, outcome, error: self._retry_audit(
                    db, generation.id, None, "artist_visual_bible", attempt, outcome, error
                ),
            )
            reference = {**reference, "visual_bible": bible.as_dict(), "visual_bible_error": None}
        except PipelineError as exc:
            reference = {**reference, "visual_bible": None, "visual_bible_error": self._error_dict(exc)}
            self._audit(
                db,
                generation.id,
                "artist_visual_bible",
                1,
                "fallback",
                "Reference image could not be analyzed; continuing without identity guidance.",
                self._error_dict(exc),
            )
        updated = dict(generation.analysis_json or {})
        updated["artist_reference"] = reference
        generation.analysis_json = updated
        db.commit()

    async def _advanced_competition(
        self,
        db: Session,
        generation: Generation,
        *,
        signal: dict[str, Any],
        controls: dict[str, Any],
        requested_count: int,
        seed: str,
    ) -> tuple[list[ConceptDraft], list[ConceptCritique], dict[str, dict[str, float]], list[ConceptDraft], bool]:
        analysis = generation.analysis_json or {}
        target = min(self.settings.selected_concept_count, requested_count, 3)
        context = {
            "song_thesis": analysis.get("song_thesis") or {},
            "audio": analysis.get("audio") or {},
            "lyrics": analysis.get("lyrics") or {},
            "full_lyrics": generation.lyrics_text or "",
            "release_title": generation.title or "",
            "artist": generation.artist or "",
            "creative_controls": controls,
            "creative_seed": seed,
            "previous_directions": [
                (item.concept_ranking_json or {}).get("selected_concept_ids", [])
                for item in generation.variation_sets[-3:]
            ],
            "artist_visual_bible": ((analysis.get("artist_reference") or {}).get("visual_bible")),
            "improvement_source": self._active_improvement_source.get(),
        }
        try:
            async def operation():
                raw = await self.creative_director.create_concepts(
                    context=context, count=self.settings.concept_count
                )
                critiques = await self.creative_director.critique_concepts(
                    context=context, concepts=raw
                )
                revised = await self.creative_director.revise_concepts(
                    context=context, concepts=raw, critiques=critiques
                )
                return revised, critiques

            revised, critiques = await with_retry(
                operation,
                max_attempts=self.settings.retry_max_attempts,
                base_delay_seconds=self.settings.retry_base_delay_seconds,
                on_attempt=lambda attempt, outcome, error: self._retry_audit(
                    db, generation.id, None, "creative_concept_competition", attempt, outcome, error
                ),
            )
            if len({item.id for item in revised}) != len(revised):
                raise ValueError("Creative Director returned duplicate concept ids")
            critique_map = {item.concept_id: item for item in critiques}
            scores = {
                item.id: score_concept(
                    item,
                    analysis.get("song_thesis") or {},
                    controls,
                    critique_map.get(item.id).suggested_scores if critique_map.get(item.id) else None,
                )
                for item in revised
            }
            totals = {cid: score_total(values) for cid, values in scores.items()}
            passing = [item for item in revised if totals.get(item.id, 0.0) >= 70.0]
            selected = select_diverse_concepts(passing, totals, count=target)
            if len(selected) >= target:
                return revised, critiques, scores, selected, False

            # One replacement round only; never lower the quality floor.
            missing = target - len(selected)
            replacement_context = {
                **context,
                "replacement_instruction": (
                    f"Create {missing} replacement concepts for directions rejected by the 70-point quality gate. "
                    "They must be materially different from the already-selected directions."
                ),
                "already_selected": [asdict(item) for item in selected],
            }
            replacements = await self.creative_director.create_concepts(
                context=replacement_context, count=missing
            )
            replacement_critiques = await self.creative_director.critique_concepts(
                context=replacement_context, concepts=replacements
            )
            replacement_revised = await self.creative_director.revise_concepts(
                context=replacement_context,
                concepts=replacements,
                critiques=replacement_critiques,
            )
            replacement_map = {item.concept_id: item for item in replacement_critiques}
            replacement_scores = {
                item.id: score_concept(
                    item,
                    analysis.get("song_thesis") or {},
                    controls,
                    replacement_map.get(item.id).suggested_scores if replacement_map.get(item.id) else None,
                )
                for item in replacement_revised
            }
            all_concepts = [*revised, *replacement_revised]
            all_critiques = [*critiques, *replacement_critiques]
            all_scores = {**scores, **replacement_scores}
            all_totals = {cid: score_total(values) for cid, values in all_scores.items()}
            all_passing = [item for item in all_concepts if all_totals.get(item.id, 0.0) >= 70.0]
            selected = select_diverse_concepts(all_passing, all_totals, count=target)
            if len(selected) >= target:
                return all_concepts, all_critiques, all_scores, selected, False
            raise PipelineError("Creative Director could not produce enough distinct concepts above the quality floor")
        except PipelineError as exc:
            self._audit(
                db,
                generation.id,
                "creative_concept_competition",
                1,
                "fallback",
                "Cloudflare Creative Director degraded; using local song-specific concept directions.",
                self._error_dict(exc),
            )
            updated = dict(generation.analysis_json or {})
            updated["creative_direction_status"] = "creative_direction_degraded"
            generation.analysis_json = updated
            db.commit()
            fallback = self._fallback_drafts(
                analysis.get("song_thesis") or {}, controls, self.settings.concept_count
            )
            scores = {item.id: self._fallback_scores(item, analysis.get("song_thesis") or {}, controls) for item in fallback}
            totals = {cid: score_total(values) for cid, values in scores.items()}
            selected = select_diverse_concepts(fallback, totals, count=target)
            return fallback, [], scores, selected, True

    async def _legacy_competition(
        self,
        db: Session,
        generation: Generation,
        signal: dict[str, Any],
        brief: str,
        seed: str,
        requested_count: int,
    ) -> tuple[list[ConceptDraft], list[ConceptCritique], dict[str, dict[str, float]], list[ConceptDraft], dict[str, Any]]:
        raw = await super()._plan_concepts(db, generation, signal, brief, seed)
        normalized = [self._legacy_to_draft(item, index) for index, item in enumerate(raw, start=1)]
        ranked = deterministic_rank(
            [self._legacy_rank_payload(item) for item in normalized],
            selected_count=min(self.settings.selected_concept_count, requested_count, len(normalized)),
            degraded=True,
        )
        score_maps = {
            item.concept_id: {
                "song_specificity": round(item.total_score * 0.25, 2),
                "originality": round(item.total_score * 0.20, 2),
                "emotional_power": round(item.total_score * 0.15, 2),
                "visual_memorability": round(item.total_score * 0.15, 2),
                "artist_campaign_value": round(item.total_score * 0.10, 2),
                "flux_executability": round(item.total_score * 0.10, 2),
                "typography_compatibility": round(item.total_score * 0.05, 2),
            }
            for item in ranked.ranked_concepts
        }
        by_id = {item.id: item for item in normalized}
        selected = [by_id[cid] for cid in ranked.selected_concept_ids if cid in by_id]
        return normalized, [], score_maps, selected, {
            "mode": "legacy_test_compatibility",
            "selected_concept_ids": [item.id for item in selected],
            "finished_cover_ranking": False,
            "creative_controls": {},
            "degraded": True,
        }

    async def _fill_set(
        self, db: Session, generation: Generation, variation_set: VariationSet
    ) -> None:
        selected = list(
            db.scalars(
                select(ConceptCandidate)
                .where(
                    ConceptCandidate.variation_set_id == variation_set.id,
                    ConceptCandidate.selected_for_render.is_(True),
                )
                .order_by(ConceptCandidate.rank, ConceptCandidate.ordinal)
            )
        )
        if not selected:
            raise ValueError("No curated concepts available")
        existing = {
            row.position
            for row in db.scalars(
                select(Variation).where(Variation.variation_set_id == variation_set.id)
            )
        }
        analysis = generation.analysis_json or {}
        controls = self._controls_from_prompt_context(variation_set)
        reference = analysis.get("artist_reference") or {}
        visual_bible = reference.get("visual_bible") if isinstance(reference, dict) else None
        failure: Exception | None = None

        for position in range(1, variation_set.requested_count + 1):
            if position in existing:
                continue
            concept = selected[(position - 1) % len(selected)]
            render_index = ((position - 1) // len(selected)) + 1
            payload = self._concept_payload_v2(concept)
            prompt = build_production_brief(
                concept=payload,
                creative_controls=controls,
                visual_bible=visual_bible,
                render_index=render_index,
            )
            try:
                async def operation():
                    exact = getattr(self.image_client, "generate_exact", None)
                    return await exact(prompt, position) if exact else await self.image_client.generate(prompt, position)

                generated = await with_retry(
                    operation,
                    max_attempts=self.settings.retry_max_attempts,
                    base_delay_seconds=self.settings.retry_base_delay_seconds,
                    on_attempt=lambda attempt, outcome, error, p=position: self._retry_audit(
                        db, generation.id, variation_set.id, f"image_generation_{p}", attempt, outcome, error
                    ),
                )
                self._save_raw_image(
                    generation.id, variation_set.id, position, generated.content
                )
                final_bytes = compose_release_layers(
                    generated.content,
                    title=generation.title,
                    artist=generation.artist,
                    settings=self._release_settings(generation),
                )
                relative, width, height = self.storage.save_image(
                    generation.id, variation_set.id, position, final_bytes
                )
                db.add(
                    Variation(
                        id=str(uuid4()),
                        variation_set_id=variation_set.id,
                        concept_candidate_id=concept.id,
                        position=position,
                        render_index=render_index,
                        render_prompt=prompt,
                        image_path=relative,
                        mime_type="image/png",
                        width=width,
                        height=height,
                        openai_request_id=generated.request_id,
                        rank=None,
                        selection_tier="unranked",
                    )
                )
                db.commit()
            except Exception as exc:
                failure = exc
                break

        completed = db.scalar(
            select(func.count(Variation.id)).where(Variation.variation_set_id == variation_set.id)
        ) or 0
        variation_set.ai_winner_variation_id = None
        variation_set.ai_runner_up_variation_id = None
        variation_set.critic_status = "user_choice"
        if completed == variation_set.requested_count:
            variation_set.status = "complete"
            generation.status = "complete"
            variation_set.error_json = None
            generation.last_error = None
        elif completed:
            variation_set.status = "partial"
            generation.status = "partial"
            variation_set.error_json = self._error_dict(failure)
            generation.last_error = self._error_dict(failure)
        else:
            variation_set.status = "failed"
            generation.status = "image_failed"
            variation_set.error_json = self._error_dict(failure) or {
                "code": "image_failed",
                "message": "No images were generated.",
            }
            generation.last_error = variation_set.error_json
        db.commit()

    async def generate_better(
        self,
        generation_id: str,
        source_variation_id: str,
        variation_count: int = 6,
        mood_path: str = "blend",
        creative_controls: dict[str, str] | None = None,
    ) -> None:
        with self.database.session_factory() as db:
            generation = self.get(db, generation_id)
            source = db.get(Variation, source_variation_id)
            if source is None:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Selected source cover was not found.")
            source_set = db.get(VariationSet, source.variation_set_id)
            if source_set is None or source_set.generation_id != generation.id:
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail="Selected source cover does not belong to this generation.")
            concept = db.get(ConceptCandidate, source.concept_candidate_id) if source.concept_candidate_id else None
            context = {
                "source_variation_id": source.id,
                "source_render_prompt": source.render_prompt or "",
                "source_concept": self._concept_payload_v2(concept) if concept else {},
                "source_feedback": source.cover_feedback_json or {},
                "instruction": "Preserve the central story and visual metaphor; improve execution unless current user controls request a new direction.",
            }
            token = self._active_improvement_source.set(context)
            try:
                self._audit(
                    db,
                    generation.id,
                    "generate_better",
                    1,
                    "started",
                    "Improving the cover direction explicitly selected by the user.",
                    {"source_variation_id": source.id},
                    source_set.id,
                )
                await self._create_and_fill_set(
                    db, generation, variation_count, mood_path, creative_controls
                )
            finally:
                self._active_improvement_source.reset(token)

    def recompose_release_text(
        self,
        db: Session,
        generation_id: str,
        settings: dict[str, Any],
    ) -> Generation:
        generation = self.set_release_settings(db, generation_id, settings)
        recomposed = 0
        for variation_set in generation.variation_sets:
            for variation in variation_set.variations:
                raw_path = self._raw_path(generation.id, variation_set.id, variation.position)
                if not raw_path.exists():
                    continue
                final_bytes = compose_release_layers(
                    raw_path.read_bytes(),
                    title=generation.title,
                    artist=generation.artist,
                    settings=self._release_settings(generation),
                )
                self.storage.save_image(
                    generation.id, variation_set.id, variation.position, final_bytes
                )
                recomposed += 1
        self._audit(
            db,
            generation.id,
            "release_text_recompose",
            1,
            "succeeded",
            f"Recomposed {recomposed} covers from raw artwork without rerunning FLUX.",
            {"recomposed": recomposed, "settings": self._release_settings(generation)},
        )
        return self.get(db, generation.id)

    def _supports_advanced_director(self) -> bool:
        director = self.creative_director
        return bool(
            director
            and hasattr(director, "create_concepts")
            and hasattr(director, "critique_concepts")
            and hasattr(director, "revise_concepts")
        )

    def _save_raw_image(
        self, generation_id: str, variation_set_id: str, position: int, content: bytes
    ) -> None:
        path = self._raw_path(generation_id, variation_set_id, position)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.storage._atomic_write(path, content)

    def _raw_path(self, generation_id: str, variation_set_id: str, position: int) -> Path:
        return self.storage.root / "raw" / generation_id / variation_set_id / f"{position}.png"

    @staticmethod
    def _release_settings(generation: Generation) -> dict[str, Any]:
        analysis = generation.analysis_json or {}
        return normalize_release_settings(
            analysis.get("_release_text"), parental_advisory=bool(generation.parental_advisory)
        )

    @staticmethod
    def _controls_from_prompt_context(variation_set: VariationSet) -> dict[str, Any]:
        ranking = variation_set.concept_ranking_json or {}
        return dict(ranking.get("creative_controls") or {})

    @staticmethod
    def _concept_payload_v2(item: ConceptCandidate | None) -> dict[str, Any]:
        if item is None:
            return {}
        scores = item.scores_json or {}
        meta = scores.get("meta") if isinstance(scores, dict) else None
        if isinstance(meta, dict):
            return dict(meta)
        return {
            "id": item.id,
            "name": item.name,
            "one_line_pitch": item.image_prompt,
            "why_it_fits": "",
            "subject": item.subject,
            "artist_presence": "none",
            "setting": item.setting,
            "action_or_symbol": item.action_or_symbol,
            "wardrobe_or_material": "",
            "camera": item.camera,
            "composition": "",
            "lighting": "",
            "medium": item.medium,
            "palette": item.palette,
            "texture": "",
            "dominant_shape": "",
            "visual_metaphor": item.action_or_symbol,
            "typography_zone": item.typography_zone,
            "must_include": [],
            "avoid": [],
            "image_prompt_seed": item.image_prompt,
        }

    @staticmethod
    def _legacy_to_draft(item: dict[str, Any], index: int) -> ConceptDraft:
        return ConceptDraft(
            id=str(item.get("id") or uuid4()),
            name=str(item.get("name") or f"Concept {index}"),
            one_line_pitch=str(item.get("image_prompt") or item.get("subject") or ""),
            why_it_fits="Legacy compatibility concept.",
            subject=str(item.get("subject") or "song-specific physical symbol"),
            artist_presence="none",
            setting=str(item.get("setting") or "controlled practical set"),
            action_or_symbol=str(item.get("action_or_symbol") or "visible emotional turn"),
            wardrobe_or_material="",
            camera=str(item.get("camera") or "35mm eye level"),
            composition="single clear focal point",
            lighting="controlled editorial light",
            medium=str(item.get("medium") or "editorial photography"),
            palette=str(item.get("palette") or "restrained palette"),
            texture="tactile practical texture",
            dominant_shape="single focal silhouette",
            visual_metaphor=str(item.get("action_or_symbol") or "emotional turn"),
            typography_zone=str(item.get("typography_zone") or "upper-left"),
            must_include=[],
            avoid=[],
            image_prompt_seed=str(item.get("image_prompt") or ""),
        )

    @staticmethod
    def _legacy_rank_payload(item: ConceptDraft) -> dict[str, Any]:
        return {
            "id": item.id,
            "name": item.name,
            "subject": item.subject,
            "setting": item.setting,
            "action_or_symbol": item.action_or_symbol,
            "camera": item.camera,
            "medium": item.medium,
            "palette": item.palette,
            "typography_zone": item.typography_zone,
            "image_prompt": item.image_prompt_seed,
        }

    def _fallback_drafts(
        self, thesis: dict[str, Any], controls: dict[str, Any], count: int
    ) -> list[ConceptDraft]:
        permissions = [str(v) for v in (thesis.get("visual_permissions") or []) if str(v).strip()]
        anchor = permissions[0] if permissions else str(thesis.get("core_meaning") or "emotional turning point")
        strict = str(controls.get("creative_strength") or "").lower() == "strict"
        subject_override = str(controls.get("subject_hint") or "").strip() if strict else ""
        scene_override = str(controls.get("scene_hint") or "").strip() if strict else ""
        must = [str(controls.get("must_include"))] if controls.get("must_include") else []
        avoid = [str(controls.get("avoid"))] if controls.get("avoid") else []
        directions = [
            ("Evidence", "one lyric-specific object", "controlled editorial set", "still-life photography", "absence"),
            ("Aftermath", "one displaced object", "believable aftermath location", "documentary photography", "what remains"),
            ("No-Person Horizon", "altered environment with no people", "open natural location", "location photography", "distance"),
            ("Character Editorial", "one character in a revealing gesture", "minimal real interior", "fashion editorial photography", "private pressure"),
            ("Physical Sculpture", "one constructed sculptural object", "gallery-like practical set", "sculpture photography", "transformation"),
            ("Tactile Print", "one graphic physical icon", "paper and ink field", "screenprint collage", "memory made physical"),
            ("Reflection", "partial reflection or silhouette", "glass and practical light", "in-camera photography", "split perspective"),
            ("Scale Shift", "small concrete subject against large space", "architectural location", "wide editorial photography", "pressure and scale"),
        ]
        output: list[ConceptDraft] = []
        for index in range(count):
            name, subject, setting, medium, metaphor = directions[index % len(directions)]
            if subject_override:
                subject = subject_override
            else:
                subject = f"{subject} anchored by {anchor}"
            if scene_override:
                setting = scene_override
            output.append(
                ConceptDraft(
                    id=str(uuid4()),
                    name=name,
                    one_line_pitch=f"{subject} in {setting}",
                    why_it_fits=f"Builds directly from the song thesis around {anchor}.",
                    subject=subject,
                    artist_presence="hero" if subject_override else ("none" if index in {0, 1, 2, 4, 5, 7} else "partial"),
                    setting=setting,
                    action_or_symbol=f"A visible change involving {anchor}",
                    wardrobe_or_material="real practical materials; no generic luxury props",
                    camera=("35mm wide" if index % 2 == 0 else "50mm off-center editorial"),
                    composition=("wide negative space" if index % 3 == 0 else "single clear focal point"),
                    lighting=("natural directional light" if index % 2 == 0 else "controlled soft editorial light"),
                    medium=medium,
                    palette=str(controls.get("color_mood") or "restrained song-led palette"),
                    texture="real tactile surfaces; subtle film grain",
                    dominant_shape=("horizontal negative space" if index % 2 == 0 else "single vertical focal form"),
                    visual_metaphor=metaphor,
                    typography_zone=("upper-left" if index % 2 == 0 else "lower-right"),
                    must_include=must,
                    avoid=avoid,
                    image_prompt_seed=f"Major-label cover built around {anchor}; {metaphor}; physically believable, not generic AI art.",
                )
            )
        return output

    @staticmethod
    def _fallback_scores(
        item: ConceptDraft, thesis: dict[str, Any], controls: dict[str, Any]
    ) -> dict[str, float]:
        suggested = {
            "song_specificity": 19.0,
            "originality": 14.0,
            "emotional_power": 11.0,
            "visual_memorability": 11.0,
            "artist_campaign_value": 7.0,
            "flux_executability": 7.0,
            "typography_compatibility": 4.0,
        }
        return score_concept(item, thesis, controls, suggested)

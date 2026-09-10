from __future__ import annotations

from dataclasses import asdict
import json
from typing import Any

import httpx

from .creative_direction import ConceptCritique, ConceptDraft, SongThesis
from .errors import (
    CloudflareAuthenticationError,
    CloudflareRateLimitError,
    CloudflareRequestError,
    CloudflareServiceError,
)


class CloudflareGemmaCreativeDirector:
    """Major-label creative direction through Cloudflare Workers AI Gemma."""

    endpoint_root = "https://api.cloudflare.com/client/v4/accounts"

    def __init__(
        self,
        *,
        account_id: str | None,
        api_token: str | None,
        model: str = "@cf/google/gemma-4-26b-a4b-it",
        timeout_seconds: float = 90,
        enabled: bool = True,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.account_id = account_id
        self.api_token = api_token
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.enabled = enabled
        self.transport = transport

    async def build_song_thesis(self, *, context: dict[str, Any]) -> SongThesis:
        system = """
You are the senior creative director of a major-label album-art department.
Study the supplied music analysis, lyric analysis, full lyrics, release metadata, and user controls.
Return JSON only. Build a song-specific visual thesis rather than a genre stereotype.
Identify the emotional arc, what the record is really saying, the strongest sound/lyric contradiction,
a signature moment, imagery genuinely supported by the song, and visual cliches or unsupported assumptions
to ban. The campaign_thesis must be one concise sentence strong enough to judge every cover concept against.
User Strict controls are binding and outrank your own preferences.
Required JSON keys: core_meaning, emotional_arc, musical_personality, lyrical_world with people/objects/places/symbols,
creative_contradiction, signature_moment, visual_permissions, visual_bans, artist_role_recommendation,
campaign_thesis.
""".strip()
        payload = await self._run_json(system=system, user=context, max_completion_tokens=1800)
        try:
            return SongThesis.from_mapping(payload)
        except Exception as exc:
            raise CloudflareServiceError(
                f"Cloudflare Gemma returned an invalid song thesis: {exc}"
            ) from exc

    async def create_concepts(
        self, *, context: dict[str, Any], count: int
    ) -> list[ConceptDraft]:
        system = f"""
You are a bold major-label art director. Return JSON only with key concepts containing exactly {count} cover concepts.
Every concept must be specifically justified by the supplied Song Thesis and must differ materially from the others.
Do not substitute genre cliches for lyric or musical evidence. Include at least one viable no-person direction unless
Strict user controls require a person. Typography is added later: never ask the image model to render title, artist,
logos, fake lettering, watermarks, or a Parental Advisory label.
Each concept requires: id, name, one_line_pitch, why_it_fits, subject, artist_presence, setting, action_or_symbol,
wardrobe_or_material, camera, composition, lighting, medium, palette, texture, dominant_shape, visual_metaphor,
typography_zone, must_include, avoid, image_prompt_seed.
""".strip()
        payload = await self._run_json(system=system, user=context, max_completion_tokens=5200)
        try:
            raw = payload["concepts"]
            concepts = [ConceptDraft.from_mapping(item) for item in raw]
            if len(concepts) != count:
                raise ValueError(f"expected {count} concepts, got {len(concepts)}")
            return concepts
        except Exception as exc:
            raise CloudflareServiceError(
                f"Cloudflare Gemma returned an invalid concept batch: {exc}"
            ) from exc

    async def critique_concepts(
        self, *, context: dict[str, Any], concepts: list[ConceptDraft]
    ) -> list[ConceptCritique]:
        rubric = {
            "song_specificity": 25,
            "originality": 20,
            "emotional_power": 15,
            "visual_memorability": 15,
            "artist_campaign_value": 10,
            "flux_executability": 10,
            "typography_compatibility": 5,
        }
        user = {
            **context,
            "concepts": [asdict(item) for item in concepts],
            "score_maxima": rubric,
        }
        system = """
Act as an adversarial record-label creative review board. Return JSON only with key critiques.
Do not praise by default. Identify concepts that could fit unrelated songs, rely on generic AI/genre imagery,
duplicate another concept, violate user controls, have weak emotional storytelling, lack a typography-safe zone,
or are too complicated for FLUX.1 Schnell. Flag accidental-text/signage risks.
For each concept return concept_id, problems, rebuild_required, revision_direction, and suggested_scores using exactly
the supplied score_maxima categories. Scores are recommendations only; deterministic code will clamp and validate them.
""".strip()
        payload = await self._run_json(system=system, user=user, max_completion_tokens=4200)
        try:
            critiques = [ConceptCritique.from_mapping(item) for item in payload["critiques"]]
            expected_ids = {item.id for item in concepts}
            if {item.concept_id for item in critiques} != expected_ids:
                raise ValueError("critique ids do not match concept ids")
            return critiques
        except Exception as exc:
            raise CloudflareServiceError(
                f"Cloudflare Gemma returned an invalid critique batch: {exc}"
            ) from exc

    async def revise_concepts(
        self,
        *,
        context: dict[str, Any],
        concepts: list[ConceptDraft],
        critiques: list[ConceptCritique],
    ) -> list[ConceptDraft]:
        user = {
            **context,
            "concepts": [asdict(item) for item in concepts],
            "critiques": [asdict(item) for item in critiques],
        }
        system = """
You are the senior creative director after a hard internal review. Return JSON only with key concepts.
Revise every concept exactly once. Rebuild weak ideas when the critique calls for it instead of merely changing wording.
Preserve song specificity and obey Strict user controls. Keep the batch genuinely diverse. Do not introduce rendered
release text, logos, watermarks, or Parental Advisory artwork. Return the same complete concept schema and preserve
concept ids so revisions remain auditable.
""".strip()
        payload = await self._run_json(system=system, user=user, max_completion_tokens=5200)
        try:
            revised = [ConceptDraft.from_mapping(item) for item in payload["concepts"]]
            if len(revised) != len(concepts):
                raise ValueError("revision count does not match original concept count")
            if {item.id for item in revised} != {item.id for item in concepts}:
                raise ValueError("revision ids do not match original concept ids")
            return revised
        except Exception as exc:
            raise CloudflareServiceError(
                f"Cloudflare Gemma returned an invalid revised concept batch: {exc}"
            ) from exc

    async def _run_json(
        self,
        *,
        system: str,
        user: dict[str, Any],
        max_completion_tokens: int,
    ) -> dict[str, Any]:
        if not self.enabled:
            raise CloudflareRequestError("Cloudflare Creative Director is disabled.")
        if not self.account_id or not self.api_token:
            raise CloudflareAuthenticationError(
                "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be configured.",
                status_code=401,
            )

        endpoint = f"{self.endpoint_root}/{self.account_id}/ai/run/{self.model}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
            "temperature": 0.7,
            "max_completion_tokens": max_completion_tokens,
        }
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, transport=self.transport
            ) as client:
                response = await client.post(endpoint, headers=headers, json=payload)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise CloudflareServiceError(
                f"Cloudflare Workers AI Creative Director request failed: {exc}"
            ) from exc

        request_id = response.headers.get("cf-ray") or response.headers.get("x-request-id")
        if response.status_code in {401, 403}:
            raise CloudflareAuthenticationError(
                self._error_message(response),
                status_code=response.status_code,
                request_id=request_id,
            )
        if response.status_code == 429:
            raise CloudflareRateLimitError(
                self._error_message(response),
                status_code=429,
                request_id=request_id,
            )
        if response.status_code >= 500:
            raise CloudflareServiceError(
                self._error_message(response),
                status_code=response.status_code,
                request_id=request_id,
            )
        if response.status_code >= 400:
            raise CloudflareRequestError(
                self._error_message(response),
                status_code=response.status_code,
                request_id=request_id,
            )

        try:
            body = response.json()
            if body.get("success") is False:
                raise CloudflareRequestError(
                    self._error_message(response),
                    status_code=response.status_code,
                    request_id=request_id,
                )
            result = body.get("result")
            if not isinstance(result, dict):
                raise ValueError("missing result object")
            raw = result.get("response")
            if isinstance(raw, dict):
                return raw
            if not isinstance(raw, str) or not raw.strip():
                raise ValueError("missing response text")
            return self._parse_json_text(raw)
        except CloudflareRequestError:
            raise
        except Exception as exc:
            raise CloudflareServiceError(
                f"Cloudflare Workers AI Creative Director returned invalid JSON: {exc}",
                request_id=request_id,
            ) from exc

    @staticmethod
    def _parse_json_text(raw: str) -> dict[str, Any]:
        text = raw.strip()
        if text.startswith("```"):
            first_newline = text.find("\n")
            if first_newline >= 0:
                text = text[first_newline + 1 :]
            if text.endswith("```"):
                text = text[:-3].rstrip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start < 0 or end <= start:
                raise
            parsed = json.loads(text[start : end + 1])
        if not isinstance(parsed, dict):
            raise ValueError("model output must be a JSON object")
        return parsed

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        try:
            payload = response.json()
            errors = payload.get("errors") or []
            if errors:
                first = errors[0]
                if isinstance(first, dict):
                    return str(first.get("message") or first)
                return str(first)
            return str(payload)
        except Exception:
            return response.text[:500] or f"Cloudflare HTTP {response.status_code}"

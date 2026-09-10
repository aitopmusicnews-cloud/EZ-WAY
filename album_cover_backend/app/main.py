from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .audio_analysis import AudioAnalyzer
from .cloudflare_creative_director import CloudflareGemmaCreativeDirector
from .cloudflare_generation_service import CloudflareMajorLabelGenerationService
from .config import Settings
from .database import create_database
from .image_client import CloudflareFluxImageClient
from .lyrics_analysis import LyricsAnalyzer
from .routers.generations import router
from .storage import LocalStorage


@dataclass(slots=True)
class AppDependencies:
    audio_analyzer: object | None = None
    lyrics_analyzer: object | None = None
    image_client: object | None = None
    creative_director: object | None = None
    # Retained only so older test/integration callers do not break while the
    # Gemini-era modules are phased out. Production does not instantiate them.
    concept_ranker: object | None = None
    cover_critic: object | None = None


def create_app(
    settings: Settings | None = None, dependencies: AppDependencies | None = None
) -> FastAPI:
    settings = settings or Settings()
    dependencies = dependencies or AppDependencies()
    database = create_database(settings.database_url)
    storage = LocalStorage(settings.storage_root)
    audio_analyzer = dependencies.audio_analyzer or AudioAnalyzer(
        settings.audio_analysis_max_seconds
    )
    lyrics_analyzer = dependencies.lyrics_analyzer or LyricsAnalyzer()
    image_client = dependencies.image_client or CloudflareFluxImageClient(
        account_id=settings.cloudflare_account_id,
        api_token=settings.cloudflare_api_token,
        model=settings.cloudflare_flux_model,
        steps=settings.cloudflare_flux_steps,
        timeout_seconds=settings.cloudflare_timeout_seconds,
        allow_mock_images=settings.allow_mock_images,
    )
    creative_director = dependencies.creative_director or CloudflareGemmaCreativeDirector(
        account_id=settings.cloudflare_account_id,
        api_token=settings.cloudflare_api_token,
        model=settings.cloudflare_creative_director_model,
        timeout_seconds=settings.cloudflare_creative_director_timeout_seconds,
        enabled=settings.enable_cloudflare_creative_director,
    )
    generation_service = CloudflareMajorLabelGenerationService(
        settings=settings,
        database=database,
        storage=storage,
        audio_analyzer=audio_analyzer,
        lyrics_analyzer=lyrics_analyzer,
        image_client=image_client,
        creative_director=creative_director,
        concept_ranker=dependencies.concept_ranker,
        cover_critic=dependencies.cover_critic,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        database.create_all()
        yield

    app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.database = database
    app.state.generation_service = generation_service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    app.mount("/media", StaticFiles(directory=settings.storage_root), name="media")

    @app.get("/health")
    def health():
        cloudflare_configured = bool(
            settings.cloudflare_account_id and settings.cloudflare_api_token
        )
        return {
            "status": "ok",
            "pipeline": {
                "concept_count": settings.concept_count,
                "selected_concept_count": settings.selected_concept_count,
                "renders_per_concept": settings.renders_per_concept,
                "render_count": settings.render_count,
                "finished_cover_selection": "user",
                "generate_better_source": "user_selected_cover",
            },
            "providers": {
                "cloudflare_creative_director": {
                    "configured": cloudflare_configured,
                    "enabled": settings.enable_cloudflare_creative_director,
                    "model": settings.cloudflare_creative_director_model,
                    "vision": True,
                },
                "cloudflare_flux_images": {
                    "configured": cloudflare_configured,
                    "model": settings.cloudflare_flux_model,
                    "steps": settings.cloudflare_flux_steps,
                },
                # Compatibility key used by older clients; still points to the
                # same Cloudflare FLUX renderer and exposes no credentials.
                "flux_images": {
                    "configured": cloudflare_configured,
                    "model": "flux",
                },
            },
        }

    if settings.frontend_root.exists():
        app.mount("/", StaticFiles(directory=settings.frontend_root, html=True), name="frontend")

    return app


app = create_app()

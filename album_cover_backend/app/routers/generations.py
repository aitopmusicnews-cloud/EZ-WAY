from __future__ import annotations

import json

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..font_preview import render_font_preview
from ..metrics import collection_metrics
from ..presentation import generation_response
from ..reference_upload import read_validated_reference_image
from ..schemas import (
    CollectionMetricsResponse,
    CreativeControls,
    GenerationResponse,
    HistoryResponse,
    ImproveRequest,
    RegenerateRequest,
    ReleaseTextSettings,
)
from ..validation import (
    read_lyrics_file,
    read_validated_mp3,
    sanitize_lyrics,
    sanitize_metadata_text,
    sha256_bytes,
)


router = APIRouter(prefix="/api", tags=["album-covers"])


def get_db(request: Request):
    yield from request.app.state.database.session()


def service(request: Request):
    return request.app.state.generation_service


def _release_settings(
    *,
    show_title: bool,
    show_artist: bool,
    parental_advisory: bool,
    title_position: str,
    title_size: int,
    title_font_style: str,
    title_case: str,
    title_treatment: str,
    title_color: str,
    title_x: float | None,
    title_y: float | None,
    artist_position: str,
    artist_size: int,
    artist_font_style: str,
    artist_case: str,
    artist_treatment: str,
    artist_color: str,
    artist_x: float | None,
    artist_y: float | None,
    advisory_position: str,
    advisory_size: str,
) -> dict:
    try:
        return ReleaseTextSettings.model_validate(
            {
                "show_title": show_title,
                "show_artist": show_artist,
                "parental_advisory": parental_advisory,
                "title": {
                    "position": title_position,
                    "size": title_size,
                    "font_style": title_font_style,
                    "case": title_case,
                    "treatment": title_treatment,
                    "color": title_color,
                    "x": title_x,
                    "y": title_y,
                },
                "artist": {
                    "position": artist_position,
                    "size": artist_size,
                    "font_style": artist_font_style,
                    "case": artist_case,
                    "treatment": artist_treatment,
                    "color": artist_color,
                    "x": artist_x,
                    "y": artist_y,
                },
                "advisory": {"position": advisory_position, "size": advisory_size},
            }
        ).model_dump()
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Invalid title/artist layout settings.") from exc


@router.get("/fonts/{font_style}/preview")
def font_preview(font_style: str, text: str = "Album Title", size: int = 64, color: str = "#F5F1E8"):
    try:
        preview = render_font_preview(font_style, text=text, size=size, color=color)
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Unknown font style.")
    return Response(
        content=preview.content,
        media_type=preview.mime_type,
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.post("/generations", response_model=GenerationResponse)
async def create_generation(
    response: Response,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    audio: UploadFile | None = File(default=None),
    lyrics_file: UploadFile | None = File(default=None),
    reference_image: UploadFile | None = File(default=None),
    reference_type: str = Form(default="artist", pattern="^(artist|character|style)$"),
    lyrics_text: str | None = Form(default=None),
    title: str | None = Form(default=None),
    artist: str | None = Form(default=None),
    parental_advisory: bool = Form(default=False),
    show_title: bool = Form(default=True),
    show_artist: bool = Form(default=True),
    title_position: str = Form(default="top-center"),
    title_size: int = Form(default=104, ge=24, le=180),
    title_font_style: str = Form(default="editorial"),
    title_case: str = Form(default="original"),
    title_treatment: str = Form(default="light"),
    title_color: str = Form(default="#F5F1E8"),
    title_x: float | None = Form(default=None, ge=0.0, le=1.0),
    title_y: float | None = Form(default=None, ge=0.0, le=1.0),
    artist_position: str = Form(default="bottom-center"),
    artist_size: int = Form(default=42, ge=24, le=180),
    artist_font_style: str = Form(default="serif"),
    artist_case: str = Form(default="original"),
    artist_treatment: str = Form(default="light"),
    artist_color: str = Form(default="#F5F1E8"),
    artist_x: float | None = Form(default=None, ge=0.0, le=1.0),
    artist_y: float | None = Form(default=None, ge=0.0, le=1.0),
    advisory_position: str = Form(default="bottom-right"),
    advisory_size: str = Form(default="small"),
    collection_id: str | None = Form(default=None),
    mood_path: str = Form(default="auto", pattern="^(auto|blend|audio|lyrics)$"),
    variation_count: int = Form(default=6, ge=3, le=8),
    run_async: bool = Form(default=True),
    subject_hint: str | None = Form(default=None),
    scene_hint: str | None = Form(default=None),
    style_preset: str = Form(default="auto"),
    composition_preset: str = Form(default="auto"),
    color_mood: str | None = Form(default=None),
    must_include: str | None = Form(default=None),
    avoid: str | None = Form(default=None),
    creative_strength: str = Form(default="balanced"),
):
    settings = request.app.state.settings
    audio_bytes = await read_validated_mp3(audio, settings.max_audio_bytes) if audio else None
    file_lyrics = await read_lyrics_file(lyrics_file, settings.max_lyrics_chars) if lyrics_file else ""
    pasted_lyrics = sanitize_lyrics(lyrics_text or "", settings.max_lyrics_chars)
    combined_lyrics = "\n\n".join(part for part in (pasted_lyrics, file_lyrics) if part).strip() or None
    clean_title = sanitize_metadata_text(title, field_name="Title")
    clean_artist = sanitize_metadata_text(artist, field_name="Artist")
    controls = CreativeControls(
        subject_hint=sanitize_metadata_text(subject_hint, field_name="Subject hint", max_chars=300),
        scene_hint=sanitize_metadata_text(scene_hint, field_name="Scene hint", max_chars=300),
        style_preset=style_preset,
        composition_preset=composition_preset,
        color_mood=sanitize_metadata_text(color_mood, field_name="Color / mood", max_chars=200),
        must_include=sanitize_metadata_text(must_include, field_name="Must include", max_chars=500),
        avoid=sanitize_metadata_text(avoid, field_name="Avoid", max_chars=500),
        creative_strength=creative_strength,
    ).as_prompt_dict()
    release = _release_settings(
        show_title=show_title,
        show_artist=show_artist,
        parental_advisory=parental_advisory,
        title_position=title_position,
        title_size=title_size,
        title_font_style=title_font_style,
        title_case=title_case,
        title_treatment=title_treatment,
        title_color=title_color,
        title_x=title_x,
        title_y=title_y,
        artist_position=artist_position,
        artist_size=artist_size,
        artist_font_style=artist_font_style,
        artist_case=artist_case,
        artist_treatment=artist_treatment,
        artist_color=artist_color,
        artist_x=artist_x,
        artist_y=artist_y,
        advisory_position=advisory_position,
        advisory_size=advisory_size,
    )
    reference = await read_validated_reference_image(reference_image) if reference_image else None
    reference_hash = sha256_bytes(reference[0]) if reference else None

    if not audio_bytes and not combined_lyrics:
        raise HTTPException(status_code=422, detail="Upload an MP3, provide lyrics, or provide both.")

    cache_controls = {
        **controls,
        "_release_text": json.dumps(release, sort_keys=True, separators=(",", ":")),
        "_reference_hash": reference_hash or "",
        "_reference_type": reference_type if reference else "",
    }
    svc = service(request)
    created = svc.create_or_get(
        db,
        collection_id=collection_id,
        audio_bytes=audio_bytes,
        lyrics_text=combined_lyrics,
        title=clean_title,
        artist=clean_artist,
        parental_advisory=parental_advisory,
        creative_controls=cache_controls,
    )
    if created.cache_hit:
        response.status_code = 200
        return generation_response(created.generation, cache_hit=True)

    if hasattr(svc, "set_release_settings"):
        created = type(created)(svc.set_release_settings(db, created.generation.id, release), created.cache_hit)
    if reference and hasattr(svc, "save_reference_input"):
        content, mime_type = reference
        created = type(created)(
            svc.save_reference_input(
                db,
                created.generation.id,
                content=content,
                mime_type=mime_type,
                reference_type=reference_type,
                content_hash=reference_hash or "",
            ),
            created.cache_hit,
        )

    if run_async:
        background_tasks.add_task(
            svc.process_generation, created.generation.id, variation_count, mood_path, controls
        )
        response.status_code = 202
        return generation_response(created.generation)

    await svc.process_generation(created.generation.id, variation_count, mood_path, controls)
    response.status_code = 201
    return generation_response(svc.get(db, created.generation.id))


@router.get("/generations/{generation_id}", response_model=GenerationResponse)
def get_generation(generation_id: str, request: Request, db: Session = Depends(get_db)):
    return generation_response(service(request).get(db, generation_id))


@router.get("/collections/{collection_id}/versions", response_model=HistoryResponse)
def get_history(collection_id: str, request: Request, db: Session = Depends(get_db)):
    versions = service(request).history(db, collection_id)
    return HistoryResponse(
        collection_id=collection_id,
        versions=[generation_response(item, include_audit=False) for item in versions],
    )


@router.get("/collections/{collection_id}/metrics", response_model=CollectionMetricsResponse)
def get_metrics(collection_id: str, db: Session = Depends(get_db)):
    return CollectionMetricsResponse(**collection_metrics(db, collection_id))


@router.post("/generations/{generation_id}/generate", response_model=GenerationResponse)
async def generate_after_choice(
    generation_id: str,
    payload: RegenerateRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
):
    svc = service(request)
    svc.get(db, generation_id)
    if payload.run_async:
        background_tasks.add_task(
            svc.regenerate, generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict()
        )
        response.status_code = 202
    else:
        await svc.regenerate(generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict())
        response.status_code = 200
    return generation_response(svc.get(db, generation_id))


@router.post("/generations/{generation_id}/regenerate", response_model=GenerationResponse)
async def regenerate(
    generation_id: str,
    payload: RegenerateRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
):
    svc = service(request)
    svc.get(db, generation_id)
    if payload.run_async:
        background_tasks.add_task(
            svc.regenerate, generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict()
        )
        response.status_code = 202
    else:
        await svc.regenerate(generation_id, payload.variation_count, payload.mood_path, payload.as_prompt_dict())
        response.status_code = 200
    return generation_response(svc.get(db, generation_id))


@router.post("/generations/{generation_id}/improve", response_model=GenerationResponse)
async def generate_better(
    generation_id: str,
    payload: ImproveRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
):
    svc = service(request)
    svc.get(db, generation_id)
    improve = getattr(svc, "generate_better", None)
    if improve is None:
        raise HTTPException(status_code=409, detail="Generate Better is not enabled.")
    if payload.run_async:
        background_tasks.add_task(
            improve,
            generation_id,
            payload.source_variation_id,
            payload.variation_count,
            payload.mood_path,
            payload.as_prompt_dict(),
        )
        response.status_code = 202
    else:
        await improve(
            generation_id,
            payload.source_variation_id,
            payload.variation_count,
            payload.mood_path,
            payload.as_prompt_dict(),
        )
        response.status_code = 200
    return generation_response(svc.get(db, generation_id))


@router.patch("/generations/{generation_id}/release-text", response_model=GenerationResponse)
def update_release_text(
    generation_id: str,
    payload: ReleaseTextSettings,
    request: Request,
    db: Session = Depends(get_db),
):
    svc = service(request)
    method = getattr(svc, "recompose_release_text", None)
    if method is None:
        raise HTTPException(status_code=409, detail="Release text recomposition is not enabled.")
    return generation_response(method(db, generation_id, payload.model_dump()))


@router.post("/generations/{generation_id}/retry", response_model=GenerationResponse)
async def retry_generation(
    generation_id: str,
    response: Response,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    run_async: bool = True,
):
    svc = service(request)
    svc.get(db, generation_id)
    if run_async:
        background_tasks.add_task(svc.retry_failed, generation_id)
        response.status_code = 202
    else:
        await svc.retry_failed(generation_id)
        response.status_code = 200
    return generation_response(svc.get(db, generation_id))


@router.post("/variations/{variation_id}/select", response_model=GenerationResponse)
def select_variation(variation_id: str, request: Request, db: Session = Depends(get_db)):
    return generation_response(service(request).select_variation(db, variation_id))


@router.get("/variations/{variation_id}/download")
def download_variation(variation_id: str, request: Request, db: Session = Depends(get_db)):
    path, mime_type = service(request).variation_file(db, variation_id)
    return FileResponse(
        path,
        media_type=mime_type,
        filename=f"album-cover-{variation_id}.png",
        content_disposition_type="attachment",
    )

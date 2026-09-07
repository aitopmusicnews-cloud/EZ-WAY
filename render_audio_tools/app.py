from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from render_audio_tools.contract import normalize_job_request, poll_http_status, public_job_response
from render_audio_tools.processor import AudioProcessor
from render_audio_tools.state import AwsStateStore


def _allowed_origins() -> list[str]:
    raw = str(os.getenv("ALLOWED_ORIGINS") or "https://ezwaypro.theartistcut.com")
    return [value.strip() for value in raw.split(",") if value.strip()]


def create_app(
    *,
    state: Any | None = None,
    processor: Any | None = None,
    executor: Any | None = None,
) -> FastAPI:
    service = FastAPI(title="EZ-WAY Render Audio Tools", version="1.0")
    origins = _allowed_origins()
    service.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["content-type"],
    )

    state_holder: dict[str, Any | None] = {"value": state}
    processor_holder: dict[str, Any | None] = {"value": processor}
    worker_executor = executor or ThreadPoolExecutor(
        max_workers=max(1, int(os.getenv("RENDER_AUDIO_WORKERS", "1")))
    )

    def resolve_state() -> Any:
        if state_holder["value"] is None:
            state_holder["value"] = AwsStateStore()
        return state_holder["value"]

    def resolve_processor() -> Any:
        if processor_holder["value"] is None:
            processor_holder["value"] = AudioProcessor(state=resolve_state())
        return processor_holder["value"]

    def execute_job(call_id: str) -> None:
        store = resolve_state()
        item = store.get_job(call_id)
        if not item:
            return
        store.update_job(call_id, {"status": "running", "error": None})
        try:
            result = resolve_processor().process(item)
            store.update_job(call_id, {
                "status": "completed",
                "job_id": str(item.get("job_id") or call_id),
                "action": str(item.get("action") or ""),
                **result,
            })
        except Exception as error:
            store.update_job(call_id, {
                "status": "failed",
                "job_id": str(item.get("job_id") or call_id),
                "action": str(item.get("action") or ""),
                "error": f"{type(error).__name__}: {error}",
            })

    @service.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "provider": "render",
            "tools": ["analysis", "lyrics", "stems"],
            "source_mode": "s3-file-key-first",
        }

    @service.post("/jobs")
    def create_job(payload: dict[str, Any]) -> JSONResponse:
        try:
            request = normalize_job_request(payload)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

        item = resolve_state().create_job(request)
        worker_executor.submit(execute_job, str(item["call_id"]))
        return JSONResponse(status_code=202, content=public_job_response(item))

    @service.get("/jobs/{call_id}")
    def get_job(call_id: str) -> JSONResponse:
        item = resolve_state().get_job(call_id)
        if not item:
            raise HTTPException(status_code=404, detail="Audio Tools job not found.")
        return JSONResponse(
            status_code=poll_http_status(item.get("status")),
            content=public_job_response(item),
        )

    @service.get("/track-analysis/{track_id}")
    def get_track_analysis(track_id: str) -> dict[str, Any]:
        record = resolve_state().get_track_analysis(track_id)
        if not record:
            raise HTTPException(status_code=404, detail="Analysis record not found.")
        return {"record": record}

    return service


app = create_app()

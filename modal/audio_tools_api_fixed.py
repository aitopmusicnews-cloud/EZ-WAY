import os
from pathlib import Path

import modal

import audio_tools_agent_v2 as base

# Reuse the existing v2 app, model/output Volumes, and GPU worker. This file only
# replaces the web API layer that FastAPI previously misread as requiring a
# query parameter named `request`.
app = base.app


@app.function(
    image=base.web_image,
    volumes={base.OUTPUT_ROOT: base.output_volume},
)
@modal.concurrent(max_inputs=30)
@modal.asgi_app(requires_proxy_auth=base.REQUIRE_PROXY_AUTH)
def audio_tools_api_fixed():
    from fastapi import Body, FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse

    web = FastAPI(title="EZ-WAY Audio Tools")
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @web.get("/health")
    async def health():
        return {
            "status": "ok",
            "gpu": base.AUDIO_GPU,
            "tools": ["synced_lyrics", "vocals_instrumental", "full_stems"],
            "api": "fixed-json-body",
        }

    @web.post("/jobs")
    async def create_job(payload: dict = Body(...)):
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="JSON body is required")

        action = str(payload.get("action") or "").strip()
        file_url = str(payload.get("file_url") or "").strip()
        public_base_url = str(payload.get("public_base_url") or "").strip().rstrip("/")

        if action not in {"lyrics", "stems"}:
            raise HTTPException(status_code=400, detail="action must be lyrics or stems")
        if not file_url or file_url.startswith("blob:"):
            raise HTTPException(
                status_code=400,
                detail="A cloud-accessible track file_url is required for Audio Tools",
            )
        if not public_base_url.startswith("https://"):
            raise HTTPException(
                status_code=400,
                detail="Audio Tools public_base_url is required",
            )

        job_id = str(payload.get("job_id") or __import__("uuid").uuid4().hex[:16])
        file_base_url = f"{public_base_url}/files"
        engine = base.AudioToolsEngine()

        if action == "lyrics":
            call = engine.generate_synced_lyrics.spawn(
                payload={**payload, "job_id": job_id},
                file_base_url=file_base_url,
            )
        else:
            mode = str(payload.get("mode") or "vocals_instrumental")
            if mode not in {"vocals_instrumental", "full"}:
                raise HTTPException(status_code=400, detail="Invalid stem mode")
            call = engine.separate_stems.spawn(
                payload={**payload, "job_id": job_id, "mode": mode},
                file_base_url=file_base_url,
            )

        return {
            "status": "accepted",
            "job_id": job_id,
            "call_id": call.object_id,
            "action": action,
            "gpu": base.AUDIO_GPU,
        }

    @web.get("/jobs/{call_id}")
    async def get_job(call_id: str):
        function_call = modal.FunctionCall.from_id(call_id)
        try:
            result = function_call.get(timeout=0)
        except TimeoutError:
            return JSONResponse({"status": "running", "call_id": call_id}, status_code=202)
        except modal.exception.OutputExpiredError:
            return JSONResponse({"error": "Job result expired"}, status_code=404)
        except Exception as error:
            return JSONResponse(
                {"status": "failed", "error": f"{type(error).__name__}: {error}"},
                status_code=500,
            )
        return result

    @web.get("/files/{filename}")
    async def get_file(filename: str):
        safe_name = Path(filename).name
        if safe_name != filename or not safe_name.startswith("audio-"):
            return JSONResponse({"error": "Invalid filename"}, status_code=400)
        if Path(safe_name).suffix.lower() not in {".wav", ".zip", ".lrc", ".txt"}:
            return JSONResponse({"error": "Unsupported file type"}, status_code=400)

        base.output_volume.reload()
        filepath = Path(base.OUTPUT_ROOT) / safe_name
        if not filepath.is_file():
            return JSONResponse({"error": "Audio output not found"}, status_code=404)

        media_types = {
            ".wav": "audio/wav",
            ".zip": "application/zip",
            ".lrc": "text/plain; charset=utf-8",
            ".txt": "text/plain; charset=utf-8",
        }
        return FileResponse(
            filepath,
            media_type=media_types[filepath.suffix.lower()],
            filename=safe_name,
        )

    return web

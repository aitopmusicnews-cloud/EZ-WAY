from __future__ import annotations

from io import BytesIO

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError


_ALLOWED = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


async def read_validated_reference_image(
    upload: UploadFile | None,
    *,
    max_bytes: int = 12 * 1024 * 1024,
) -> tuple[bytes, str] | None:
    if upload is None:
        return None
    content = await upload.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Reference image is too large.")
    return content, validate_reference_image_bytes(content, upload.content_type)


def validate_reference_image_bytes(content: bytes, content_type: str | None = None) -> str:
    if not content:
        raise HTTPException(status_code=422, detail="Reference image is empty.")
    try:
        with Image.open(BytesIO(content)) as image:
            image.load()
            fmt = str(image.format or "").upper()
            mime = _ALLOWED.get(fmt)
            if not mime:
                raise HTTPException(status_code=415, detail="Reference image must be JPEG, PNG, or WebP.")
            if getattr(image, "n_frames", 1) != 1:
                raise HTTPException(status_code=415, detail="Animated reference images are not supported.")
            width, height = image.size
            if width < 256 or height < 256:
                raise HTTPException(status_code=422, detail="Reference image must be at least 256×256 pixels.")
            if width > 8192 or height > 8192:
                raise HTTPException(status_code=422, detail="Reference image dimensions are too large.")
            if content_type and content_type.startswith("image/") and content_type not in {mime, "image/jpg"}:
                # Decode result is authoritative, but a contradictory declared type is suspicious.
                raise HTTPException(status_code=415, detail="Reference image type does not match its file contents.")
            return mime
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=415, detail="Reference file is not a valid JPEG, PNG, or WebP image.") from exc

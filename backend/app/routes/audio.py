from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.audio import resolve

router = APIRouter()


@router.get("/audio/{lang}/{filename}")
def prompt(lang: str, filename: str) -> FileResponse:
    """Serve a prompt in the caller's language, falling back to a language we have recorded."""
    if not filename.endswith(".mp3"):
        raise HTTPException(404)
    path = resolve(lang, filename.removesuffix(".mp3"))
    if path is None:
        raise HTTPException(404)
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=300"})

import asyncio
from contextlib import asynccontextmanager, suppress

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.config import get_settings
from app.db import create_tables, engine
from app.routes import audio, cases, elders, phone, recordings, sim, stream, summary, voice
from app.runs import start_new_run
from app.scheduler import run_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    with Session(engine) as session:
        start_new_run(session)
    task = asyncio.create_task(run_scheduler()) if get_settings().scheduler_enabled else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Neralu", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
for module in (summary, stream, sim, voice, phone, recordings, elders, cases, audio):
    app.include_router(module.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# One command, one port: when the frontend has been built (frontend/dist), FastAPI serves it too.
# Files are served as they are; page paths (no extension) get index.html so deep links like /ward reload.
# API, Twilio and audio routes are registered above and always take priority.
_NOT_SITE = ("api/", "voice/", "audio/", "health")


def _site_dir() -> Path | None:
    configured = get_settings().frontend_dist
    root = Path(configured) if configured else Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return root if (root / "index.html").is_file() else None


@app.get("/{path:path}", include_in_schema=False)
def site(path: str) -> FileResponse:
    root = _site_dir()
    if root is None or path.startswith(_NOT_SITE):
        raise HTTPException(404)
    target = (root / path).resolve()
    if path and target.is_file() and root.resolve() in target.parents:
        return FileResponse(target)
    if Path(path).suffix:  # a missing file (old asset, typo) is a 404, not the home page
        raise HTTPException(404)
    return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})

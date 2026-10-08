import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from app.config import get_settings
from app.db import create_tables, engine
from app.routes import cases, elders, recordings, sim, stream, summary, voice
from app.runs import start_new_run
from app.scheduler import run_scheduler
from app.telephony import AUDIO_DIR


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
for module in (summary, stream, sim, voice, recordings, elders, cases):
    app.include_router(module.router)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR.parent), name="audio")


@app.get("/health")
def health() -> dict:
    return {"ok": True}

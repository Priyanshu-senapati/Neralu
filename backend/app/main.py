from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.db import create_tables, engine
from app.routes import sim, stream, summary
from app.runs import start_new_run


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    with Session(engine) as session:
        start_new_run(session)
    yield


app = FastAPI(title="Neralu", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
for module in (summary, stream, sim):
    app.include_router(module.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}

"""Background loop: runs the escalation tick every second (real time)."""
import asyncio
import logging

from sqlmodel import Session

from app.db import engine
from app.escalation import sync_tick

log = logging.getLogger(__name__)


def _tick_once() -> None:
    with Session(engine) as session:
        sync_tick(session)


async def run_scheduler(interval_s: float = 1.0) -> None:
    while True:
        try:
            await asyncio.to_thread(_tick_once)
        except Exception:
            log.exception("Scheduler tick failed")
        await asyncio.sleep(interval_s)

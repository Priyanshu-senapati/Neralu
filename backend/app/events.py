"""Append-only event log and SSE fan-out. Events are published only after their commit."""
import asyncio
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import event as sa_event
from sqlmodel import Session, select

from app.db import current_run_id
from app.models import EVENT_KINDS, Event
from app.state import state


def scenario_iso(dt) -> str:
    """Scenario datetimes are tz-aware IST; render as ISO with offset."""
    return dt.isoformat(timespec="seconds")


def event_out(ev: Event) -> dict[str, Any]:
    return {
        "id": ev.id, "kind": ev.kind, "ts_scenario": ev.ts_scenario, "actor": ev.actor,
        "message": ev.message, "elder_id": ev.elder_id, "case_id": ev.case_id,
        "checkin_id": ev.checkin_id, "data": ev.data or {}, "simulated": ev.simulated,
    }


class Broadcaster:
    def __init__(self) -> None:
        self._subs: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()

    async def subscribe(self, heartbeat_s: float | None = None) -> AsyncIterator[dict[str, Any] | None]:
        """Yield published events; with heartbeat_s, yield None after that long without one."""
        sub = (asyncio.get_running_loop(), asyncio.Queue(maxsize=1000))
        self._subs.add(sub)
        try:
            while True:
                try:
                    yield await asyncio.wait_for(sub[1].get(), timeout=heartbeat_s)
                except asyncio.TimeoutError:
                    yield None
        finally:
            self._subs.discard(sub)

    def publish(self, payload: dict[str, Any]) -> None:
        for loop, queue in list(self._subs):
            loop.call_soon_threadsafe(_put, queue, payload)


def _put(queue: asyncio.Queue, payload: dict[str, Any]) -> None:
    if not queue.full():
        queue.put_nowait(payload)


broadcaster = Broadcaster()


def log_event(session: Session, kind: str, message: str, *, actor: str, elder_id=None,
              case_id=None, checkin_id=None, data: dict | None = None,
              simulated: bool = False, run_id: str | None = None) -> Event:
    if kind not in EVENT_KINDS:
        raise ValueError(f"Unknown event kind {kind}")
    ev = Event(
        run_id=run_id or current_run_id(), ts_scenario=scenario_iso(state.clock.scenario_now()),
        kind=kind, actor=actor, message=message, elder_id=elder_id, case_id=case_id,
        checkin_id=checkin_id, data=data or {}, simulated=simulated,
    )
    session.add(ev)
    session.flush()
    session.info.setdefault("neralu_pending_events", []).append(event_out(ev))
    return ev


@sa_event.listens_for(Session, "after_commit")
def _publish_after_commit(session) -> None:
    pending = session.info.pop("neralu_pending_events", [])
    for payload in pending:
        broadcaster.publish(payload)


@sa_event.listens_for(Session, "after_rollback")
def _drop_after_rollback(session) -> None:
    session.info.pop("neralu_pending_events", None)


def run_events(session: Session, *, elder_id=None, case_id=None, limit: int | None = None) -> list[Event]:
    """Events for the current run only, oldest first."""
    q = select(Event).where(Event.run_id == current_run_id())
    if elder_id is not None:
        q = q.where(Event.elder_id == elder_id)
    if case_id is not None:
        q = q.where(Event.case_id == case_id)
    q = q.order_by(Event.id)
    rows = list(session.exec(q))
    return rows[-limit:] if limit else rows

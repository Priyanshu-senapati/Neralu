import asyncio
from datetime import datetime, timedelta, timezone

from app.clock import DemoClock
from app.db import set_run_id
from app.events import broadcaster, log_event, run_events
from app.models import Event


def test_real_seconds():
    clock = DemoClock(speed=60, scenario_start=datetime(2026, 10, 9, 10, 55, tzinfo=timezone.utc))
    assert clock.real_seconds(15) == 15.0


def test_clock_runs_at_speed():
    now = [datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)]
    start = datetime(2026, 10, 9, 10, 55, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    clock = DemoClock(speed=60, scenario_start=start, now=lambda: now[0])
    assert clock.scenario_now() == start
    now[0] += timedelta(seconds=15)
    assert clock.scenario_now() == start + timedelta(minutes=15)
    clock.reset()
    assert clock.scenario_now() == start


async def test_log_event_persists_and_publishes_after_commit(session):
    received = []

    async def listen():
        async for payload in broadcaster.subscribe():
            received.append(payload)
            return

    task = asyncio.create_task(listen())
    await asyncio.sleep(0)
    ev = log_event(session, "round_started", "Round 1 started", actor="officer", data={"round_no": 1})
    await asyncio.sleep(0.01)
    assert received == []  # not published before commit
    session.commit()
    await asyncio.wait_for(task, 1)
    assert received[0]["kind"] == "round_started"
    assert received[0]["id"] == ev.id
    assert session.get(Event, ev.id).message == "Round 1 started"


def test_rolled_back_event_is_not_published(session):
    log_event(session, "round_started", "never", actor="officer")
    session.rollback()
    assert "neralu_pending_events" not in session.info


def test_stale_run_events_not_returned(session):
    log_event(session, "run_reset", "old run", actor="officer", run_id="old-run")
    log_event(session, "run_reset", "current run", actor="officer")
    session.commit()
    assert [e.message for e in run_events(session)] == ["current run"]
    set_run_id("old-run")
    assert [e.message for e in run_events(session)] == ["old run"]


def test_unknown_event_kind_rejected(session):
    import pytest
    with pytest.raises(ValueError):
        log_event(session, "called_ambulance", "x", actor="system")

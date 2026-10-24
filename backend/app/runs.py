"""Runs. Demo mode: every start is a fresh scenario. Pilot mode: one run per calendar day, resumed
after a restart, with the people families registered carried over to the next day.

Webhooks and timers belonging to an earlier run are ignored from then on.
"""
import uuid

from sqlmodel import Session, select

from app.db import set_run_id
from app.events import log_event
from app.models import Elder, Event
from app.state import IST, Weather, is_pilot, reset_state, state
from seed.seed import seed_run

# Fields copied when a registered person carries over to the next pilot day.
_ELDER_FIELDS = [name for name in Elder.model_fields if name not in ("id", "run_id")]


def start_new_run(session: Session, *, carry_from: str | None = None) -> str:
    run_id = uuid.uuid4().hex[:12]
    set_run_id(run_id)
    reset_state()
    state.run_day = state.clock.scenario_now().date()
    seed_run(session, run_id)
    carried = _carry_registrations(session, carry_from, run_id) if carry_from else 0
    mode = "pilot" if is_pilot() else "demo"
    label = (f"Pilot day {state.run_day.isoformat()} started · Ward 47 · demo ward"
             + (f" · {carried} registered resident{'s' if carried != 1 else ''} carried over" if carried else "")
             if mode == "pilot" else "New demo run started · Ward 47 · demo ward")
    log_event(session, "run_reset", label, actor="officer",
              data={"run_id": run_id, "mode": mode, "day": state.run_day.isoformat(), "carried": carried})
    session.commit()
    return run_id


def resume_or_start(session: Session) -> str:
    """At server start: demo mode starts fresh; pilot mode resumes today's run if there is one."""
    if not is_pilot():
        return start_new_run(session)
    latest = _latest_pilot_run(session)
    today = state.clock.real_now().astimezone(IST).date()  # the same clock start_new_run dates runs by
    if latest is None or latest.data.get("day") != today.isoformat():
        return start_new_run(session, carry_from=latest.run_id if latest else None)
    set_run_id(latest.run_id)
    reset_state()
    state.run_day = today
    _restore(session, latest.run_id)
    return latest.run_id


def _latest_pilot_run(session: Session) -> Event | None:
    rows = session.exec(select(Event).where(Event.kind == "run_reset").order_by(Event.id.desc())).all()
    return next((e for e in rows if (e.data or {}).get("mode") == "pilot"), None)


def _restore(session: Session, run_id: str) -> None:
    """Bring back today's forecast and the last round from the event log."""
    events = session.exec(select(Event).where(
        Event.run_id == run_id, Event.kind.in_(("sim_weather_set", "round_started"))).order_by(Event.id)).all()
    for ev in events:
        d = ev.data or {}
        if ev.kind == "sim_weather_set" and d.get("source") == "open-meteo":
            state.weather = Weather(d["temp_c"], d["humidity_pct"], d["night_min_c"],
                                    source="open-meteo", observed_at=d.get("observed_at"))
        elif ev.kind == "round_started":
            state.round_no = d.get("round_no")


def _carry_registrations(session: Session, from_run: str, to_run: str) -> int:
    registered = {e.elder_id for e in session.exec(select(Event).where(
        Event.run_id == from_run, Event.kind == "elder_registered")) if e.elder_id}
    carried = 0
    for old in list(session.exec(select(Elder).where(Elder.run_id == from_run, Elder.id.in_(registered)))):
        new = Elder(run_id=to_run, **{f: getattr(old, f) for f in _ELDER_FIELDS})
        session.add(new)
        session.flush()
        # Logged as a registration in the new day too, so they keep carrying over day after day.
        log_event(session, "elder_registered", f"{new.name} carried over from the previous pilot day",
                  actor="system", elder_id=new.id, data={"carried_from": from_run})
        carried += 1
    return carried

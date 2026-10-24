"""Pilot mode: Neralu runs a real day by itself.

Every scheduler tick: start a new day's run after midnight, load today's real forecast (Open-Meteo),
and place the day's call rounds at their set times. Safeguards:
- automatic rounds only on today's real forecast, never on a preset or a guess;
- no automatic round after PILOT_CALLS_UNTIL (no calls to older people late in the evening);
- a late start runs only the latest round whose time has passed, so nobody is called twice minutes apart.
The officer can still start a round by hand from the demo controls.
"""
import logging
import time
from datetime import datetime, time as dtime

from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id
from app.events import log_event
from app.models import Event
from app.state import is_pilot, state

log = logging.getLogger(__name__)

FORECAST_RETRY_S = 15 * 60
_last_forecast_try: float | None = None


def _hhmm(text: str) -> dtime:
    h, m = text.strip().split(":")
    return dtime(int(h), int(m))


def round_times() -> list[tuple[int, dtime]]:
    return [(i, _hhmm(t)) for i, t in enumerate(get_settings().pilot_round_times.split(","), start=1)]


def calls_until() -> dtime:
    return _hhmm(get_settings().pilot_calls_until)


def has_todays_forecast() -> bool:
    w = state.weather
    today = state.clock.scenario_now().date().isoformat()
    return w.source == "open-meteo" and bool(w.observed_at) and w.observed_at.startswith(today)


def started_rounds(session: Session) -> set[int]:
    rows = session.exec(select(Event).where(Event.run_id == current_run_id(), Event.kind == "round_started"))
    return {int(e.data.get("round_no", 0)) for e in rows if e.data}


def due_round(now: datetime, started: set[int]) -> int | None:
    """The round to start now, if any: the latest whose time has passed, unless it (or a later one) ran."""
    if now.time() >= calls_until():
        return None
    passed = [n for n, at in round_times() if now.time() >= at]
    if not passed:
        return None
    latest = max(passed)
    if any(n >= latest for n in started):
        return None
    return latest


def next_round(now: datetime, started: set[int]) -> dtime | None:
    """When the next automatic round will start today, if one still will."""
    upcoming = [(n, at) for n, at in round_times()
                if at > now.time() and at < calls_until() and not any(s >= n for s in started)]
    return upcoming[0][1] if upcoming else None


def refresh_forecast(session: Session) -> bool:
    """Load today's real forecast, at most once per FORECAST_RETRY_S while it keeps failing."""
    global _last_forecast_try
    from app.weather import ForecastUnavailable, bengaluru_today, clear_cache

    now = time.monotonic()
    if _last_forecast_try is not None and now - _last_forecast_try < FORECAST_RETRY_S:
        return False
    _last_forecast_try = now
    clear_cache()  # yesterday's cached forecast must never stand in for today's
    try:
        weather = bengaluru_today()
    except ForecastUnavailable as exc:
        log.warning("Pilot: today's forecast unavailable, no automatic rounds until it loads: %s", exc)
        return False
    state.weather = weather
    w = weather.as_dict()
    log_event(session, "sim_weather_set",
              f"Today's forecast loaded (Open-Meteo, Bengaluru, {w['observed_at'][-5:]}): {w['temp_c']:g} °C, "
              f"{w['humidity_pct']:g} % humidity, heat index {w['heat_index_c']:g} °C, night min {w['night_min_c']:g} °C",
              actor="system", data=w, simulated=False)
    return True


def pilot_tick(session: Session) -> None:
    if not is_pilot():
        return
    from app.calls import start_round
    from app.runs import start_new_run

    now = state.clock.scenario_now()
    if state.run_day is not None and now.date() != state.run_day:
        start_new_run(session, carry_from=current_run_id())  # a new day begins
        now = state.clock.scenario_now()
    if not has_todays_forecast() and not refresh_forecast(session):
        return  # no automatic calls on a guessed forecast
    n = due_round(now, started_rounds(session))
    if n is not None:
        start_round(session, n, auto=True)


def reset_for_tests() -> None:
    global _last_forecast_try
    _last_forecast_try = None

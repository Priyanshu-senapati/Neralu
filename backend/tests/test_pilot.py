from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import select

from app import pilot, runs, state as state_mod, weather
from app.clock import DemoClock
from app.config import get_settings
from app.db import current_run_id
from app.events import log_event
from app.models import Elder, Event
from app.state import IST, Weather, state

DAY = datetime(2026, 10, 24, tzinfo=IST)


class FakeTime:
    def __init__(self, ist: datetime):
        self.now = ist.astimezone(timezone.utc)

    def set(self, hh: int, mm: int = 0, day: int = 0):
        self.now = (DAY + timedelta(days=day, hours=hh, minutes=mm)).astimezone(timezone.utc)

    def __call__(self):
        return self.now


@pytest.fixture
def fake(session, monkeypatch):
    """Pilot mode on a controllable clock, with today's forecast available unless a test says otherwise."""
    t = FakeTime(DAY + timedelta(hours=10))
    original_clock = state.clock
    monkeypatch.setattr(get_settings(), "run_mode", "pilot")
    monkeypatch.setattr(state_mod, "_new_clock", lambda: DemoClock(1, t().astimezone(IST), now=t))
    t.forecast_ok = True

    def forecast():
        if not t.forecast_ok:
            raise weather.ForecastUnavailable("offline")
        day = t().astimezone(IST).date().isoformat()
        return Weather(38.0, 40.0, 27.0, source="open-meteo", observed_at=f"{day}T14:00")

    monkeypatch.setattr(weather, "bengaluru_today", forecast)
    pilot.reset_for_tests()
    runs.start_new_run(session)
    yield t
    state.clock = original_clock  # later tests must not inherit the frozen fake clock
    pilot.reset_for_tests()


def rounds(session) -> list[Event]:
    return list(session.exec(select(Event).where(Event.run_id == current_run_id(),
                                                 Event.kind == "round_started").order_by(Event.id)))


def tick(session):
    pilot.pilot_tick(session)
    session.commit()


def test_no_round_before_11_but_forecast_loads(session, fake):
    fake.set(10, 59)
    tick(session)
    assert rounds(session) == []
    assert state.weather.source == "open-meteo" and pilot.has_todays_forecast()


def test_round_one_at_11_exactly_once(session, fake):
    fake.set(11, 0)
    tick(session)
    tick(session)
    fake.set(11, 30)
    tick(session)
    r = rounds(session)
    assert [e.data["round_no"] for e in r] == [1]
    assert r[0].data["auto"] is True and r[0].actor == "system"
    assert "automatically" in r[0].message


def test_round_two_at_15(session, fake):
    fake.set(11, 0)
    tick(session)
    fake.set(14, 59)
    tick(session)
    fake.set(15, 0)
    tick(session)
    assert [e.data["round_no"] for e in rounds(session)] == [1, 2]


def test_no_automatic_round_after_18(session, fake):
    fake.set(18, 30)
    tick(session)
    assert rounds(session) == []
    assert pilot.next_round(state.clock.scenario_now(), set()) is None


def test_late_start_runs_only_the_latest_round(session, fake):
    fake.set(16, 0)
    tick(session)
    tick(session)
    assert [e.data["round_no"] for e in rounds(session)] == [2]  # nobody gets two calls minutes apart


def test_no_automatic_calls_without_todays_forecast(session, fake, monkeypatch):
    fake.forecast_ok = False
    fake.set(11, 0)
    tick(session)
    assert rounds(session) == [] and not pilot.has_todays_forecast()
    fake.forecast_ok = True
    tick(session)  # retry is throttled to every 15 minutes
    assert rounds(session) == []
    monkeypatch.setattr(pilot, "_last_forecast_try", None)  # 15 minutes later
    tick(session)
    assert [e.data["round_no"] for e in rounds(session)] == [1]


def test_restart_resumes_the_day_without_calling_again(session, fake):
    fake.set(11, 0)
    tick(session)
    run_before = current_run_id()
    fake.set(11, 20)
    state.weather = Weather(31.0, 45.0, 23.0)  # what a fresh process would hold before restoring
    runs.resume_or_start(session)
    assert current_run_id() == run_before
    assert state.round_no == 1 and pilot.has_todays_forecast()
    tick(session)
    assert [e.data["round_no"] for e in rounds(session)] == [1]


def test_new_day_starts_a_new_run_and_carries_registrations(session, fake):
    old_run = current_run_id()
    e = Elder(run_id=old_run, name="Test Carryover Person", age=81, phone="+919845012345", is_simulated=False,
              address="#7", family_name="Latha", family_phone="+919845000000")
    session.add(e)
    session.flush()
    log_event(session, "elder_registered", "registered", actor="family", elder_id=e.id)
    session.commit()

    fake.set(0, 5, day=1)
    tick(session)
    assert current_run_id() != old_run
    assert state.run_day.isoformat() == "2026-10-25"
    carried = session.exec(select(Elder).where(Elder.run_id == current_run_id(),
                                               Elder.name == "Test Carryover Person")).one()
    assert carried.phone == "+919845012345" and not carried.is_simulated
    reset = session.exec(select(Event).where(Event.run_id == current_run_id(),
                                             Event.kind == "run_reset")).one()
    assert reset.data["carried"] == 1 and reset.data["mode"] == "pilot"
    # carried again the day after
    fake.set(0, 5, day=2)
    tick(session)
    assert session.exec(select(Elder).where(Elder.run_id == current_run_id(),
                                            Elder.name == "Test Carryover Person")).one()


def test_reset_in_pilot_mode_keeps_registered_people(session, fake):
    from app.routes import sim

    e = Elder(run_id=current_run_id(), name="Test Reset Person", age=78, phone="+919845012345",
              is_simulated=False, address="#9", family_name="Latha", family_phone="+919845000000")
    session.add(e)
    session.flush()
    log_event(session, "elder_registered", "registered", actor="family", elder_id=e.id)
    session.commit()
    old_run = current_run_id()
    sim.reset(session=session)  # the demo control, pressed in pilot mode
    assert current_run_id() != old_run
    assert session.exec(select(Elder).where(Elder.run_id == current_run_id(),
                                            Elder.name == "Test Reset Person")).one()


def test_demo_mode_is_untouched(session, monkeypatch):
    monkeypatch.setattr(get_settings(), "run_mode", "demo")
    runs.start_new_run(session)
    pilot.pilot_tick(session)
    session.commit()
    assert rounds(session) == []


def test_summary_shows_the_pilot_schedule(session, fake):
    from app.status import _pilot
    from app.views import summary

    fake.set(10, 30)
    tick(session)
    d = summary(session)
    assert d["run_mode"] == "pilot" and d["demo_speed"] == 1
    assert d["pilot"]["next_round"] == "11:00" and d["pilot"]["forecast_loaded"]
    check = _pilot()
    assert check.ok and "11:00" in check.detail

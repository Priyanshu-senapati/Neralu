""""What day is it today?" is checked against the person's real date in India, never the demo
clock's date (which runs ×60 and crosses midnight within minutes). The demo starts on today's date."""
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session

from app import state as state_mod
from app.db import engine
from app.models import CheckIn
from app.routes import phone, voice
from app.state import IST, person_today, state
from tests.test_browser_phone import kamala_checkin, phone as phone_client, run_call  # noqa: F401
from tests.test_voice_flow import keypad_call, keypad_mode  # noqa: F401


def test_person_today_is_the_real_date_in_india(monkeypatch):
    # 20:00 UTC on Saturday 24 Oct is already 01:30 on Sunday 25 Oct in India.
    monkeypatch.setattr(state.clock, "_now", lambda: datetime(2026, 10, 24, 20, 0, tzinfo=timezone.utc))
    assert person_today() == date(2026, 10, 25)


def test_demo_starts_on_todays_date():
    start = state_mod._demo_start()
    assert start.date() == datetime.now(IST).date()
    assert (start.hour, start.minute) == (10, 55)


def _use_real_date(monkeypatch):
    monkeypatch.setattr(voice, "person_today", person_today)
    monkeypatch.setattr(phone, "person_today", person_today)


def test_pressing_the_real_day_is_correct_even_when_the_demo_clock_says_otherwise(phone_client, monkeypatch):
    _use_real_date(monkeypatch)
    monkeypatch.setattr(state.clock, "scenario_start", state.clock.scenario_start + timedelta(days=3))
    real = person_today().weekday() + 1  # 1 = Monday … 7 = Sunday
    assert state.clock.scenario_now().weekday() + 1 != real  # the demo clock shows another day
    run_call(phone_client, day=real)
    with Session(engine) as s:
        c = kamala_checkin(s)
        assert c.answers["orientation"] == "correct" and c.outcome == "GREEN"


def test_pressing_the_demo_clocks_day_is_wrong(phone_client, monkeypatch):
    _use_real_date(monkeypatch)
    monkeypatch.setattr(state.clock, "scenario_start", state.clock.scenario_start + timedelta(days=3))
    cid, _ = run_call(phone_client, day=state.clock.scenario_now().weekday() + 1)
    with Session(engine) as s:
        c = s.get(CheckIn, cid)  # the call itself, not the follow-up call it books
        assert c.answers["orientation"] == "wrong" and c.rule_id == "R5"


def test_twilio_keypad_day_uses_the_real_date(client, keypad_mode, monkeypatch):
    _use_real_date(monkeypatch)
    c = keypad_call(client, day=str(person_today().weekday() + 1))
    assert c.answers["orientation"] == "correct"

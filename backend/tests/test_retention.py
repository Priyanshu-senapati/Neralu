"""Call recordings are deleted after the retention limit; the spoken day is kept only as a word."""
import os
import time
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app import privacy
from app.db import current_run_id, engine
from app.models import CheckIn, Elder, Event
from app.orientation import day_word
from app.routes.phone import RECORDINGS_DIR


def make_checkin(s: Session, age_days: float, name: str) -> CheckIn:
    e = s.exec(select(Elder).where(Elder.run_id == current_run_id())).first()
    when = datetime.now(timezone.utc) - timedelta(days=age_days)
    RECORDINGS_DIR.mkdir(exist_ok=True)
    (RECORDINGS_DIR / name).write_bytes(b"audio")
    c = CheckIn(run_id=current_run_id(), elder_id=e.id, round_no=1, processed=True, outcome="GREEN",
                classified_real=when, scheduled_for_real=when, recording_url=f"local:{name}")
    s.add(c)
    s.commit()
    return c


def test_old_recordings_are_deleted_and_recent_ones_kept(client):
    with Session(engine, expire_on_commit=False) as s:
        old = make_checkin(s, 8, "test-old.webm")
        new = make_checkin(s, 2, "test-new.webm")
        assert privacy.sweep_recordings(s) == 1
        s.commit()
        s.expire_all()
        assert s.get(CheckIn, old.id).recording_url is None and not (RECORDINGS_DIR / "test-old.webm").exists()
        assert s.get(CheckIn, new.id).recording_url == "local:test-new.webm"
        ev = s.exec(select(Event).where(Event.kind == "recordings_deleted")).one()
        assert "older than 7 days" in ev.message and ev.data["checkins"] == 1
    (RECORDINGS_DIR / "test-new.webm").unlink(missing_ok=True)


def test_stray_files_past_the_limit_are_deleted_too(client):
    RECORDINGS_DIR.mkdir(exist_ok=True)
    stray = RECORDINGS_DIR / "test-stray.webm"
    stray.write_bytes(b"audio")
    ten_days = time.time() - 10 * 86400
    os.utime(stray, (ten_days, ten_days))
    with Session(engine) as s:
        assert privacy.sweep_recordings(s) == 1
        s.commit()
    assert not stray.exists()


def test_sweep_runs_at_most_hourly(client, monkeypatch):
    calls = []
    monkeypatch.setattr(privacy, "sweep_recordings", lambda s: calls.append(1) or 0)
    monkeypatch.setattr(privacy, "_last_sweep", None)
    with Session(engine) as s:
        privacy.retention_tick(s)
        privacy.retention_tick(s)
    assert calls == [1]


def test_only_the_day_word_is_kept():
    assert day_word("ಇವತ್ತು ಗುರುವಾರ, ನಾನು ಮನೆಯಲ್ಲಿದ್ದೇನೆ") == "Thursday"
    assert day_word("I am at my daughter's house, it is Monday") == "Monday"
    assert day_word("I don't know") is None and day_word(None) is None

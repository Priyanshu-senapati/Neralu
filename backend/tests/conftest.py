import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="neralu-test-")
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_tmp}/test.db",
    "VALIDATE_TWILIO_SIGNATURE": "false",
    "PUBLIC_BASE_URL": "https://neralu.test",
    "KAMALA_PHONE": "+919900000001",
    "TWILIO_ACCOUNT_SID": "ACtest",
    "TWILIO_AUTH_TOKEN": "test-token",
    "TWILIO_FROM_NUMBER": "+15550000000",
    "STT_TIMEOUT_S": "0.3",
    "SCHEDULER_ENABLED": "false",
    "ORIENTATION_MODE": "voice",
    "MAX_ATTEMPTS": "2",
    # Pin everything a local backend/.env might change, so tests behave the same on every machine.
    "TELEPHONY_MODE": "twilio",
    "DEMO_SPEED": "60",
    "RING_TIMEOUT_S": "15",
    "RETRY_GAP_MIN": "15",
    "ACK_TIMEOUT_MIN": "15",
    "VISIT_TIMEOUT_MIN": "120",
    "LANGUAGE_MENU": "false",
    "RUN_MODE": "demo",
    "AMBER_RECALL_MIN": "30",
    "AFTERCARE_MIN": "60",
    "VOLUNTEER_DEMO_TOKEN": "priya-test-link-0123456789",
    "STT_PROVIDER": "sarvam",
    "SARVAM_API_KEY": "",
    "FRONTEND_DIST": "/nonexistent-neralu-dist",
    "FAMILY_SMS": "simulated",
    "RECORDINGS_DIR": f"{_tmp}/recordings",  # never the real recordings folder
    "DEMO_DATE": "",
    "OFFICER_PASSCODE": "test-officer-passcode",
})

OFFICER_PASSCODE = os.environ["OFFICER_PASSCODE"]
PRIYA_TOKEN = os.environ["VOLUNTEER_DEMO_TOKEN"]

import pytest  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from app import officer  # noqa: E402
from app.db import engine, set_run_id  # noqa: E402
from app.state import reset_state  # noqa: E402


@pytest.fixture(autouse=True)
def no_real_twilio(monkeypatch):
    """No test may reach the real Twilio API."""
    from app import calls
    cancelled = []
    monkeypatch.setattr(calls, "cancel_call", lambda sid: cancelled.append(sid) or True)
    return cancelled


@pytest.fixture(autouse=True)
def person_today_is_friday(monkeypatch):
    """The call tests answer "Friday". The person's real date (app.state.person_today) is pinned to
    Friday 9 Oct 2026 here; tests/test_today.py checks the real-date behaviour itself."""
    from datetime import date

    from app.routes import phone, voice
    monkeypatch.setattr(voice, "person_today", lambda: date(2026, 10, 9))
    monkeypatch.setattr(phone, "person_today", lambda: date(2026, 10, 9))


@pytest.fixture
def session():
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    set_run_id("run-test")
    reset_state()
    with Session(engine) as s:
        yield s


@pytest.fixture
def client(monkeypatch):
    """App client with a fresh seeded run; outbound Twilio calls are faked."""
    from fastapi.testclient import TestClient

    from app import calls
    from app.main import app

    placed = []

    def fake_place_call(to, checkin_id):
        placed.append((to, checkin_id))
        return f"CA{checkin_id:032d}"

    monkeypatch.setattr(calls, "place_call", fake_place_call)
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    officer.reset_for_tests()
    with TestClient(app) as c:
        c.placed = placed
        # Signed in as the ward officer, as the console is; tests/test_officer.py checks the locks.
        assert c.post("/api/officer/login", json={"passcode": OFFICER_PASSCODE}).status_code == 200
        yield c


def token_of(name: str) -> str:
    """A seeded volunteer's private link token in the current run (they are random)."""
    from sqlmodel import select

    from app.db import current_run_id
    from app.models import Volunteer
    with Session(engine) as s:
        return s.exec(select(Volunteer).where(Volunteer.run_id == current_run_id(), Volunteer.name == name)).one().token

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
    "AMBER_RECALL_MIN": "30",
    "VOLUNTEER_DEMO_TOKEN": "priya-demo",
    "STT_PROVIDER": "sarvam",
    "SARVAM_API_KEY": "",
})

import pytest  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from app.db import engine, set_run_id  # noqa: E402
from app.state import reset_state  # noqa: E402


@pytest.fixture(autouse=True)
def no_real_twilio(monkeypatch):
    """No test may reach the real Twilio API."""
    from app import calls
    cancelled = []
    monkeypatch.setattr(calls, "cancel_call", lambda sid: cancelled.append(sid) or True)
    return cancelled


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
    with TestClient(app) as c:
        c.placed = placed
        yield c

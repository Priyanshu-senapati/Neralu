import time

import httpx
import pytest

from app import status
from app.config import get_settings


@pytest.fixture(autouse=True)
def fresh_status(monkeypatch):
    monkeypatch.setattr(status, "_cache", None)
    monkeypatch.setattr(status, "_last_tick", time.monotonic())


def by_key(result):
    return {c["key"]: c for c in result["checks"]}


def fake_client(monkeypatch, handler):
    """Route every httpx.Client request in status.py through `handler(request) -> httpx.Response`."""
    real = httpx.Client
    monkeypatch.setattr(status.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_browser_mode_needs_no_telecom(monkeypatch):
    monkeypatch.setattr(get_settings(), "telephony_mode", "browser")
    checks = by_key(status.system_status(fresh=True))
    assert checks["phone"]["ok"] and "browser phone" in checks["phone"]["detail"]
    assert "twilio" not in checks and "public" not in checks
    assert checks["audio"]["ok"]


def test_stale_scheduler_is_red(monkeypatch):
    monkeypatch.setattr(get_settings(), "telephony_mode", "browser")
    monkeypatch.setattr(status, "_last_tick", time.monotonic() - 60)
    result = status.system_status(fresh=True)
    assert not by_key(result)["scheduler"]["ok"] and not result["ok"]


def test_missing_twilio_credentials_are_red(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "twilio_account_sid", "")
    fake_client(monkeypatch, lambda req: httpx.Response(200, json={"ok": True}))
    checks = by_key(status.system_status(fresh=True))
    assert not checks["twilio"]["ok"] and "missing" in checks["twilio"]["detail"]


def test_public_link_down_is_red_with_a_hint(monkeypatch):
    def handler(req):
        if req.url.path == "/health":
            return httpx.Response(404, text="<html>ngrok endpoint offline</html>")
        if req.url.path.endswith("/Calls.json"):
            return httpx.Response(200, json={"calls": []})
        return httpx.Response(200, json={"status": "active", "type": "Trial"})
    fake_client(monkeypatch, handler)
    checks = by_key(status.system_status(fresh=True))
    assert not checks["public"]["ok"] and "start ngrok" in checks["public"]["detail"]
    assert checks["twilio"]["ok"] and checks["twilio"]["warn"]  # trial works, with a caveat
    assert checks["lastcall"]["warn"]


def test_everything_green_with_a_recent_completed_call(monkeypatch):
    def handler(req):
        if req.url.path == "/health":
            return httpx.Response(200, json={"ok": True})
        if req.url.path.endswith("/Calls.json"):
            return httpx.Response(200, json={"calls": [
                {"status": "completed", "start_time": "Sat, 24 Oct 2026 05:00:00 +0000"}]})
        return httpx.Response(200, json={"status": "active", "type": "Full"})
    fake_client(monkeypatch, handler)
    monkeypatch.setattr(get_settings(), "sarvam_api_key", "test-key")
    result = status.system_status(fresh=True)
    assert result["ok"], result
    assert by_key(result)["lastcall"]["detail"].startswith("completed")


def test_results_are_cached_until_fresh(monkeypatch):
    calls = []

    def handler(req):
        calls.append(req.url.path)
        return httpx.Response(200, json={"ok": True, "status": "active", "type": "Full", "calls": []})
    fake_client(monkeypatch, handler)
    status.system_status()
    n = len(calls)
    status.system_status()
    assert len(calls) == n
    status.system_status(fresh=True)
    assert len(calls) > n


def test_status_endpoint(client):
    r = client.get("/api/status")
    assert r.status_code == 200 and {"ok", "checks", "telephony_mode"} <= r.json().keys()

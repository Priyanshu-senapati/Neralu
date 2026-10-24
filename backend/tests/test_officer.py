"""Who can read what. The console's API (names, addresses, recordings, demo controls) needs the
officer's sign-in; the public pages (story, register, family, the volunteer's and Kamala's phones)
work without it and never get anything that identifies a real person."""
import time

import pytest
from fastapi import HTTPException

from app import officer
from app.routes.stream import shown
from seed import seed
from tests.conftest import OFFICER_PASSCODE, PRIYA_TOKEN, token_of
from tests.test_api import REGISTRATION, red_case_for_kamala

CONSOLE_ONLY = [
    ("get", "/api/elders"), ("get", "/api/elders/1"), ("get", "/api/cases"), ("get", "/api/cases/1"),
    ("get", "/api/cases/1/record"), ("get", "/api/responders"), ("get", "/api/summary"),
    ("get", "/api/impact"), ("get", "/api/events"), ("get", "/api/rounds"), ("get", "/api/status"),
    ("get", "/api/whatif?temp_c=38&humidity_pct=40&night_min_c=27"), ("get", "/api/recordings/1"),
    ("get", "/api/officer/volunteer-links"), ("post", "/api/sim/reset"), ("post", "/api/sim/heat"),
    ("post", "/api/sim/heat/live"), ("post", "/api/sim/round"), ("post", "/api/sim/family-link"),
]


@pytest.fixture
def anon(client):
    client.post("/api/officer/logout")
    client.cookies.clear()
    return client


@pytest.mark.parametrize("method,path", CONSOLE_ONLY)
def test_console_routes_need_the_officer(anon, method, path):
    r = getattr(anon, method)(path)
    assert r.status_code == 401 and r.json()["detail"] == officer.SIGN_IN_NEEDED


def test_sign_in_sets_a_private_cookie_and_sign_out_ends_it(anon):
    assert anon.get("/api/officer/session").json() == {"signed_in": False}
    r = anon.post("/api/officer/login", json={"passcode": OFFICER_PASSCODE})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert OFFICER_PASSCODE.lower() not in cookie  # the cookie never holds the passcode
    assert anon.get("/api/officer/session").json() == {"signed_in": True}
    assert anon.get("/api/elders").status_code == 200
    anon.post("/api/officer/logout")
    assert anon.get("/api/elders").status_code == 401


def test_wrong_passcodes_lock_the_client_out(anon):
    for _ in range(officer.MAX_FAILURES):
        assert anon.post("/api/officer/login", json={"passcode": "guess"}).status_code == 401
    r = anon.post("/api/officer/login", json={"passcode": OFFICER_PASSCODE})
    assert r.status_code == 429 and "Retry-After" in r.headers  # even the right one, until the wait ends


def _request(peer: str, forwarded: str | None = None):
    from starlette.requests import Request
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request({"type": "http", "client": (peer, 5000), "headers": headers})


def test_lockout_is_per_client_behind_the_tunnel():
    # ngrok reaches the server from 127.0.0.1 and appends the caller's address last.
    tunnel = lambda caller: _request("127.0.0.1", f"1.1.1.1, {caller}")  # noqa: E731 (first entry forged)
    assert officer._client(tunnel("203.0.113.9")) == "203.0.113.9"
    assert officer._client(_request("192.168.1.20", "203.0.113.9")) == "192.168.1.20"  # not via the tunnel
    for _ in range(officer.MAX_FAILURES):
        with pytest.raises(HTTPException) as e:
            officer.check_passcode(tunnel("203.0.113.9"), "guess")
        assert e.value.status_code == 401
    with pytest.raises(HTTPException) as e:
        officer.check_passcode(tunnel("203.0.113.9"), OFFICER_PASSCODE)
    assert e.value.status_code == 429
    officer.check_passcode(tunnel("198.51.100.4"), OFFICER_PASSCODE)  # someone else is not locked out


def test_forged_or_expired_sessions_are_refused():
    good = officer.session_value()
    assert officer.valid_session(good)
    version, expires, sig = good.split(".")
    assert not officer.valid_session(f"{version}.{int(expires) + 999999}.{sig}")  # stretched expiry
    assert not officer.valid_session(f"{version}.{expires}.{'0' * len(sig)}")
    assert not officer.valid_session(officer.session_value(now=time.time() - officer.SESSION_S - 1))
    assert not officer.valid_session("") and not officer.valid_session(None) and not officer.valid_session("a.b")


def test_changing_the_passcode_signs_everyone_out(monkeypatch):
    from app.config import get_settings
    old = officer.session_value()
    monkeypatch.setattr(get_settings(), "officer_passcode", "a-new-passcode")
    assert not officer.valid_session(old)


def test_scripts_sign_in_with_the_passcode_header(anon):
    assert anon.get("/api/status", headers={"X-Officer-Passcode": OFFICER_PASSCODE}).status_code == 200
    assert anon.get("/api/status", headers={"X-Officer-Passcode": "guess"}).status_code == 401


def test_without_a_configured_passcode_a_random_one_is_made(monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "officer_passcode", "")
    code = officer.passcode()
    assert len(code) >= 12 and officer.passcode() == code  # the same for the whole server run


def test_public_pages_work_without_sign_in(anon):
    assert anon.get("/api/clock").json().keys() == {"scenario_now", "demo_speed"}
    assert anon.get("/api/rules").status_code == 200
    assert anon.get("/api/households").status_code == 200
    assert anon.post("/api/elders", json=REGISTRATION).status_code == 201
    me = anon.get("/api/volunteer/me", headers={"X-Volunteer-Token": PRIYA_TOKEN})
    assert me.status_code == 200 and me.json()["volunteer"]["name"] == "Priya"


def test_the_story_page_never_gets_a_registered_persons_details(anon):
    anon.post("/api/elders", json={**REGISTRATION, "name": "Zuhra Qadri", "family_name": "Imtiaz (son)"})
    homes = anon.get("/api/households").json()
    assert set(homes[0]) == {"id", "name", "age", "risk_score", "risk_factors", "is_simulated", "source", "lat", "lng"}
    gowramma = next(h for h in homes if h["source"] == "family")
    assert gowramma["name"] is None and gowramma["age"] is None and gowramma["risk_factors"] == []
    assert gowramma["lat"] == round(gowramma["lat"], 2) and gowramma["lng"] == round(gowramma["lng"], 2)
    assert "Zuhra" not in str(homes) and "Imtiaz" not in str(homes) and "3 Cross, 5 Main" not in str(homes)
    kamala = next(h for h in homes if h["source"] == "demo")
    assert kamala["name"] == "Kamala R."  # the demo persona is fictional and stays named


def test_live_updates_carry_only_the_kind_without_sign_in():
    event = {"kind": "case_opened", "label": "RED case for Kamala R.", "elder_id": 1}
    assert shown(event, officer=False) == {"kind": "case_opened"}
    assert shown(event, officer=True) == event


def test_volunteer_links_cannot_be_guessed(client):
    ravi, mangala = token_of("Ravi K."), token_of("Mangala (ASHA)")
    assert len(ravi) >= 16 and len(mangala) >= 16 and ravi != mangala
    assert client.get("/api/volunteer/me", params={"token": "sim-vol-1"}).status_code == 401
    assert client.get("/api/volunteer/me", headers={"X-Volunteer-Token": ""}).status_code == 401
    old_run = ravi
    client.post("/api/sim/reset")
    assert token_of("Ravi K.") != old_run  # simulated responders get new links every run
    assert token_of("Priya") == PRIYA_TOKEN  # Priya's stays, so her phone keeps working across resets


def test_a_short_demo_token_is_replaced_by_a_random_one(monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "volunteer_demo_token", "priya-demo")
    token = seed.demo_volunteer_token()
    assert token != "priya-demo" and len(token) >= 16 and seed.demo_volunteer_token() == token
    monkeypatch.setattr(get_settings(), "volunteer_demo_token", "")
    assert seed.demo_volunteer_token() == token


def test_the_officer_gets_priyas_link_with_the_token_after_the_hash(client):
    links = client.get("/api/officer/volunteer-links").json()
    assert [link["name"] for link in links] == ["Priya"]
    assert links[0]["url"] == f"https://neralu.test/volunteer#{PRIYA_TOKEN}"


def test_an_accepted_address_is_not_readable_without_sign_in(anon):
    cid = red_case_for_kamala()
    anon.post(f"/api/cases/{cid}/accept", json={"volunteer_token": PRIYA_TOKEN})
    assert anon.get(f"/api/cases/{cid}").status_code == 401
    assert anon.get(f"/api/cases/{cid}/record").status_code == 401

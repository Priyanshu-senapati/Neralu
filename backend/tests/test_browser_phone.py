"""Browser phone fallback: same answers, same rules, same escalation as a Twilio call."""
from datetime import timedelta

import pytest
from sqlmodel import Session, select

from app import browser_phone, calls
from app.calls import dispatch_due_calls
from app.db import engine
from app.escalation import sync_tick
from app.models import Case, CheckIn, Elder, Event
from tests.test_voice_flow import HEATWAVE, stt  # noqa: F401  (fixture)


@pytest.fixture
def phone(client, monkeypatch):
    """Client whose real-phone calls ring the browser phone instead of Twilio."""
    browser_phone.calls.clear()
    monkeypatch.setattr(calls, "place_call", lambda to, cid: browser_phone.ring(cid))
    client.post("/api/sim/heat", json=HEATWAVE)
    client.post("/api/sim/round", json={"round_no": 1})
    with Session(engine) as s:
        dispatch_due_calls(s)
        s.commit()
    return client


def kamala_checkin(s: Session) -> CheckIn:
    kamala = s.exec(select(Elder).where(Elder.is_simulated == False)).one()  # noqa: E712
    return s.exec(select(CheckIn).where(CheckIn.elder_id == kamala.id).order_by(CheckIn.id)).all()[-1]


def run_call(client, water="1", symptoms="2", room="2", fan="1", day=5, help_="1"):
    call = client.get("/api/phone/current").json()["call"]
    assert call["status"] == "ringing" and call["elder_name"] == "Kamala R."
    cid = call["checkin_id"]
    script = client.post(f"/api/phone/calls/{cid}/answer").json()
    assert script["code_word"] == "Mallige" and [s["step"] for s in script["steps"]] == \
        ["water", "symptoms", "room", "fan"]
    for step, digit in [("water", water), ("symptoms", symptoms), ("room", room), ("fan", fan)]:
        assert client.post(f"/api/phone/calls/{cid}/key", json={"step": step, "digit": digit}).status_code == 200
    if day is not None:
        assert client.post(f"/api/phone/calls/{cid}/orientation", data={"day": day}).status_code == 200
    closing = client.post(f"/api/phone/calls/{cid}/key", json={"step": "help", "digit": help_}).json()
    assert client.post(f"/api/phone/calls/{cid}/hangup").status_code == 200
    return cid, closing


def test_all_fine_on_the_browser_phone_is_green(phone):
    cid, closing = run_call(phone)  # scenario day is Friday: day 5
    assert closing["closing"] == ["/audio/kn/close_ok.mp3"]
    with Session(engine) as s:
        c = s.get(CheckIn, cid)
        assert (c.outcome, c.rule_id) == ("GREEN", "R9")
        assert s.exec(select(Event).where(Event.kind == "call_answered",
                                          Event.checkin_id == cid)).one().data["transport"] == "browser"
    assert phone.get("/api/phone/current").json()["call"] is None


def test_dizzy_and_no_water_opens_a_red_case(phone):
    cid, closing = run_call(phone, water="2", symptoms="1")
    assert closing["closing"] == ["/audio/kn/advice.mp3", "/audio/kn/close_ok.mp3"]
    with Session(engine) as s:
        assert (s.get(CheckIn, cid).outcome, s.get(CheckIn, cid).rule_id) == ("RED", "R3")
        assert s.exec(select(Case).where(Case.rule_id == "R3")).one().level == "red"


def test_wrong_day_tapped_is_amber_even_if_they_say_ok(phone):
    cid, _ = run_call(phone, day=1)
    with Session(engine) as s:
        assert s.get(CheckIn, cid).rule_id == "R5"


def test_spoken_day_is_recorded_transcribed_and_playable(phone, stt):  # noqa: F811
    call = phone.get("/api/phone/current").json()["call"]
    cid = call["checkin_id"]
    phone.post(f"/api/phone/calls/{cid}/answer")
    for step in ("water", "symptoms", "room", "fan"):
        phone.post(f"/api/phone/calls/{cid}/key", json={"step": step, "digit": "1" if step in ("water", "fan") else "2"})
    r = phone.post(f"/api/phone/calls/{cid}/orientation",
                   files={"audio": ("answer.webm", b"webm-bytes", "audio/webm")})
    assert r.status_code == 200
    phone.post(f"/api/phone/calls/{cid}/key", json={"step": "help", "digit": "1"})
    phone.post(f"/api/phone/calls/{cid}/hangup")
    with Session(engine) as s:
        c = s.get(CheckIn, cid)
        assert c.answers["orientation"] == "correct" and c.outcome == "GREEN"
    rec = phone.get(f"/api/recordings/{cid}")
    assert rec.status_code == 200 and rec.content == b"webm-bytes"


def test_unanswered_browser_call_times_out_and_retries(phone):
    cid = phone.get("/api/phone/current").json()["call"]["checkin_id"]
    browser_phone.calls[cid].since -= timedelta(seconds=120)
    with Session(engine) as s:
        sync_tick(s)  # logs ringing
        sync_tick(s)  # ring timeout -> no-answer -> retry scheduled
        c = s.get(CheckIn, cid)
        assert c.outcome == "UNREACHED" and c.call_status == "no-answer"
        assert len(s.exec(select(CheckIn).where(CheckIn.elder_id == c.elder_id)).all()) == 2


def test_declined_call_counts_as_a_failed_attempt(phone):
    cid = phone.get("/api/phone/current").json()["call"]["checkin_id"]
    assert phone.post(f"/api/phone/calls/{cid}/decline").status_code == 200
    with Session(engine) as s:
        assert s.get(CheckIn, cid).call_status == "busy"
    assert phone.post(f"/api/phone/calls/{cid}/answer").status_code == 409


def test_answered_call_with_no_keys_is_unreached_not_fine(phone):
    cid = phone.get("/api/phone/current").json()["call"]["checkin_id"]
    phone.post(f"/api/phone/calls/{cid}/answer")
    phone.post(f"/api/phone/calls/{cid}/hangup")
    with Session(engine) as s:
        assert s.get(CheckIn, cid).rule_id == "R0"

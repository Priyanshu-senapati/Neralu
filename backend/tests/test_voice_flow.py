"""Twilio webhook flow, posted with the TestClient (signature validation disabled in tests)."""
import asyncio

import pytest
from sqlmodel import Session, select

from app.calls import dispatch_due_calls
from app.db import engine
from app.models import Case, CheckIn, Elder, Event
from app.routes import voice

HEATWAVE = {"temp_c": 38, "humidity_pct": 40, "night_min_c": 27}


@pytest.fixture
def stt(monkeypatch):
    """Fake recording download + transcription. Set stt.text / stt.delay per test."""
    class Stt:
        text = "ಇವತ್ತು ಶುಕ್ರವಾರ"  # scenario day is Friday 9 Oct 2026
        delay = 0.0

    async def fake_fetch(url):
        return b"RIFF-fake-wav"

    async def fake_transcribe(audio, lang, *_):
        await asyncio.sleep(Stt.delay)
        return Stt.text

    monkeypatch.setattr(voice, "fetch_recording", fake_fetch)
    monkeypatch.setattr(voice, "transcribe", fake_transcribe)
    return Stt


def start_kamala_call(client) -> int:
    client.post("/api/sim/heat", json=HEATWAVE)
    client.post("/api/sim/round", json={"round_no": 1})
    with Session(engine) as s:
        dispatch_due_calls(s)
        kamala = s.exec(select(Elder).where(Elder.is_simulated == False)).one()  # noqa: E712
        c = s.exec(select(CheckIn).where(CheckIn.elder_id == kamala.id)).one()
        return c.id


def post(client, path, **form):
    r = client.post(path, data=form)
    assert r.status_code in (200, 204), r.text
    return r.text


def answer_all(client, cid, water="1", symptoms="2", room="2", fan="1", help_="1",
               record=True):
    twiml = post(client, f"/voice/answer?checkin_id={cid}")
    assert "greet.mp3" in twiml and "code_mallige.mp3" in twiml and "safety.mp3" in twiml
    for step, digit in [("water", water), ("symptoms", symptoms), ("room", room), ("fan", fan)]:
        twiml = post(client, f"/voice/gather/{step}?checkin_id={cid}", Digits=digit)
    assert "<Record" in twiml
    if record:
        post(client, f"/voice/orientation?checkin_id={cid}",
             RecordingUrl="https://api.twilio.com/rec/RE1")
    else:
        post(client, f"/voice/orientation?checkin_id={cid}&empty=1")
    return post(client, f"/voice/gather/help?checkin_id={cid}", Digits=help_)


def end_call(client, cid, status="completed"):
    post(client, f"/voice/status?checkin_id={cid}", CallStatus=status)


def checkin(cid) -> CheckIn:
    with Session(engine) as s:
        return s.get(CheckIn, cid)


def test_call_is_placed_to_kamala(client):
    cid = start_kamala_call(client)
    assert client.placed == [("+919900000001", cid)]


def test_full_happy_path_is_green(client, stt):
    cid = start_kamala_call(client)
    twiml = answer_all(client, cid)
    assert "close_ok.mp3" in twiml and "<Hangup" in twiml
    end_call(client, cid)
    c = checkin(cid)
    assert (c.outcome, c.rule_id) == ("GREEN", "R9")
    assert c.answers["orientation"] == "correct"
    assert c.transcript == "ಇವತ್ತು ಶುಕ್ರವಾರ"


def test_symptoms_and_no_water_is_red_with_advice(client, stt):
    cid = start_kamala_call(client)
    twiml = answer_all(client, cid, water="2", symptoms="1")
    assert "advice.mp3" in twiml
    end_call(client, cid)
    assert (checkin(cid).outcome, checkin(cid).rule_id) == ("RED", "R3")
    with Session(engine) as s:
        case = s.exec(select(Case).where(Case.elder_id == checkin(cid).elder_id)).one()
        assert (case.level, case.tier, case.state) == ("red", "volunteer", "open")


def test_invalid_digit_reprompts_once_then_none(client, stt):
    cid = start_kamala_call(client)
    post(client, f"/voice/answer?checkin_id={cid}")
    twiml = post(client, f"/voice/gather/water?checkin_id={cid}", Digits="7")
    assert "reprompt.mp3" in twiml and "q_water.mp3" in twiml
    twiml = post(client, f"/voice/gather/water?checkin_id={cid}&r=1&timeout=1")
    assert "q_symptoms.mp3" in twiml
    assert checkin(cid).answers["water"] == "none"


def test_timeout_on_every_gather_is_r0_unreached(client, stt):
    cid = start_kamala_call(client)
    post(client, f"/voice/answer?checkin_id={cid}")
    for step in ["water", "symptoms", "room", "fan"]:
        post(client, f"/voice/gather/{step}?checkin_id={cid}&timeout=1")
        post(client, f"/voice/gather/{step}?checkin_id={cid}&r=1&timeout=1")
    post(client, f"/voice/orientation?checkin_id={cid}&empty=1")
    post(client, f"/voice/gather/help?checkin_id={cid}&timeout=1")
    end_call(client, cid)
    c = checkin(cid)
    assert (c.outcome, c.rule_id) == ("UNREACHED", "R0")


def test_answered_then_hung_up_after_greeting_is_unreached(client, stt):
    cid = start_kamala_call(client)
    post(client, f"/voice/answer?checkin_id={cid}")
    end_call(client, cid, "completed")
    c = checkin(cid)
    assert (c.outcome, c.rule_id) == ("UNREACHED", "R0")
    with Session(engine) as s:  # retry scheduled (attempt 2 of 2)
        retry = s.exec(select(CheckIn).where(CheckIn.elder_id == c.elder_id, CheckIn.attempt == 2)).one()
        assert retry.scheduled_for_real > c.classified_real


def test_duplicate_completed_callback_processed_once(client, stt):
    cid = start_kamala_call(client)
    answer_all(client, cid, water="2", symptoms="1")
    end_call(client, cid)
    end_call(client, cid)
    end_call(client, cid, "no-answer")  # late, out-of-order callback
    with Session(engine) as s:
        classified = s.exec(select(Event).where(Event.kind == "checkin_classified",
                                                Event.checkin_id == cid)).all()
        cases = s.exec(select(Case).where(Case.elder_id == checkin(cid).elder_id)).all()
    assert len(classified) == 1 and len(cases) == 1
    assert checkin(cid).outcome == "RED"


def test_stt_timeout_is_uncertain_amber(client, stt):
    stt.delay = 2.0
    cid = start_kamala_call(client)
    answer_all(client, cid)
    end_call(client, cid)
    c = checkin(cid)
    assert c.answers["orientation"] == "uncertain"
    assert (c.outcome, c.rule_id) == ("AMBER", "R7")


def test_unintelligible_transcript_is_uncertain(client, stt):
    stt.text = None
    cid = start_kamala_call(client)
    answer_all(client, cid)
    end_call(client, cid)
    assert (checkin(cid).outcome, checkin(cid).rule_id) == ("AMBER", "R7")


def test_wrong_day_is_amber_r5(client, stt):
    stt.text = "ಸೋಮವಾರ"
    cid = start_kamala_call(client)
    answer_all(client, cid)
    end_call(client, cid)
    assert (checkin(cid).outcome, checkin(cid).rule_id) == ("AMBER", "R5")


def test_no_recording_is_orientation_none(client, stt):
    cid = start_kamala_call(client)
    answer_all(client, cid, record=False)
    end_call(client, cid)
    c = checkin(cid)
    assert c.answers["orientation"] == "none"
    assert c.rule_id == "R7"


def test_help_pressed_is_red(client, stt):
    cid = start_kamala_call(client)
    twiml = answer_all(client, cid, help_="2")
    assert "close_help.mp3" in twiml
    end_call(client, cid)
    assert (checkin(cid).outcome, checkin(cid).rule_id) == ("RED", "R1")


def test_webhook_for_old_run_ignored(client, stt):
    cid = start_kamala_call(client)
    post(client, f"/voice/answer?checkin_id={cid}")
    client.post("/api/sim/reset")
    twiml = post(client, f"/voice/gather/water?checkin_id={cid}", Digits="2")
    assert "<Hangup" in twiml
    end_call(client, cid)
    c = checkin(cid)
    assert "water" not in (c.answers or {})
    assert c.processed is False and c.outcome is None


def test_signature_required_when_enabled(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "validate_twilio_signature", True)
    r = client.post("/voice/status?checkin_id=1", data={"CallStatus": "completed"})
    assert r.status_code == 403

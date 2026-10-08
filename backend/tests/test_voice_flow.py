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

    async def fake_transcribe(audio, lang):
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


def test_unanswered_call_is_hung_up_after_ring_timeout_and_counts_as_no_answer(client, no_real_twilio, monkeypatch):
    from app.escalation import sync_tick
    from app.state import state
    cid = start_kamala_call(client)
    post(client, f"/voice/status?checkin_id={cid}", CallStatus="ringing")
    t = [state.clock.real_now()]
    monkeypatch.setattr(state.clock, "_now", lambda: t[0])
    t[0] += __import__("datetime").timedelta(seconds=10)
    with Session(engine) as s:
        sync_tick(s)
    assert no_real_twilio == []  # still within RING_TIMEOUT_S
    t[0] += __import__("datetime").timedelta(seconds=6)
    with Session(engine) as s:
        sync_tick(s)
    assert no_real_twilio == [f"CA{cid:032d}"]
    end_call(client, cid, "canceled")
    c = checkin(cid)
    assert (c.call_status, c.outcome) == ("no-answer", "UNREACHED")
    with Session(engine) as s:
        ev = s.exec(select(Event).where(Event.kind == "attempt_failed", Event.checkin_id == cid)).one()
    assert ev.message == "Attempt 1 failed · no answer"


def test_answered_call_is_never_hung_up(client, no_real_twilio, monkeypatch):
    from datetime import timedelta
    from app.escalation import sync_tick
    from app.state import state
    cid = start_kamala_call(client)
    post(client, f"/voice/status?checkin_id={cid}", CallStatus="in-progress")
    t = [state.clock.real_now() + timedelta(seconds=60)]
    monkeypatch.setattr(state.clock, "_now", lambda: t[0])
    with Session(engine) as s:
        sync_tick(s)
    assert no_real_twilio == []


def test_unsigned_trial_gateway_request_needs_our_live_call(client, monkeypatch):
    from app import telephony
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "validate_twilio_signature", True)
    asked = []
    monkeypatch.setattr(telephony, "_call_is_ours", lambda sid: asked.append(sid) or True)
    cid = start_kamala_call(client)
    sid = checkin(cid).call_sid
    ok = client.post(f"/voice/answer?checkin_id={cid}", data={"CallSid": sid, "CallStatus": "in-progress"})
    assert ok.status_code == 200 and "greet.mp3" in ok.text
    wrong = client.post(f"/voice/answer?checkin_id={cid}", data={"CallSid": "CAforged", "CallStatus": "in-progress"})
    assert wrong.status_code == 403
    missing = client.post(f"/voice/answer?checkin_id={cid}", data={"CallStatus": "in-progress"})
    assert missing.status_code == 403
    assert asked == [sid]  # Twilio is only asked about the CallSid that matches our check-in


def test_unsigned_request_rejected_if_twilio_does_not_know_the_call(client, monkeypatch):
    from app import telephony
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "validate_twilio_signature", True)
    monkeypatch.setattr(telephony, "_call_is_ours", lambda sid: False)
    cid = start_kamala_call(client)
    r = client.post(f"/voice/answer?checkin_id={cid}", data={"CallSid": checkin(cid).call_sid})
    assert r.status_code == 403


@pytest.fixture
def keypad_mode(monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "orientation_mode", "keypad")


def keypad_call(client, day=None, retry_day=None):
    """Answer everything fine, then the day question by keypad (None = no press)."""
    cid = start_kamala_call(client)
    post(client, f"/voice/answer?checkin_id={cid}")
    for step, digit in [("water", "1"), ("symptoms", "2"), ("room", "2")]:
        post(client, f"/voice/gather/{step}?checkin_id={cid}", Digits=digit)
    twiml = post(client, f"/voice/gather/fan?checkin_id={cid}", Digits="1")
    assert "q_day_keypad.mp3" in twiml and "<Record" not in twiml
    form = {"Digits": day} if day else {}
    twiml = post(client, f"/voice/gather/day?checkin_id={cid}", **form)
    if "reprompt.mp3" in twiml:
        form = {"Digits": retry_day} if retry_day else {}
        twiml = post(client, f"/voice/gather/day?checkin_id={cid}&r=1", **form)
    assert "q_help.mp3" in twiml
    post(client, f"/voice/gather/help?checkin_id={cid}", Digits="1")
    end_call(client, cid)
    return checkin(cid)


def test_keypad_day_correct_is_green(client, keypad_mode):
    c = keypad_call(client, day="5")  # scenario day is Friday
    assert c.answers["orientation"] == "correct" and c.answers["orientation_via"] == "keypad"
    assert (c.outcome, c.rule_id) == ("GREEN", "R9")


def test_keypad_wrong_day_is_amber_r5(client, keypad_mode):
    c = keypad_call(client, day="4")
    assert (c.answers["orientation"], c.rule_id) == ("wrong", "R5")


def test_keypad_no_press_after_reprompt_is_none_r7(client, keypad_mode):
    c = keypad_call(client)
    assert (c.answers["orientation"], c.rule_id) == ("none", "R7")


def test_keypad_invalid_key_twice_is_uncertain(client, keypad_mode):
    c = keypad_call(client, day="9", retry_day="0")
    assert (c.answers["orientation"], c.rule_id) == ("uncertain", "R7")


def test_keypad_reprompt_then_correct(client, keypad_mode):
    c = keypad_call(client, day="9", retry_day="5")
    assert (c.answers["orientation"], c.outcome) == ("correct", "GREEN")


def test_audio_route_falls_back_to_english(client):
    hi = client.get("/audio/hi/greet.mp3")
    kn = client.get("/audio/kn/greet.mp3")  # no Kannada recordings yet
    en = client.get("/audio/en/greet.mp3")
    assert hi.status_code == kn.status_code == en.status_code == 200
    assert hi.headers["content-type"] == "audio/mpeg"
    assert kn.content == en.content and hi.content != en.content
    assert client.get("/audio/ur/greet.mp3").content == hi.content  # Urdu prefers Hindi
    assert client.get("/audio/en/nope.mp3").status_code == 404
    assert client.get("/audio/en/..%2F..%2F.env").status_code == 404


def test_call_plays_prompts_in_the_elders_language(client, stt):
    cid = start_kamala_call(client)
    with Session(engine) as s:
        c = s.get(CheckIn, cid)
        s.get(Elder, c.elder_id).language = "hi"
        s.commit()
    twiml = post(client, f"/voice/answer?checkin_id={cid}")
    assert "/audio/hi/greet.mp3" in twiml and "/audio/hi/q_water.mp3" in twiml
    assert "/audio/kn/" not in twiml


def test_lost_final_callback_does_not_leave_person_stuck(client, no_real_twilio, monkeypatch):
    from datetime import timedelta
    from app.escalation import sync_tick
    from app.state import state
    cid = start_kamala_call(client)
    post(client, f"/voice/status?checkin_id={cid}", CallStatus="ringing")
    t = [state.clock.real_now()]
    monkeypatch.setattr(state.clock, "_now", lambda: t[0])
    for step in (16, 30, 31):  # hung up at 16 s; the "canceled" callback never arrives
        t[0] += timedelta(seconds=step)
        with Session(engine) as s:
            sync_tick(s)
    c = checkin(cid)
    assert (c.processed, c.call_status, c.outcome) == (True, "no-answer", "UNREACHED")


def test_answered_call_without_completion_callback_is_classified(client, monkeypatch):
    from datetime import timedelta
    from app.escalation import sync_tick
    from app.state import state
    cid = start_kamala_call(client)
    post(client, f"/voice/status?checkin_id={cid}", CallStatus="in-progress")
    post(client, f"/voice/gather/water?checkin_id={cid}", Digits="2")
    t = [state.clock.real_now() + timedelta(minutes=11)]
    monkeypatch.setattr(state.clock, "_now", lambda: t[0])
    with Session(engine) as s:
        sync_tick(s)
    c = checkin(cid)
    assert c.processed and c.answers["water"] == "no" and c.outcome == "AMBER"

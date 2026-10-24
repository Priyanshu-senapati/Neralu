"""Caregiver check: people with memory difficulty are checked through their caregiver, never skipped."""
import pytest
from sqlmodel import Session, select

from app import audio, browser_phone, calls
from app.calls import dispatch_due_calls, start_round
from app.config import get_settings
from app.db import engine
from app.models import Case, CheckIn, Elder, Event
from app.rules import CaregiverSignals, Outcome, classify_caregiver
from app.sim_caller import step_simulation
from app.state import Weather, state
from tests.test_api import REGISTRATION
from tests.test_voice_flow import HEATWAVE, end_call, post

FINE = dict(seen="yes", water="yes", unwell="no", room_no_cooling="no", self_report="ok")


def cg(**changes) -> CaregiverSignals:
    return CaregiverSignals(**{**FINE, **changes})


@pytest.mark.parametrize("signals, outcome, rule", [
    (cg(seen="none", water="none", unwell="none", room_no_cooling="none", self_report="none"),
     Outcome.UNREACHED, "C0"),
    (cg(self_report="help"), Outcome.RED, "C1"),
    (cg(unwell="yes"), Outcome.RED, "C2"),
    (cg(unwell="yes", seen="no"), Outcome.RED, "C2"),  # unwell outranks "not seen"
    (cg(seen="no", water="none", unwell="none"), Outcome.AMBER, "C3"),
    (cg(seen="none"), Outcome.AMBER, "C3"),  # not confirmed seen is never fine
    (cg(water="no"), Outcome.AMBER, "C4"),
    (cg(unwell="none"), Outcome.AMBER, "C5"),
    (cg(water="none", room_no_cooling="none"), Outcome.AMBER, "C5"),
    (cg(water="none"), Outcome.GREEN, "C6"),
    (cg(), Outcome.GREEN, "C6"),
])
def test_caregiver_rules(signals, outcome, rule):
    v = classify_caregiver(signals)
    assert (v.outcome, v.rule_id) == (outcome, rule)


def test_hot_room_without_cooling_needs_support():
    assert classify_caregiver(cg(room_no_cooling="yes")).needs_support
    assert not classify_caregiver(cg()).needs_support


def test_every_caregiver_rule_is_explained(client):
    ids = {r["id"] for r in client.get("/api/rules").json()["rules"]}
    assert {f"C{i}" for i in range(7)} <= ids


def elder(s: Session, **kw) -> Elder:
    e = Elder(run_id="run-test", name="Lakshmi B.", age=82, cognitive_flag=True, lives_alone=True,
              roof_type="sheet", family_phone="+91 98450 00000", is_simulated=False, **kw)
    s.add(e)
    s.commit()
    return e


def test_memory_difficulty_with_caregiver_is_a_caregiver_call(session, monkeypatch):
    state.weather = Weather(38, 40, 27)
    e = elder(session, phone=None)
    placed = []
    monkeypatch.setattr(calls, "place_call", lambda to, cid: placed.append(to) or "CA1")
    assert start_round(session, 1) == 1
    c = session.exec(select(CheckIn).where(CheckIn.elder_id == e.id)).one()
    assert c.callee == "caregiver"
    dispatch_due_calls(session)
    assert placed == ["+919845000000"]  # the caregiver's phone, not the person's
    ev = session.exec(select(Event).where(Event.kind == "round_started")).one()
    assert "1 to caregivers" in ev.message and ev.data["caregiver_route"] == 1


def test_memory_difficulty_without_caregiver_is_called_directly(session):
    state.weather = Weather(38, 40, 27)
    e = elder(session, phone="+919845011111")
    e.family_phone = None
    session.commit()
    start_round(session, 1)
    assert session.exec(select(CheckIn).where(CheckIn.elder_id == e.id)).one().callee == "elder"


def register_caregiver_call(client) -> int:
    """Register someone with memory difficulty, start a heatwave round, place the caregiver call."""
    client.post("/api/sim/heat", json=HEATWAVE)
    r = client.post("/api/elders", json={**REGISTRATION, "cognitive_flag": True})
    assert r.status_code == 201
    eid = r.json()["id"]
    client.post("/api/sim/round", json={"round_no": 1})
    with Session(engine) as s:
        dispatch_due_calls(s)
        s.commit()
        return s.exec(select(CheckIn).where(CheckIn.elder_id == eid)).one().id


def caregiver_call(client, cid, seen="1", water="1", unwell="2", room="2", help_="1") -> str:
    twiml = post(client, f"/voice/answer?checkin_id={cid}")
    assert "greet.mp3" in twiml and "code_tulasi.mp3" in twiml and "safety.mp3" in twiml
    assert "person in your care" in twiml or "cg_intro.mp3" in twiml
    for step, digit in [("cg_seen", seen), ("cg_water", water), ("cg_unwell", unwell), ("cg_room", room)]:
        twiml = post(client, f"/voice/gather/{step}?checkin_id={cid}", Digits=digit)
    assert "<Record" not in twiml  # no day question about someone else
    assert "/voice/gather/cg_help" in twiml
    return post(client, f"/voice/gather/cg_help?checkin_id={cid}", Digits=help_)


def checkin(cid) -> CheckIn:
    with Session(engine) as s:
        return s.get(CheckIn, cid)


def test_caregiver_call_goes_to_the_family_phone(client):
    cid = register_caregiver_call(client)
    assert (REGISTRATION["family_phone"], cid) in client.placed


def test_caregiver_all_fine_is_green(client):
    cid = register_caregiver_call(client)
    closing = caregiver_call(client, cid)
    assert "Hangup" in closing and ("cg_close_ok" in closing or "call you again later" in closing)
    end_call(client, cid)
    c = checkin(cid)
    assert (c.outcome, c.rule_id) == ("GREEN", "C6")
    assert c.answers == {"seen": "yes", "water": "yes", "unwell": "no", "room_no_cooling": "no",
                         "self_report": "ok"}


def test_caregiver_reports_unwell_is_red_and_someone_is_sent(client):
    cid = register_caregiver_call(client)
    closing = caregiver_call(client, cid, unwell="1")
    assert "cg_close_help" in closing or "call 108" in closing
    end_call(client, cid)
    c = checkin(cid)
    assert (c.outcome, c.rule_id) == ("RED", "C2")
    with Session(engine) as s:
        case = s.exec(select(Case).where(Case.elder_id == c.elder_id)).one()
        assert (case.level, case.rule_id) == ("red", "C2")


def test_caregiver_not_seen_is_amber_and_recalls_the_caregiver(client):
    cid = register_caregiver_call(client)
    closing = caregiver_call(client, cid, seen="2", water="2", unwell="2")
    assert "cg_advice_check" in closing or "see them in person now" in closing
    end_call(client, cid)
    c = checkin(cid)
    assert (c.outcome, c.rule_id) == ("AMBER", "C3")
    with Session(engine) as s:
        recall = s.exec(select(CheckIn).where(CheckIn.elder_id == c.elder_id, CheckIn.is_recall == True)).one()  # noqa: E712
        assert recall.callee == "caregiver"
        texts = [e.data.get("text", "") for e in s.exec(select(Event).where(
            Event.kind == "family_notified", Event.elder_id == c.elder_id))]
        assert not any("needs follow-up" in t for t in texts)  # they were on the call


def test_unanswered_caregiver_call_retries_the_caregiver_then_sends_someone(client):
    cid = register_caregiver_call(client)
    end_call(client, cid, "no-answer")
    with Session(engine) as s:
        rows = s.exec(select(CheckIn).where(CheckIn.elder_id == checkin(cid).elder_id)
                      .order_by(CheckIn.id)).all()
        assert [r.callee for r in rows] == ["caregiver", "caregiver"]
        retry = rows[-1]
    with Session(engine) as s:
        calls.handle_call_ended(s, retry.id, "no-answer")
        s.commit()
        case = s.exec(select(Case).where(Case.elder_id == retry.elder_id)).one()
        assert (case.level, case.rule_id) == ("red", "E1")


def test_day_step_is_refused_on_a_caregiver_call(client):
    cid = register_caregiver_call(client)
    post(client, f"/voice/answer?checkin_id={cid}")
    assert "<Hangup" in post(client, f"/voice/gather/day?checkin_id={cid}", Digits="5")
    assert "<Hangup" in post(client, f"/voice/gather/water?checkin_id={cid}", Digits="1")


def test_missing_clip_is_spoken_from_its_text(monkeypatch):
    monkeypatch.setattr(audio, "resolve", lambda lang, name: None)
    from app import telephony as tw
    twiml = tw.caregiver_close_twiml({"seen": "yes", "water": "yes"}, help_=False, lang="kn")
    assert "<Say" in twiml and "We will call you again later today." in twiml
    assert 'language="en-IN"' in twiml  # Kannada falls back to English text-to-speech
    hi = tw.caregiver_close_twiml({"seen": "yes", "water": "yes"}, help_=False, lang="hi")
    assert 'language="hi-IN"' in hi


def test_browser_phone_caregiver_script(client, monkeypatch):
    browser_phone.calls.clear()
    monkeypatch.setattr(get_settings(), "telephony_mode", "browser")
    monkeypatch.setattr(calls, "place_call", lambda to, cid: browser_phone.ring(cid))
    cid = register_caregiver_call(client)
    call = client.get("/api/phone/current").json()["call"]
    assert call["callee"] == "caregiver" and call["elder_name"] == REGISTRATION["name"]
    script = client.post(f"/api/phone/calls/{cid}/answer").json()
    assert script["callee"] == "caregiver" and script["orientation"] is None
    assert [s["step"] for s in script["steps"]] == ["cg_seen", "cg_water", "cg_unwell", "cg_room"]
    assert script["help"]["step"] == "cg_help"
    for url, speech in script["speech"].items():  # any prompt without a clip yet is spoken
        assert url.startswith("/audio/") and speech["text"]
    for step, digit in [("cg_seen", "1"), ("cg_water", "2"), ("cg_unwell", "2"), ("cg_room", "2")]:
        assert client.post(f"/api/phone/calls/{cid}/key", json={"step": step, "digit": digit}).status_code == 200
    assert client.post(f"/api/phone/calls/{cid}/key", json={"step": "water", "digit": "1"}).status_code == 422
    closing = client.post(f"/api/phone/calls/{cid}/key", json={"step": "cg_help", "digit": "1"}).json()
    assert [u.rsplit("/", 1)[1] for u in closing["closing"]] == ["cg_advice_water.mp3", "cg_close_ok.mp3"]
    client.post(f"/api/phone/calls/{cid}/hangup")
    c = checkin(cid)
    assert (c.outcome, c.rule_id) == ("AMBER", "C4")


def test_simulated_caregivers_go_through_the_caregiver_rules(client):
    client.post("/api/sim/heat", json={"temp_c": 44, "humidity_pct": 40, "night_min_c": 28})
    client.post("/api/sim/round", json={"round_no": 1})
    with Session(engine) as s:
        rows = s.exec(select(CheckIn).where(CheckIn.callee == "caregiver", CheckIn.is_simulated == True)).all()  # noqa: E712
        assert rows, "the seeded ward has residents with memory difficulty and a family contact"
        for c in rows:
            c.sim_resolve_at_real = state.clock.real_now()
            c.started = True
        s.commit()
        step_simulation(s)
        s.commit()
        done = s.exec(select(CheckIn).where(CheckIn.callee == "caregiver", CheckIn.processed == True)).all()  # noqa: E712
        assert done and all(c.rule_id.startswith("C") for c in done)

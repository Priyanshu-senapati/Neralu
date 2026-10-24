"""Missed-call check-in: a registered person or their family rings the Neralu number, the call is
rejected (free for them), and Neralu calls back at once with the usual check."""
from sqlmodel import Session, select

from app import calls
from app.config import get_settings
from app.db import current_run_id, engine
from app.models import CheckIn, Elder, Event
from app.state import state

KAMALA = "+919900000001"  # tests/conftest.py KAMALA_PHONE
REGISTER = {
    "name": "Gowri Bai", "age": 79, "phone": "+919845011111", "language": "kn", "lives_alone": True,
    "roof_type": "sheet", "has_fan": True, "heat_sensitive_meds": False, "hearing_difficulty": False,
    "cognitive_flag": False, "address": "#9, 3rd Cross, Ward 47", "family_name": "Ravi",
    "family_phone": "+919845022222", "code_word": "mallige", "consent": True,
}


def ring(client, number: str):
    return client.post("/voice/inbound", data={"From": number, "To": "+15550000000", "CallSid": "CAin"})


def requested(elder_id: int) -> list[CheckIn]:
    with Session(engine) as s:
        return list(s.exec(select(CheckIn).where(CheckIn.run_id == current_run_id(), CheckIn.elder_id == elder_id,
                                                 CheckIn.requested == True)))  # noqa: E712


def missed_events() -> list[Event]:
    with Session(engine) as s:
        return list(s.exec(select(Event).where(Event.run_id == current_run_id(), Event.kind == "missed_call")
                           .order_by(Event.id)))


def kamala_id() -> int:
    with Session(engine) as s:
        return s.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.name == "Kamala R.")).one().id


def test_a_missed_call_is_rejected_and_called_back_at_once(client):
    r = ring(client, "099000 00001")  # how a phone shows a local number: still Kamala
    assert r.status_code == 200 and '<Reject reason="busy"/>' in r.text  # never answered: free for her
    [c] = requested(kamala_id())
    assert c.callee == "elder" and c.attempt == 1 and not c.started
    assert missed_events()[-1].message == "Missed call from Kamala R. · calling Kamala back now"
    # It is placed by the normal dispatcher, labelled as a callback.
    with Session(engine) as s:
        assert [x.id for x in calls.due_real_checkins(s)] == [c.id]


def test_callback_is_placed_and_labelled(client, monkeypatch):
    monkeypatch.setattr(calls, "place_call", lambda to, cid: "CAback")
    ring(client, KAMALA)
    with Session(engine) as s:
        calls.dispatch_due_calls(s)
        placed = s.exec(select(Event).where(Event.kind == "call_placed")).all()
    assert placed[-1].message == "Calling back after a missed call · attempt 1"


def test_the_family_can_ask_for_a_check(client):
    reg = client.post("/api/elders", json=REGISTER).json()
    ring(client, "+91 98450 22222")  # Ravi, the family contact
    [c] = requested(reg["id"])
    assert c.callee == "elder"  # Gowri herself is checked
    assert missed_events()[-1].message == "Missed call from Gowri Bai's family · calling Gowri back now"


def test_memory_difficulty_goes_to_the_caregiver(client):
    reg = client.post("/api/elders", json={**REGISTER, "cognitive_flag": True}).json()
    ring(client, REGISTER["family_phone"])
    [c] = requested(reg["id"])
    assert c.callee == "caregiver"


def test_unknown_numbers_are_not_called_and_not_kept(client):
    r = ring(client, "+919812345678")
    assert '<Reject reason="busy"/>' in r.text
    ev = missed_events()[-1]
    assert ev.message == "Missed call from an unregistered number · not called back"
    assert "9812345678" not in ev.message + str(ev.data)
    with Session(engine) as s:
        assert not s.exec(select(CheckIn).where(CheckIn.requested == True)).all()  # noqa: E712


def test_simulated_residents_never_match(client):
    ring(client, "+910000000000")  # the fictional number every simulated resident's family shares
    assert missed_events()[-1].data["outcome"] == "unknown"


def test_repeat_missed_calls_never_stack_up(client):
    kid = kamala_id()
    ring(client, KAMALA)
    ring(client, KAMALA)  # the callback is booked but not placed yet: nothing new
    assert len(requested(kid)) == 1 and missed_events()[-1].data["outcome"] == "sooner"
    with Session(engine) as s:
        c = s.get(CheckIn, requested(kid)[0].id)
        c.started = True
        s.commit()
    ring(client, KAMALA)
    assert missed_events()[-1].data["outcome"] == "in_progress" and len(requested(kid)) == 1
    with Session(engine) as s:
        c = s.get(CheckIn, requested(kid)[0].id)
        c.processed = True
        s.commit()
    ring(client, KAMALA)  # just called back: not again for 30 min
    assert missed_events()[-1].data["outcome"] == "cooldown" and len(requested(kid)) == 1
    with Session(engine) as s:
        c = s.get(CheckIn, requested(kid)[0].id)
        c.scheduled_for_real = state.clock.real_now() - state.clock.real_delta(31)
        s.commit()
    ring(client, KAMALA)
    assert missed_events()[-1].data["outcome"] == "calling" and len(requested(kid)) == 2


def test_a_call_booked_for_later_is_brought_forward(client):
    client.post("/api/sim/heat", json={"temp_c": 38, "humidity_pct": 40, "night_min_c": 27})
    client.post("/api/sim/round", json={"round_no": 1})
    kid = kamala_id()
    with Session(engine) as s:
        c = s.exec(select(CheckIn).where(CheckIn.elder_id == kid, CheckIn.processed == False)).one()  # noqa: E712
        c.scheduled_for_real = state.clock.real_now() + state.clock.real_delta(120)
        s.commit()
        booked = c.id
    ring(client, KAMALA)
    with Session(engine) as s:
        c = s.get(CheckIn, booked)
        assert c.scheduled_for_real.replace(tzinfo=None) <= state.clock.real_now().replace(tzinfo=None)
    assert not requested(kid)  # the same call, sooner; not a second one


def test_demo_phone_button_is_browser_mode_only(client, monkeypatch):
    assert client.post("/api/phone/missed-call").status_code == 409
    monkeypatch.setattr(get_settings(), "telephony_mode", "browser")
    assert client.post("/api/phone/missed-call").json() == {"outcome": "calling"}
    assert len(requested(kamala_id())) == 1
    ev = missed_events()[-1]
    assert ev.data["simulated"] and "simulated" in ev.message and not ev.simulated  # shown in the feed


def test_family_page_and_story_say_it_was_asked_for(client, monkeypatch):
    monkeypatch.setattr(calls, "place_call", lambda to, cid: "CAback")
    reg = client.post("/api/elders", json=REGISTER).json()
    ring(client, REGISTER["family_phone"])
    with Session(engine) as s:
        calls.dispatch_due_calls(s)
    today = [x["text"] for x in client.get("/api/family/status",
                                           headers={"X-Family-Token": reg["family_token"]}).json()["today"]]
    assert "The family gave Neralu a missed call to ask for a check" in today
    assert "Neralu called Gowri back" in today
    detail = client.get(f"/api/elders/{reg['id']}").json()
    assert detail["checkins"][-1]["requested"] is True

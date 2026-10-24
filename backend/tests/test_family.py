"""Family status link: private, read-only, one person only, replaceable and revocable."""
import json

from sqlmodel import Session, select

from app.calls import dispatch_due_calls
from app.db import engine
from app.escalation import open_case
from app.models import CheckIn, Elder, Event
from tests.test_api import REGISTRATION
from tests.test_voice_flow import HEATWAVE, end_call, post, stt  # noqa: F401  (fixture)

PRIYA = {"volunteer_token": "priya-demo"}


def register(client, **changes) -> tuple[int, str]:
    r = client.post("/api/elders", json={**REGISTRATION, **changes})
    assert r.status_code == 201
    return r.json()["id"], r.json()["family_token"]


def status(client, token, code=200) -> dict:
    r = client.get("/api/family/status", headers={"X-Family-Token": token})
    assert r.status_code == code, r.text
    return r.json()


def test_registration_gives_a_private_link_stored_only_as_a_hash(client):
    eid, token = register(client)
    assert len(token) >= 24
    with Session(engine) as s:
        e = s.get(Elder, eid)
        assert e.family_token_hash and token not in e.family_token_hash
        assert not any(token in json.dumps(ev.data) + ev.message for ev in s.exec(select(Event)))
    assert token not in json.dumps(client.get(f"/api/elders/{eid}").json())


def test_unknown_or_missing_token_is_refused_the_same_way(client):
    register(client)
    assert status(client, "not-a-real-token", 404) == status(client, "", 404)
    assert client.get("/api/family/status").status_code == 404


def test_status_shows_only_this_person_and_no_sensitive_details(client):
    client.post("/api/sim/heat", json=HEATWAVE)
    eid, token = register(client)
    d = status(client, token)
    assert d["name"] == REGISTRATION["name"] and d["headline"].startswith("Gowramma is due a check call today")
    blob = json.dumps(d)
    for secret in (REGISTRATION["address"], REGISTRATION["code_word"], "98450", "+91", "Kamala"):
        assert secret.lower() not in blob.lower(), secret


def test_answered_call_reads_answered_all_fine(client, stt):
    client.post("/api/sim/heat", json=HEATWAVE)
    eid, token = register(client)
    client.post("/api/sim/round", json={"round_no": 1})
    with Session(engine) as s:
        dispatch_due_calls(s)
        cid = s.exec(select(CheckIn).where(CheckIn.elder_id == eid)).one().id
    assert status(client, token)["headline"] == "Neralu is calling Gowramma now"
    post(client, f"/voice/answer?checkin_id={cid}")
    for step, digit in [("water", "1"), ("symptoms", "2"), ("room", "2"), ("fan", "1")]:
        post(client, f"/voice/gather/{step}?checkin_id={cid}", Digits=digit)
    post(client, f"/voice/orientation?checkin_id={cid}", RecordingUrl="https://api.twilio.com/rec/RE1")
    post(client, f"/voice/gather/help?checkin_id={cid}", Digits="1")
    end_call(client, cid)
    d = status(client, token)
    assert d["tone"] == "ok" and d["headline"].startswith("Gowramma answered at ") and d["headline"].endswith("all fine")
    assert d["last_check"]["text"] == "All fine"
    assert [line["text"] for line in d["today"]][-1] == "All fine"


def test_volunteer_visit_and_aftercare_without_naming_the_volunteer(client):
    eid, token = register(client)
    with Session(engine) as s:
        cid = open_case(s, eid, "red", "E1", "No answer ×2").id
        s.commit()
    assert status(client, token)["headline"] == "A person nearby is being asked to check on Gowramma"
    client.post(f"/api/cases/{cid}/accept", json=PRIYA)
    d = status(client, token)
    assert d["headline"] == "A volunteer is on the way to Gowramma" and "Priya" not in json.dumps(d)
    client.post(f"/api/cases/{cid}/resolve", json={**PRIYA, "resolution": "safe_in_person"})
    d = status(client, token)
    assert d["headline"].startswith("Checked in person at ") and d["headline"].endswith("safe")
    assert d["next_call"]["kind"] == "after-care"
    assert "Priya" not in json.dumps(d)


def test_renew_replaces_the_link_and_revoke_turns_it_off(client):
    eid, old = register(client)
    new = client.post("/api/family/renew", headers={"X-Family-Token": old}).json()["family_token"]
    assert new != old
    status(client, old, 404)
    status(client, new)
    assert client.post("/api/family/revoke", headers={"X-Family-Token": new}).json() == {"revoked": True}
    status(client, new, 404)
    with Session(engine) as s:
        changes = s.exec(select(Event).where(Event.kind == "family_link_changed")).all()
        assert [c.data["action"] for c in changes] == ["renewed", "revoked"]
        assert not any(t in c.message + json.dumps(c.data) for c in changes for t in (old, new))


def test_erasing_the_registration_kills_the_link(client):
    reg = client.post("/api/elders", json=REGISTRATION).json()
    eid, token = reg["id"], reg["family_token"]
    r = client.request("DELETE", f"/api/elders/{eid}", json={"code": reg["erasure_code"]})  # R2-6 erasure code
    assert r.status_code == 200
    status(client, token, 404)


def test_link_survives_to_the_next_pilot_day(client):
    from app.db import current_run_id, set_run_id
    from app.runs import _carry_registrations

    eid, token = register(client)
    with Session(engine) as s:
        old_run = current_run_id()
        set_run_id("next-day")
        assert _carry_registrations(s, old_run, "next-day") == 1
        s.commit()
    assert status(client, token)["name"] == REGISTRATION["name"]


def test_memory_difficulty_is_checked_through_the_caregiver(client):
    client.post("/api/sim/heat", json=HEATWAVE)
    _, token = register(client, cognitive_flag=True)
    d = status(client, token)
    assert d["through_caregiver"] and "through their caregiver" in d["headline"]


def test_demo_persona_link_for_the_pitch_rotates(client):
    first = client.post("/api/sim/family-link").json()["family_token"]
    assert status(client, first)["name"] == "Kamala R."
    second = client.post("/api/sim/family-link").json()["family_token"]
    status(client, first, 404)
    assert status(client, second)["registered"] is False  # the fictional demo persona

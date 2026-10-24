"""Right to erasure: a family can remove a person they registered, with the random code shown once."""
from sqlmodel import Session, select

from app.db import engine
from app.escalation import open_case
from app.models import Case, Elder, Event
from tests.test_api import REGISTRATION, kamala_id


def register(client) -> tuple[int, str]:
    r = client.post("/api/elders", json=REGISTRATION).json()
    return r["id"], r["erasure_code"]


def test_family_removes_a_registration_and_every_trace_goes(client):
    eid, code = register(client)
    with Session(engine) as s:
        open_case(s, eid, "red", "E1", "No answer ×2")
        s.commit()
    r = client.request("DELETE", f"/api/elders/{eid}", json={"code": code.lower().replace("-", " ")})
    assert r.status_code == 200 and r.json()["cases"] == 1
    with Session(engine) as s:
        assert s.get(Elder, eid) is None
        assert s.exec(select(Case).where(Case.elder_id == eid)).first() is None
        assert s.exec(select(Event).where(Event.elder_id == eid)).first() is None
        deleted = s.exec(select(Event).where(Event.kind == "elder_deleted")).one()
        assert REGISTRATION["name"] not in deleted.message and deleted.elder_id is None
    assert client.get("/api/summary").json()["counts"]["registered"] == 401
    assert client.get(f"/api/elders/{eid}").status_code == 404


def test_the_guessable_registration_number_or_a_wrong_code_is_refused(client):
    eid, code = register(client)
    for wrong in (f"NRL-W47-{eid:05d}", "AAAA-AAAA", ""):
        assert client.request("DELETE", f"/api/elders/{eid}", json={"code": wrong}).status_code == 403
    assert client.get(f"/api/elders/{eid}").status_code == 200


def test_the_code_is_random_shown_once_and_stored_only_as_a_hash(client):
    from app.privacy import ALPHABET

    a, code_a = register(client)
    b, code_b = register(client)
    assert code_a != code_b and len(code_a) == 9 and code_a[4] == "-"
    assert all(ch in ALPHABET for ch in code_a.replace("-", ""))
    with Session(engine) as s:
        stored = s.get(Elder, a).erasure_hash
    assert stored and code_a not in stored and code_a.replace("-", "") not in stored
    assert code_a not in str(client.get(f"/api/elders/{a}").json())  # the console never sees it


def test_family_can_erase_from_their_status_link(client):
    r = client.post("/api/elders", json=REGISTRATION).json()
    token = r["family_link"].split("t=")[1]
    assert client.request("DELETE", "/api/family", json={"t": token, "code": "AAAA-AAAA"}).status_code == 403
    assert client.request("DELETE", "/api/family", json={"t": token, "code": r["erasure_code"]}).status_code == 200
    assert client.get("/api/family", params={"t": token}).status_code == 404


def test_demo_persona_and_simulated_residents_cannot_be_removed(client):
    kid = kamala_id()
    r = client.request("DELETE", f"/api/elders/{kid}", json={"code": "AAAA-AAAA"})
    assert r.status_code == 409
    with Session(engine) as s:
        sim = s.exec(select(Elder).where(Elder.is_simulated)).first()
    r = client.request("DELETE", f"/api/elders/{sim.id}", json={"code": "AAAA-AAAA"})
    assert r.status_code == 409

"""Right to erasure: a family can remove a person they registered, with the registration number."""
from sqlmodel import Session, select

from app.db import engine
from app.escalation import open_case
from app.models import Case, Elder, Event
from tests.test_api import REGISTRATION, kamala_id


def register(client) -> int:
    return client.post("/api/elders", json=REGISTRATION).json()["id"]


def test_family_removes_a_registration_and_every_trace_goes(client):
    eid = register(client)
    with Session(engine) as s:
        open_case(s, eid, "red", "E1", "No answer ×2")
        s.commit()
    r = client.request("DELETE", f"/api/elders/{eid}", json={"registration": f"nrl-w47-{eid:05d}"})
    assert r.status_code == 200 and r.json()["cases"] == 1
    with Session(engine) as s:
        assert s.get(Elder, eid) is None
        assert s.exec(select(Case).where(Case.elder_id == eid)).first() is None
        assert s.exec(select(Event).where(Event.elder_id == eid)).first() is None
        deleted = s.exec(select(Event).where(Event.kind == "elder_deleted")).one()
        assert REGISTRATION["name"] not in deleted.message and deleted.elder_id is None
    assert client.get("/api/summary").json()["counts"]["registered"] == 401
    assert client.get(f"/api/elders/{eid}").status_code == 404


def test_wrong_registration_number_is_refused(client):
    eid = register(client)
    r = client.request("DELETE", f"/api/elders/{eid}", json={"registration": "NRL-W47-99999"})
    assert r.status_code == 403
    assert client.get(f"/api/elders/{eid}").status_code == 200


def test_demo_persona_and_simulated_residents_cannot_be_removed(client):
    kid = kamala_id()
    r = client.request("DELETE", f"/api/elders/{kid}", json={"registration": f"NRL-W47-{kid:05d}"})
    assert r.status_code == 409
    with Session(engine) as s:
        sim = s.exec(select(Elder).where(Elder.is_simulated)).first()
    r = client.request("DELETE", f"/api/elders/{sim.id}", json={"registration": f"NRL-W47-{sim.id:05d}"})
    assert r.status_code == 409

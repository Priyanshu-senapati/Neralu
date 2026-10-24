"""Command-center polish: who a case is assigned to, where each risk factor came from, and the
printable case record (trigger, calls, rule, escalation, acceptance, closure, family told)."""
from sqlmodel import Session, select

from app.db import current_run_id, engine
from app.escalation import accept_case, resolve_case
from app.models import Case, Elder, Volunteer
from tests.test_family import FINE, HEATWAVE, REGISTER, end_call, kamala_checkin


def kamala_red_case(client) -> int:
    client.post("/api/sim/heat", json=HEATWAVE)
    client.post("/api/sim/round", json={"round_no": 1})
    end_call(kamala_checkin(), {**FINE, "water": "no", "symptoms": "yes"})  # RED by R3
    with Session(engine) as s:
        k = s.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.name == "Kamala R.")).one()
        return s.exec(select(Case).where(Case.elder_id == k.id, Case.state == "open")).one().id


def priya_accepts(case_id: int, resolve: bool = False):
    with Session(engine, expire_on_commit=False) as s:
        priya = s.exec(select(Volunteer).where(Volunteer.token == "priya-demo")).one()
        accept_case(s, case_id, priya.id)
        if resolve:
            resolve_case(s, case_id, priya.id, "safe_in_person", "Drinking water, fan on")
        s.commit()


def kamala_item(client):
    return next(e for e in client.get("/api/elders").json() if e["name"] == "Kamala R.")


def test_assignee_name_in_list_and_cases(client):
    case_id = kamala_red_case(client)
    assert kamala_item(client)["open_case"]["assignee_name"] is None
    priya_accepts(case_id)
    assert kamala_item(client)["open_case"]["assignee_name"].startswith("Priya")
    listed = next(c for c in client.get("/api/cases").json() if c["id"] == case_id)
    assert listed["assignee_name"].startswith("Priya")


def test_every_risk_factor_says_where_it_came_from(client):
    elders = client.get("/api/elders").json()
    assert {e["source"] for e in elders} == {"simulated", "demo"}
    reg = client.post("/api/elders", json=REGISTER).json()
    d = client.get(f"/api/elders/{reg['id']}").json()
    assert d["source"] == "family" and d["risk_source"] == "Family registration form"
    assert d["weather_source"] == "Simulated heat preset"
    sim = next(e for e in elders if e["is_simulated"])
    assert client.get(f"/api/elders/{sim['id']}").json()["risk_source"].startswith("Simulated resident")
    assert client.get(f"/api/elders/{kamala_item(client)['id']}").json()["risk_source"].startswith("Demo persona")


def test_open_case_record_has_trigger_and_hides_address(client):
    case_id = kamala_red_case(client)
    r = client.get(f"/api/cases/{case_id}/record").json()
    assert r["level"] == "red" and r["state"] == "open"
    assert r["trigger"]["rule_id"] == "R3" and r["trigger"]["checkin_id"] is not None
    trig = next(c for c in r["calls"] if c["id"] == r["trigger"]["checkin_id"])
    assert trig["answers"]["water"] == "no" and trig["rule_id"] == "R3"
    assert "not by AI" in r["trigger"]["decided_by"]
    assert [x["kind"] for x in r["escalation"]][0] == "case_opened"
    assert r["person"]["address"] is None and r["acceptance"] is None and r["closure"] is None
    assert r["person"]["source"] == "demo" and r["person"]["risk_breakdown"]
    assert "+91" not in str(r)  # never a phone number


def test_closed_case_record_has_acceptance_closure_and_family(client):
    case_id = kamala_red_case(client)
    priya_accepts(case_id, resolve=True)
    r = client.get(f"/api/cases/{case_id}/record").json()
    kinds = [x["kind"] for x in r["escalation"]]
    assert kinds[0] == "case_opened" and "case_accepted" in kinds and kinds[-1] == "case_resolved"
    assert r["acceptance"]["name"].startswith("Priya") and r["acceptance"]["accepted_scenario"]
    assert r["closure"]["resolution"] == "safe_in_person" and r["closure"]["note"] == "Drinking water, fan on"
    assert r["person"]["address"].startswith("#18")
    assert r["family_told"] and all(f["kind"] == "family_notified" for f in r["family_told"])


def test_unknown_case_record_is_404(client):
    assert client.get("/api/cases/999999/record").status_code == 404

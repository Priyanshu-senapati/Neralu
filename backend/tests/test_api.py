from sqlmodel import Session, select

from app.db import engine
from app.escalation import open_case, sync_tick
from app.models import Elder, Event, Volunteer

HEATWAVE = {"temp_c": 38, "humidity_pct": 40, "night_min_c": 27}
NORMAL = {"temp_c": 31, "humidity_pct": 45, "night_min_c": 23}

REGISTRATION = {
    "name": "Gowramma S.", "age": 81, "phone": "98450 12345", "language": "kn",
    "lives_alone": True, "roof_type": "tile", "has_fan": False, "heat_sensitive_meds": False,
    "hearing_difficulty": True, "cognitive_flag": False, "neighbour_phone": "",
    "family_name": "Latha (daughter)", "family_phone": "+919845000000", "code_word": "tulasi",
    "address": "#7, 3 Cross, 5 Main, Ward 47", "consent": True,
}


def kamala_id() -> int:
    with Session(engine) as s:
        return s.exec(select(Elder).where(Elder.name == "Kamala R.")).one().id


def red_case_for_kamala() -> int:
    with Session(engine) as s:
        c = open_case(s, kamala_id(), "red", "E1", "No answer ×2")
        s.commit()
        return c.id


def test_reset_seeds_401_elders_and_volunteers(client):
    run = client.post("/api/sim/reset").json()["run_id"]
    summary = client.get("/api/summary").json()
    assert summary["run_id"] == run
    assert summary["counts"]["registered"] == 401
    assert summary["weather"]["simulated"] is True
    with Session(engine) as s:
        vols = s.exec(select(Volunteer).where(Volunteer.run_id == run)).all()
    assert sorted(v.role for v in vols) == ["asha"] * 2 + ["volunteer"] * 6


def test_heat_preset_changes_due_count(client):
    normal = client.post("/api/sim/heat", json=NORMAL).json()
    heat = client.post("/api/sim/heat", json=HEATWAVE).json()
    assert heat["weather"]["level"] == "severe_for_vulnerable"
    assert normal["weather"]["level"] == "normal"
    assert heat["counts"]["due_today"] > normal["counts"]["due_today"]


def test_elder_list_hides_address_and_phone(client):
    items = client.get("/api/elders").json()
    assert len(items) == 401
    assert all("address" not in i and "phone" not in i for i in items)
    kamala = next(i for i in items if i["name"] == "Kamala R.")
    assert kamala["risk_score"] == 70 and kamala["is_simulated"] is False


def test_kamala_detail_explains_why_called(client):
    client.post("/api/sim/heat", json=HEATWAVE)
    d = client.get(f"/api/elders/{kamala_id()}").json()
    assert d["threshold_c"] == 32.0 and d["heat_index_c"] == 43.4
    assert d["risk_breakdown"][0] == ["Age 74", 20]
    assert d["address"] is None


def test_register_elder_appears_with_event(client):
    r = client.post("/api/elders", json=REGISTRATION)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["risk_score"] == 30 + 20 + 10 + 5 and body["address"] is None
    with Session(engine) as s:
        e = s.get(Elder, body["id"])
        assert e.phone == "+919845012345" and e.neighbour_phone is None and not e.is_simulated
        ev = s.exec(select(Event).where(Event.kind == "elder_registered")).one()
        assert ev.elder_id == e.id
    assert client.get("/api/summary").json()["counts"]["registered"] == 402


def test_register_requires_consent_and_valid_code_word(client):
    assert client.post("/api/elders", json={**REGISTRATION, "consent": False}).status_code == 422
    assert client.post("/api/elders", json={**REGISTRATION, "code_word": "password"}).status_code == 422
    assert client.post("/api/elders", json={**REGISTRATION, "phone": "123"}).status_code == 422


def test_volunteer_sees_address_only_after_accepting(client):
    cid = red_case_for_kamala()
    me = client.get("/api/volunteer/me", params={"token": "priya-demo"}).json()
    case = next(c for c in me["cases"] if c["id"] == cid)
    assert case["elder"]["address"] is None and case["elder"]["phone"] is None
    assert case["distance_km"] > 0
    r = client.post(f"/api/cases/{cid}/accept", json={"volunteer_token": "priya-demo"})
    assert r.status_code == 200
    assert r.json()["elder"]["address"].startswith("#18")
    assert r.json()["elder"]["phone"] == "+919900000001"
    # dashboard detail shows it as assigned
    assert client.get(f"/api/cases/{cid}").json()["state"] == "assigned"


def test_second_acceptor_gets_409(client):
    cid = red_case_for_kamala()
    assert client.post(f"/api/cases/{cid}/accept", json={"volunteer_token": "priya-demo"}).status_code == 200
    r = client.post(f"/api/cases/{cid}/accept", json={"volunteer_token": "sim-vol-1"})
    assert r.status_code == 409 and r.json() == {"error": "already_accepted"}


def test_resolve_flow_and_auth(client):
    cid = red_case_for_kamala()
    assert client.post(f"/api/cases/{cid}/accept", json={"volunteer_token": "nope"}).status_code == 401
    client.post(f"/api/cases/{cid}/accept", json={"volunteer_token": "priya-demo"})
    r = client.post(f"/api/cases/{cid}/resolve",
                    json={"volunteer_token": "sim-vol-1", "resolution": "safe_in_person"})
    assert r.status_code == 409
    r = client.post(f"/api/cases/{cid}/resolve",
                    json={"volunteer_token": "priya-demo", "resolution": "safe_in_person"})
    assert r.status_code == 200 and r.json()["state"] == "resolved"
    assert r.json()["elder"]["address"] is None  # no longer revealed once resolved
    assert client.get("/api/cases", params={"state": "open,assigned"}).json() == []
    kinds = [e["kind"] for e in client.get(f"/api/cases/{cid}").json()["events"]]
    assert kinds[-2:] == ["case_resolved", "family_notified"]


def test_simulated_round_resolves_and_never_touches_kamala_case(client, monkeypatch):
    from app.state import state
    client.post("/api/sim/heat", json=HEATWAVE)
    created = client.post("/api/sim/round", json={"round_no": 1}).json()["created"]
    assert created > 300
    cid = red_case_for_kamala()
    t = [state.clock.real_now()]
    monkeypatch.setattr(state.clock, "_now", lambda: t[0])
    for _ in range(80):  # 80 scenario minutes in 1-minute steps
        t[0] += state.clock.real_delta(1)
        with Session(engine) as s:
            sync_tick(s)
    counts = client.get("/api/summary").json()["counts"]
    assert counts["fine"] > 300
    kamala_case = client.get(f"/api/cases/{cid}").json()
    assert kamala_case["state"] == "open" and kamala_case["overdue"]
    with Session(engine) as s:
        sim_events = s.exec(select(Event).where(Event.actor == "sim")).all()
        assert sim_events and all(e.simulated for e in sim_events)


def test_round_two_only_for_twice_due(client):
    client.post("/api/sim/heat", json={"temp_c": 34, "humidity_pct": 40, "night_min_c": 24})
    r1 = client.post("/api/sim/round", json={"round_no": 1}).json()["created"]
    r2 = client.post("/api/sim/round", json={"round_no": 2}).json()["created"]
    assert 0 < r2 < r1
    again = client.post("/api/sim/round", json={"round_no": 1}).json()["created"]
    assert again == 0  # no duplicate check-ins for the same round


def test_volunteer_still_sees_case_after_it_moves_to_asha(client):
    cid = red_case_for_kamala()
    with Session(engine) as s:
        from app.models import Case
        c = s.get(Case, cid)
        c.tier = "asha"
        s.commit()
    me = client.get("/api/volunteer/me", params={"token": "priya-demo"}).json()
    assert cid in [c["id"] for c in me["cases"]]
    asha = client.get("/api/volunteer/me", params={"token": "sim-asha-1"}).json()
    assert cid in [c["id"] for c in asha["cases"]]


def test_resolution_supersedes_unreached_call(client):
    from app.calls import handle_call_ended
    from app.models import CheckIn
    with Session(engine) as s:
        from app.db import current_run_id
        c = CheckIn(run_id=current_run_id(), elder_id=kamala_id(), round_no=1, attempt=2, started=True)
        s.add(c); s.commit()
        handle_call_ended(s, c.id, "no-answer"); s.commit()
    cid = client.get("/api/cases").json()[0]["id"]
    client.post(f"/api/cases/{cid}/accept", json={"volunteer_token": "priya-demo"})
    client.post(f"/api/cases/{cid}/resolve", json={"volunteer_token": "priya-demo", "resolution": "safe_in_person"})
    item = next(i for i in client.get("/api/elders").json() if i["id"] == kamala_id())
    assert item["last_resolution"]["resolution"] == "safe_in_person"
    counts = client.get("/api/summary").json()["counts"]
    assert counts["unreached_now"] == 0 and counts["escalated"] == 0 and counts["fine"] == 1


def _run_sim(minutes, monkeypatch, t=None):
    from app.state import state
    t = t or [state.clock.real_now()]
    monkeypatch.setattr(state.clock, "_now", lambda: t[0])
    for _ in range(minutes):
        t[0] += state.clock.real_delta(1)
        with Session(engine) as s:
            sync_tick(s)
    return t


def test_rounds_summary_counts_outcomes_and_escalations(client, monkeypatch):
    assert client.get("/api/rounds").json() == []
    client.post("/api/sim/heat", json=HEATWAVE)
    created = client.post("/api/sim/round", json={"round_no": 1}).json()["created"]
    t = _run_sim(5, monkeypatch)
    early = client.get("/api/rounds").json()[0]
    assert early["round_no"] == 1 and early["called"] == created
    assert early["called_real"] == 1 and early["called_simulated"] == created - 1
    assert early["in_progress"] > 0
    _run_sim(240, monkeypatch, t)  # lost Twilio callbacks take ~75 s real per attempt to close
    r = client.get("/api/rounds").json()[0]
    o = r["outcomes"]
    # Kamala's call is never answered here (place_call is faked), so she ends UNREACHED.
    assert r["in_progress"] == 0
    assert sum(o.values()) == created
    assert o["GREEN"] > 300 and o["UNREACHED"] >= 1
    assert r["red_cases"] >= 1 and r["accepted"] >= 1
    assert r["accept_wait_median_min"] is not None and 0 < r["accept_wait_median_min"] <= r["accept_wait_max_min"]
    assert r["overdue"] >= 1  # Kamala's case: nobody real accepted it


def test_rounds_are_separate_and_reset_clears_them(client, monkeypatch):
    client.post("/api/sim/heat", json=HEATWAVE)
    client.post("/api/sim/round", json={"round_no": 1})
    t = _run_sim(60, monkeypatch)
    client.post("/api/sim/round", json={"round_no": 2})
    _run_sim(60, monkeypatch, t)
    rounds = client.get("/api/rounds").json()
    assert [r["round_no"] for r in rounds] == [1, 2]
    assert all(r["called"] > 0 for r in rounds)
    client.post("/api/sim/reset")
    assert client.get("/api/rounds").json() == []

"""Impact panel: every number is counted from check-ins, cases and events, never typed in."""
from sqlmodel import Session, select

from app.db import current_run_id, engine
from app.escalation import accept_case, open_case, resolve_case
from app.models import CheckIn, Elder, Volunteer
from app.state import state

HEATWAVE = {"temp_c": 38, "humidity_pct": 40, "night_min_c": 27}


def checkin(s: Session, e: Elder, outcome: str | None, *, minutes: float = 0) -> CheckIn:
    at = state.clock.real_now() + state.clock.real_delta(minutes)
    c = CheckIn(run_id=current_run_id(), elder_id=e.id, round_no=1, is_simulated=e.is_simulated,
                started=True, processed=outcome is not None, outcome=outcome,
                classified_real=at if outcome else None, scheduled_for_real=at)
    s.add(c)
    s.flush()
    return c


def test_before_any_round_neralu_knows_nothing_more_than_a_broadcast(client):
    d = client.get("/api/impact").json()
    assert d["broadcast"] == {"alerted": d["residents"], "confirmed_safe": 0, "known_need_help": 0,
                              "reached_in_person": 0}
    assert d["neralu"]["called"] == 0 and d["round_started"] is False
    assert set(d["trace"]) >= {"called", "confirmed_safe", "needed_person", "accept_median_min"}


def test_counts_come_from_the_records(client):
    client.post("/api/sim/heat", json=HEATWAVE)
    with Session(engine, expire_on_commit=False) as s:
        es = list(s.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.cognitive_flag == False)))[:6]  # noqa: E712
        a, b, c, d, f, g = es
        vol = s.exec(select(Volunteer).where(Volunteer.run_id == current_run_id(),
                                             Volunteer.role == "volunteer")).first()
        checkin(s, a, "GREEN")                   # fine
        checkin(s, b, "AMBER")                   # needs a follow-up call
        checkin(s, c, "RED")                     # red, then a volunteer finds them safe
        rc = open_case(s, c.id, "red", "R3", "Symptoms and no water")
        accept_case(s, rc.id, vol.id)
        resolve_case(s, rc.id, vol.id, "safe_in_person", None)
        checkin(s, d, "UNREACHED")               # retry pending
        checkin(s, f, None)                      # call in progress
        checkin(s, g, "RED")                     # still waiting for a person
        open_case(s, g.id, "red", "R3", "Symptoms and no water")
        s.commit()
    n = client.get("/api/impact").json()["neralu"]
    assert n["called"] == 6
    assert n["confirmed_safe"] == 2 and n["follow_up"] == 1 and n["not_reached"] == 1
    assert n["in_progress"] == 1 and n["waiting_for_person"] == 1
    assert n["needed_person"] == 2 and n["reached_in_person"] == 1
    assert n["accept_median_min"] is not None and n["door_median_min"] is not None
    assert sum(n[k] for k in ("confirmed_safe", "follow_up", "not_reached", "in_progress",
                              "waiting_for_person")) == n["called"]  # every person called is in one group


def test_pilot_measures(client):
    client.post("/api/sim/heat", json=HEATWAVE)
    with Session(engine, expire_on_commit=False) as s:
        es = list(s.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.cognitive_flag == False)))[:3]  # noqa: E712
        start = state.clock.to_scenario(state.clock.real_now())
        to_noon = (start.replace(hour=12, minute=0, second=0) - start).total_seconds() / 60
        checkin(s, es[0], "GREEN")                          # safe before noon
        checkin(s, es[1], "GREEN", minutes=to_noon + 30)     # safe, but after noon
        checkin(s, es[2], "AMBER")
        checkin(s, es[2], "AMBER", minutes=30)               # concerning twice: repeat risk
        s.commit()
    p = client.get("/api/impact").json()["pilot"]
    assert p["safe_by_noon"]["n"] == 1 and p["safe_by_noon"]["of"] > 3
    assert p["repeat_risk"] == 1
    assert p["volunteer_load"] == {"responders": 0, "max": 0, "visits": 0}


def test_a_live_round_moves_the_numbers(client):
    client.post("/api/sim/heat", json=HEATWAVE)
    created = client.post("/api/sim/round", json={"round_no": 1}).json()["created"]
    d = client.get("/api/impact").json()
    assert created > 0 and d["round_started"] and d["neralu"]["called"] <= created

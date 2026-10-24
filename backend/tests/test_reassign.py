"""Volunteer availability and live reassignment: "Can't go" goes to the next nearest available responder,
and a case is never left with nobody asked."""
import random

from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id, engine
from app.escalation import accept_case, open_case
from app.models import Case, Elder, Event, Volunteer
from app.responders import ranked


def kamala(s: Session) -> Elder:
    return s.exec(select(Elder).where(Elder.name == "Kamala R.")).one()


def vols(s: Session, role: str = "volunteer") -> list[Volunteer]:
    return list(s.exec(select(Volunteer).where(Volunteer.run_id == current_run_id(), Volunteer.role == role)))


def new_case(s: Session, level: str = "red", elder: Elder | None = None) -> Case:
    case = open_case(s, (elder or kamala(s)).id, level, "E1", "No answer ×2")
    s.commit()
    return case


def fresh(s: Session, case_id: int) -> Case:
    s.expire_all()
    return s.get(Case, case_id)


def decline(client, case_id: int, v: Volunteer):
    return client.post(f"/api/cases/{case_id}/decline", json={"volunteer_token": v.token})


def test_cant_go_offers_the_case_to_the_next_nearest(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "alert_nearest", 1)
    with Session(engine, expire_on_commit=False) as s:
        case = new_case(s)
        order = [v for v in ranked(s, "volunteer", kamala(s))]
        first, second = order[0], order[1]
        assert case.alerted_ids == [first.id]
    assert decline(client, case.id, first).status_code == 200
    with Session(engine, expire_on_commit=False) as s:
        c = fresh(s, case.id)
        assert c.alerted_ids == [second.id] and c.declined_ids == [first.id] and c.state == "open"
        ev = s.exec(select(Event).where(Event.kind == "case_declined", Event.case_id == case.id)).one()
        assert ev.message.startswith(f"{first.name} can't go · now asking {second.name}")
    # the decliner sees it last, marked as declined, and can still change their mind
    mine = client.get("/api/volunteer/me", params={"token": first.token}).json()["cases"]
    assert mine[-1]["id"] == case.id and mine[-1]["declined_by_you"] and not mine[-1]["alerted_you"]
    theirs = client.get("/api/volunteer/me", params={"token": second.token}).json()["cases"]
    assert next(c for c in theirs if c["id"] == case.id)["alerted_you"] is True
    assert client.post(f"/api/cases/{case.id}/accept", json={"volunteer_token": first.token}).status_code == 200


def test_declining_twice_is_harmless_and_a_closed_case_cannot_be_declined(client):
    with Session(engine, expire_on_commit=False) as s:
        case = new_case(s)
        v = s.get(Volunteer, case.alerted_ids[0])
        other = next(x for x in vols(s) if x.id != v.id)
    decline(client, case.id, v)
    decline(client, case.id, v)
    with Session(engine, expire_on_commit=False) as s:
        assert fresh(s, case.id).declined_ids == [v.id]
        accept_case(s, case.id, other.id)
        s.commit()
    assert decline(client, case.id, other).status_code == 409


def test_when_every_volunteer_declines_it_moves_to_asha_then_the_officer(client):
    with Session(engine, expire_on_commit=False) as s:
        case = new_case(s)
        volunteers, ashas = vols(s), vols(s, "asha")
    for v in volunteers:
        decline(client, case.id, v)
    with Session(engine, expire_on_commit=False) as s:
        c = fresh(s, case.id)
        assert c.tier == "asha" and set(c.alerted_ids) <= {a.id for a in ashas} and c.alerted_ids
    for a in ashas:
        decline(client, case.id, a)
    with Session(engine, expire_on_commit=False) as s:
        c = fresh(s, case.id)
        assert c.overdue and c.state == "open"
        assert s.exec(select(Event).where(Event.kind == "tier_overdue", Event.case_id == case.id)).first()


def test_off_duty_hands_pending_alerts_on_and_hides_cases(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "alert_nearest", 1)
    with Session(engine, expire_on_commit=False) as s:
        case = new_case(s)
        v = s.get(Volunteer, case.alerted_ids[0])
    me = client.post("/api/volunteer/duty", json={"volunteer_token": v.token, "on_duty": False}).json()
    assert me["volunteer"]["on_duty"] is False and me["cases"] == []
    with Session(engine, expire_on_commit=False) as s:
        c = fresh(s, case.id)
        assert c.alerted_ids and v.id not in c.alerted_ids
        assert c.declined_ids in ([], None)  # off duty is not a refusal of this person
        second = new_case(s, "support")
        assert v.id not in second.alerted_ids  # new cases skip people off duty
    client.post("/api/volunteer/duty", json={"volunteer_token": v.token, "on_duty": True})
    assert client.get("/api/volunteer/me", params={"token": v.token}).json()["cases"]


def test_cannot_go_off_duty_while_holding_a_case(client):
    with Session(engine, expire_on_commit=False) as s:
        case = new_case(s)
        v = s.get(Volunteer, case.alerted_ids[0])
        accept_case(s, case.id, v.id)
        s.commit()
    res = client.post("/api/volunteer/duty", json={"volunteer_token": v.token, "on_duty": False})
    assert res.status_code == 409


def test_free_responders_are_asked_before_busy_ones(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "alert_nearest", 1)
    with Session(engine, expire_on_commit=False) as s:
        k = kamala(s)
        nearest = ranked(s, "volunteer", k)[0]
        other = s.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.id != k.id)).first()
        busy_case = new_case(s, "support", other)
        accept_case(s, busy_case.id, nearest.id)
        s.commit()
        case = new_case(s)
        assert case.alerted_ids != [nearest.id]


def test_responders_list_shows_duty_load_and_cases(client):
    with Session(engine, expire_on_commit=False) as s:
        case = new_case(s)
        asked = case.alerted_ids
        holder = s.get(Volunteer, asked[0])
        accept_case(s, case.id, holder.id)
        s.commit()
    rows = {r["id"]: r for r in client.get("/api/responders").json()}
    assert rows[holder.id]["load"] == 1 and rows[holder.id]["holding"][0]["elder"] == "Kamala R."
    assert len(rows) == 8 and all(r["on_duty"] for r in rows.values())


def test_no_open_case_is_ever_left_with_nobody_asked(client):
    """Random declines and duty changes over many cases: every open case at a responder tier always has
    someone asked, or is flagged to the ward officer."""
    rng = random.Random(7)
    with Session(engine, expire_on_commit=False) as s:
        elders = list(s.exec(select(Elder).where(Elder.run_id == current_run_id())))[:12]
        cases = [new_case(s, rng.choice(["red", "support"]), e) for e in elders]
        everyone = vols(s) + vols(s, "asha")
    for _ in range(80):
        v = rng.choice(everyone)
        if rng.random() < 0.25:
            client.post("/api/volunteer/duty", json={"volunteer_token": v.token, "on_duty": rng.random() < 0.5})
        else:
            decline(client, rng.choice(cases).id, v)
        with Session(engine, expire_on_commit=False) as s:
            for c in cases:
                c = fresh(s, c.id)
                if c.state == "open" and c.tier != "neighbour":
                    assert c.alerted_ids or c.overdue, (c.id, c.tier)


def test_simulated_volunteers_take_free_ones_first_and_finish_visits(client):
    from datetime import timedelta

    from app import sim_caller
    from app.state import state

    with Session(engine, expire_on_commit=False) as s:
        sims = list(s.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.is_simulated == True)))[:3]  # noqa: E712
        cases = [new_case(s, "support", e) for e in sims]
        later = state.clock.real_now() + timedelta(hours=1)
        for t in (later, later + timedelta(minutes=30)):  # first pass schedules the accept, second accepts
            sim_caller._auto_accept(s, t)
            s.commit()
        held = [fresh(s, c.id) for c in cases]
        assert all(c.state == "assigned" for c in held)
        assert len({c.assignee_id for c in held}) == 3  # three different free volunteers, not one
        sim_caller._finish_visits(s, later + timedelta(hours=3))
        s.commit()
        assert all(fresh(s, c.id).state == "resolved" for c in cases)
        assert fresh(s, cases[0].id).resolution == "support_delivered"

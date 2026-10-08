import threading
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app import calls
from app.calls import handle_call_ended
from app.db import engine
from app.escalation import (AlreadyAccepted, NotAllowed, accept_case, open_case, resolve_case,
                            sync_tick)
from app.models import Case, CheckIn, Elder, Event, Volunteer
from app.state import HEATWAVE, Weather, state
from seed.seed import seed_run


@pytest.fixture
def clock(monkeypatch):
    """Controllable real time; advance with clock.advance(scenario_minutes)."""
    class Fake:
        now = datetime(2026, 10, 9, 5, 25, tzinfo=timezone.utc)

        def advance(self, scenario_minutes):
            self.now += timedelta(seconds=state.clock.real_seconds(scenario_minutes))

    fake = Fake()
    monkeypatch.setattr(state.clock, "_now", lambda: fake.now)
    state.clock.reset()
    return fake


@pytest.fixture
def world(session, clock, monkeypatch):
    seed_run(session, "run-test", n_simulated=0)
    session.commit()
    state.weather = Weather(**HEATWAVE)
    placed = []
    monkeypatch.setattr(calls, "place_call", lambda to, cid: placed.append(cid) or f"CA{cid}")
    session.placed = placed
    return session


def kamala(s: Session) -> Elder:
    return s.exec(select(Elder).where(Elder.name == "Kamala R.")).one()


def priya(s: Session) -> Volunteer:
    return s.exec(select(Volunteer).where(Volunteer.name == "Priya")).one()


def kinds(s: Session, case_id=None) -> list[str]:
    q = select(Event).order_by(Event.id)
    if case_id:
        q = q.where(Event.case_id == case_id)
    return [e.kind for e in s.exec(q)]


def red_case(s: Session) -> Case:
    return s.exec(select(Case).where(Case.level == "red")).one()


def test_kamala_ignoring_two_calls_escalates_without_anyone_touching_it(world, clock):
    s = world
    calls.start_round(s, 1)
    sync_tick(s)                                   # attempt 1 placed
    assert len(s.placed) == 1
    handle_call_ended(s, s.placed[0], "no-answer"); s.commit()
    sync_tick(s)
    assert len(s.placed) == 1                      # retry waits RETRY_GAP_MIN
    clock.advance(15)
    sync_tick(s)                                   # attempt 2 placed
    assert len(s.placed) == 2
    handle_call_ended(s, s.placed[1], "no-answer"); s.commit()
    case = red_case(s)
    assert (case.level, case.tier, case.state, case.rule_id) == ("red", "volunteer", "open", "E1")
    assert case.reason == "No answer ×2"
    ks = kinds(s, case.id)
    assert ks[:3] == ["case_opened", "tier_skipped", "tier_alerted"]
    assert "family_notified" in ks
    skipped = s.exec(select(Event).where(Event.kind == "tier_skipped")).one()
    assert skipped.message == "No neighbour on file → skipped"


def test_neighbour_tier_first_when_on_file(world):
    s = world
    k = kamala(s)
    k.neighbour_phone = "+910000000000"
    case = open_case(s, k.id, "red", "R1", "Asked for help")
    assert case.tier == "neighbour"
    assert "tier_skipped" not in kinds(s, case.id)


def test_amber_then_amber_is_red(world, clock):
    s = world
    k = kamala(s)
    first = CheckIn(run_id="run-test", elder_id=k.id, round_no=1, started=True,
                    answers={"water": "no", "symptoms": "no", "room_hot": "no",
                             "fan_working": "yes", "orientation": "correct", "self_report": "ok"})
    s.add(first); s.commit()
    handle_call_ended(s, first.id, "completed"); s.commit()
    assert first.outcome == "AMBER"
    assert s.exec(select(Case)).all() == []
    recall = s.exec(select(CheckIn).where(CheckIn.is_recall == True)).one()  # noqa: E712
    assert "recall_scheduled" in kinds(s)
    clock.advance(30)
    sync_tick(s)
    assert recall.started
    recall.answers = {**first.answers}
    handle_call_ended(s, recall.id, "completed"); s.commit()
    case = red_case(s)
    assert (case.rule_id, case.reason) == ("E3", "Second concerning check-in")


def test_recall_unreached_after_retries_is_red(world, clock):
    s = world
    k = kamala(s)
    recall = CheckIn(run_id="run-test", elder_id=k.id, round_no=1, is_recall=True, started=True)
    s.add(recall); s.commit()
    handle_call_ended(s, recall.id, "no-answer"); s.commit()
    retry = s.exec(select(CheckIn).where(CheckIn.attempt == 2)).one()
    assert retry.is_recall
    handle_call_ended(s, retry.id, "busy"); s.commit()
    assert red_case(s).rule_id == "E3"


def test_e5_volunteer_then_asha_then_overdue_and_never_108(world, clock):
    s = world
    case = open_case(s, kamala(s).id, "red", "E1", "No answer ×2"); s.commit()
    clock.advance(14.9); sync_tick(s)
    assert case.tier == "volunteer"
    clock.advance(0.2); sync_tick(s)
    assert case.tier == "asha"
    clock.advance(15); sync_tick(s)
    assert case.overdue and case.state == "open"
    overdue = s.exec(select(Event).where(Event.kind == "tier_overdue")).one()
    assert overdue.message == "Ward officer action needed"
    clock.advance(60); sync_tick(s)
    assert len(s.exec(select(Event).where(Event.kind == "tier_overdue")).all()) == 1
    for ev in s.exec(select(Event)):
        assert "108" not in ev.message or ev.actor == "volunteer"


def test_support_case_does_not_advance(world, clock):
    s = world
    case = open_case(s, kamala(s).id, "support", "S1", "Room very hot and fan not working")
    s.commit()
    clock.advance(120); sync_tick(s)
    assert (case.tier, case.overdue) == ("volunteer", False)


def test_open_case_is_deduplicated(world):
    s = world
    a = open_case(s, kamala(s).id, "red", "R1", "Asked for help")
    b = open_case(s, kamala(s).id, "red", "R3", "Symptoms and no water")
    assert a.id == b.id


def test_concurrent_accept_exactly_one_wins(world):
    s = world
    case = open_case(s, kamala(s).id, "red", "E1", "No answer ×2"); s.commit()
    vols = [v.id for v in s.exec(select(Volunteer).where(Volunteer.role == "volunteer"))][:2]
    barrier = threading.Barrier(2)
    results = []

    def go(vid):
        with Session(engine) as own:
            barrier.wait()
            try:
                accept_case(own, case.id, vid)
                own.commit()
                results.append("ok")
            except AlreadyAccepted:
                results.append("lost")

    threads = [threading.Thread(target=go, args=(v,)) for v in vols]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == ["lost", "ok"]
    s.expire_all()
    assert s.get(Case, case.id).state == "assigned"
    assert len(s.exec(select(Event).where(Event.kind == "case_accepted")).all()) == 1


def test_accept_then_resolve_safe(world):
    s = world
    case = open_case(s, kamala(s).id, "red", "E1", "No answer ×2"); s.commit()
    p = priya(s)
    accept_case(s, case.id, p.id); s.commit()
    with pytest.raises(AlreadyAccepted):
        accept_case(s, case.id, p.id)
    resolve_case(s, case.id, p.id, "safe_in_person", None); s.commit()
    assert (case.state, case.resolution) == ("resolved", "safe_in_person")
    assert kinds(s, case.id)[-2:] == ["case_resolved", "family_notified"]


def test_only_assignee_can_resolve(world):
    s = world
    case = open_case(s, kamala(s).id, "red", "E1", "No answer ×2"); s.commit()
    vols = list(s.exec(select(Volunteer)))
    accept_case(s, case.id, vols[0].id); s.commit()
    with pytest.raises(NotAllowed):
        resolve_case(s, case.id, vols[1].id, "safe_in_person", None)


def test_not_found_escalate_reopens_at_next_tier(world):
    s = world
    case = open_case(s, kamala(s).id, "red", "E1", "No answer ×2"); s.commit()
    p = priya(s)
    accept_case(s, case.id, p.id); s.commit()
    resolve_case(s, case.id, p.id, "not_found_escalate", "No one at the door"); s.commit()
    assert (case.state, case.tier, case.assignee_id) == ("open", "asha", None)
    asha = s.exec(select(Volunteer).where(Volunteer.role == "asha")).first()
    accept_case(s, case.id, asha.id); s.commit()
    resolve_case(s, case.id, asha.id, "not_found_escalate", None); s.commit()
    assert case.overdue and case.state == "open"


def test_called_108_is_only_a_human_resolution(world):
    s = world
    case = open_case(s, kamala(s).id, "red", "R1", "Asked for help"); s.commit()
    p = priya(s)
    accept_case(s, case.id, p.id); s.commit()
    resolve_case(s, case.id, p.id, "called_108", None); s.commit()
    ev = s.exec(select(Event).where(Event.kind == "case_resolved")).one()
    assert ev.actor == "volunteer" and "Called 108" in ev.message

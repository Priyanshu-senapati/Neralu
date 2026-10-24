"""SimulatedCaller: resolves check-ins for the ~400 seeded residents (all events labelled simulated).

Their answers go through the same rules and escalation as a real call. Simulated RED/support
cases are accepted by a simulated volunteer after 3–12 scenario minutes (a free one if there is one)
and the visit is recorded 20–45 minutes later, which frees them. Never the demo persona's case,
which only a real person can accept.
"""
import random

from sqlmodel import Session, select

from app.calls import handle_call_ended
from app.db import current_run_id
from app.escalation import accept_case, resolve_case
from app.models import Case, CheckIn, Elder, Volunteer
from app.responders import load
from app.state import state

RESOLVE_WINDOW_MIN = (1.0, 40.0)
SIM_ACCEPT_MIN = (3.0, 12.0)
SIM_VISIT_MIN = (20.0, 45.0)  # a simulated volunteer's visit, door to recorded outcome

FINE = {"water": "yes", "symptoms": "no", "room_hot": "no", "fan_working": "yes",
        "orientation": "correct", "self_report": "ok"}
SCENARIOS = {  # name: (weight %, answers or None for no answer)
    "green": (86, FINE),
    "amber_water": (3, {**FINE, "water": "no"}),
    "amber_day": (3, {**FINE, "orientation": "wrong"}),
    "support": (3, {**FINE, "room_hot": "yes", "fan_working": "no"}),
    "unreached_then_answers": (4, None),
    "red": (1, {**FINE, "symptoms": "yes", "water": "no"}),
}
RECALL_FINE = 0.8  # share of follow-up calls that come back fine; the rest are still short of water
# A caregiver answering about a person with memory difficulty (simulation weights, not data)
CG_FINE = {"seen": "yes", "water": "yes", "unwell": "no", "room_no_cooling": "no", "self_report": "ok"}
CG_SCENARIOS = {
    "green": (84, CG_FINE),
    "not_seen": (5, {**CG_FINE, "seen": "no", "water": "none", "unwell": "none"}),
    "no_water": (4, {**CG_FINE, "water": "no"}),
    "support": (2, {**CG_FINE, "room_no_cooling": "yes"}),
    "unreached_then_answers": (4, None),
    "unwell": (1, {**CG_FINE, "unwell": "yes"}),
}


def _rng(c: CheckIn, stream: str = "answers") -> random.Random:
    # Separate streams: sharing one seed made the outcome and the resolve time use the same first
    # draw, so every non-green outcome landed in the last few minutes of the round.
    return random.Random(f"{c.run_id}-{c.id}-{stream}")


def _answers_for(c: CheckIn) -> dict | None:
    rng = _rng(c)
    fine, scenarios = (CG_FINE, CG_SCENARIOS) if c.callee == "caregiver" else (FINE, SCENARIOS)
    if c.is_recall:
        return fine if rng.random() < RECALL_FINE else {**fine, "water": "no"}
    if c.attempt > 1:
        return fine  # "unreached, then answers" on the retry
    names = list(scenarios)
    name = rng.choices(names, weights=[scenarios[n][0] for n in names])[0]
    return scenarios[name][1]


def _start_due(session: Session, now) -> None:
    due = session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.is_simulated == True,  # noqa: E712
        CheckIn.started == False, CheckIn.scheduled_for_real <= now))  # noqa: E712
    for c in due:
        c.started = True
        c.call_status = "queued"
        lo, hi = RESOLVE_WINDOW_MIN if c.attempt == 1 and not c.is_recall else (1.0, 5.0)
        c.sim_resolve_at_real = now + state.clock.real_delta(_rng(c, "timing").uniform(lo, hi))


def _resolve_due(session: Session, now) -> None:
    due = list(session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.is_simulated == True,  # noqa: E712
        CheckIn.processed == False, CheckIn.sim_resolve_at_real != None,  # noqa: E711, E712
        CheckIn.sim_resolve_at_real <= now)))
    for c in due:
        answers = _answers_for(c)
        if answers is None:
            handle_call_ended(session, c.id, "no-answer")
        else:
            c.answers = dict(answers)
            handle_call_ended(session, c.id, "completed")


def _auto_accept(session: Session, now) -> None:
    cases = list(session.exec(select(Case).where(
        Case.run_id == current_run_id(), Case.state == "open")))
    for case in cases:
        elder = session.get(Elder, case.elder_id)
        if not elder.is_simulated:
            continue  # the demo persona's case is never auto-accepted
        rng = random.Random(f"{case.run_id}-case-{case.id}-{case.tier}")
        if case.sim_accept_at_real is None:
            case.sim_accept_at_real = now + state.clock.real_delta(rng.uniform(*SIM_ACCEPT_MIN))
            continue
        if case.sim_accept_at_real > now:
            continue
        role = "asha" if case.tier == "asha" else "volunteer"
        pool = list(session.exec(select(Volunteer).where(
            Volunteer.run_id == current_run_id(), Volunteer.role == role, Volunteer.on_duty == True,  # noqa: E712
            Volunteer.is_simulated == True)))  # noqa: E712
        pool = [v for v in pool if v.id not in (case.declined_ids or [])]
        if not pool:
            continue  # nobody simulated left to go: the case waits for a person or the next tier
        # Whoever is free goes, those asked first; if everyone is on a visit, the least busy takes it.
        busy = load(session)
        asked = [v for v in pool if v.id in (case.alerted_ids or [])]
        free = [v for v in asked if not busy[v.id]] or [v for v in pool if not busy[v.id]]
        least = min(busy[v.id] for v in pool)
        vol = rng.choice(free or [v for v in pool if busy[v.id] == least])
        accept_case(session, case.id, vol.id)
        case.sim_visit_done_real = now + state.clock.real_delta(rng.uniform(*SIM_VISIT_MIN))


def _finish_visits(session: Session, now) -> None:
    """Simulated volunteers record what they found when their visit is done, which frees them."""
    cases = list(session.exec(select(Case).where(
        Case.run_id == current_run_id(), Case.state == "assigned",
        Case.sim_visit_done_real != None, Case.sim_visit_done_real <= now)))  # noqa: E711
    for case in cases:
        if not session.get(Volunteer, case.assignee_id).is_simulated:
            continue
        resolve_case(session, case.id, case.assignee_id,
                     "support_delivered" if case.level == "support" else "safe_in_person", None)


def step_simulation(session: Session) -> None:
    now = state.clock.real_now()
    _start_due(session, now)
    session.flush()
    _resolve_due(session, now)
    session.flush()
    _finish_visits(session, now)
    session.flush()
    _auto_accept(session, now)

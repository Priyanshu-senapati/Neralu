"""SimulatedCaller: resolves check-ins for the ~400 seeded residents (all events labelled simulated).

Their answers go through the same rules and escalation as a real call. Simulated RED/support
cases are accepted by a simulated volunteer after 3–12 scenario minutes — never the demo
persona's case, which only a real person can accept.
"""
import random

from sqlmodel import Session, select

from app.calls import handle_call_ended
from app.db import current_run_id
from app.escalation import accept_case
from app.models import Case, CheckIn, Elder, Volunteer
from app.state import state

RESOLVE_WINDOW_MIN = (1.0, 40.0)
SIM_ACCEPT_MIN = (3.0, 12.0)

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


def _rng(c: CheckIn, stream: str = "answers") -> random.Random:
    # Separate streams: sharing one seed made the outcome and the resolve time use the same first
    # draw, so every non-green outcome landed in the last few minutes of the round.
    return random.Random(f"{c.run_id}-{c.id}-{stream}")


def _answers_for(c: CheckIn) -> dict | None:
    rng = _rng(c)
    if c.is_recall:
        return FINE if rng.random() < 0.8 else {**FINE, "water": "no"}
    if c.attempt > 1:
        return FINE  # "unreached, then answers" on the retry
    names = list(SCENARIOS)
    name = rng.choices(names, weights=[SCENARIOS[n][0] for n in names])[0]
    return SCENARIOS[name][1]


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
            Volunteer.run_id == current_run_id(), Volunteer.role == role,
            Volunteer.is_simulated == True)))  # noqa: E712
        accept_case(session, case.id, rng.choice(pool).id)


def step_simulation(session: Session) -> None:
    now = state.clock.real_now()
    _start_due(session, now)
    session.flush()
    _resolve_due(session, now)
    session.flush()
    _auto_accept(session, now)

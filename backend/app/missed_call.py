"""Missed-call check-in: a person, or their family, gives a missed call to the Neralu number and Neralu
calls back at once with the usual check. Familiar in India and free for the caller: Neralu never
answers the incoming call, it rejects it, so nothing is charged.

The callback is an ordinary check-in, so the same rules, retries and escalation apply; an unanswered
callback is followed up like any other. Only numbers already registered get a callback, at most one
per person every COOLDOWN_MIN minutes, so the number cannot be used to make Neralu dial anyone else.
"""
import re
from dataclasses import dataclass

from sqlmodel import Session, select

from app.calls import callee_for, callee_phone
from app.db import current_run_id
from app.events import log_event
from app.models import CheckIn, Elder
from app.state import state
from seed.seed import FICTIONAL_PHONE

COOLDOWN_MIN = 30  # scenario minutes between callbacks for one person


@dataclass
class Result:
    outcome: str  # "calling" | "sooner" | "in_progress" | "cooldown" | "unknown"
    elder_ids: list[int]


def _digits(number: str | None) -> str:
    return re.sub(r"\D", "", number or "")[-10:]


def match(session: Session, number: str | None) -> list[tuple[Elder, str]]:
    """Registered people this number belongs to, each with who rang: "elder" or "family".
    A family member may look after more than one person; each gets a check."""
    key = _digits(number)
    if len(key) < 10 or key == _digits(FICTIONAL_PHONE):  # the demo's placeholder is nobody's number
        return []
    found: list[tuple[Elder, str]] = []
    for e in session.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.is_simulated == False)):  # noqa: E712
        if _digits(e.phone) == key:
            found.append((e, "elder"))
        elif _digits(e.family_phone) == key:
            found.append((e, "family"))
    return found


def _recent_callback(session: Session, elder_id: int) -> bool:
    since = state.clock.real_now() - state.clock.real_delta(COOLDOWN_MIN)
    last = session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.elder_id == elder_id, CheckIn.requested == True)  # noqa: E712
        .order_by(CheckIn.id.desc())).first()
    if last is None:
        return False
    t = last.scheduled_for_real
    if t.tzinfo is None and since.tzinfo is not None:
        t = t.replace(tzinfo=since.tzinfo)  # SQLite hands datetimes back without a zone
    return t >= since


def call_back(session: Session, elder: Elder, who: str, *, simulated: bool = False) -> str:
    """Book an immediate check call for this person. Returns what happened."""
    first = elder.name.split()[0]
    by = elder.name if who == "elder" else f"{elder.name}'s family"
    tag = " (simulated, demo phone)" if simulated else ""
    pending = session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.elder_id == elder.id,
        CheckIn.processed == False).order_by(CheckIn.id)).first()  # noqa: E712
    if pending is not None and pending.started:
        outcome, msg = "in_progress", f"Missed call from {by}{tag} · a call to {first} is already under way"
    elif pending is not None:
        pending.scheduled_for_real = state.clock.real_now()  # a call was booked for later: make it now
        session.add(pending)
        outcome, msg = "sooner", f"Missed call from {by}{tag} · the booked call to {first} brought forward to now"
    elif _recent_callback(session, elder.id):
        outcome, msg = "cooldown", (f"Missed call from {by}{tag} · {first} was called back in the last "
                                    f"{COOLDOWN_MIN} min, not again yet")
    else:
        callee = callee_for(elder)
        c = CheckIn(run_id=current_run_id(), elder_id=elder.id, round_no=state.round_no or 1, attempt=1,
                    requested=True, callee=callee, is_simulated=elder.is_simulated,
                    scheduled_for_real=state.clock.real_now())
        if not callee_phone(elder, c):
            outcome, msg = "unknown", f"Missed call from {by}{tag} · no number on file to call back"
        else:
            session.add(c)
            outcome, msg = "calling", f"Missed call from {by}{tag} · calling {first} back now"
    log_event(session, "missed_call", msg, actor="elder" if who == "elder" else "family", elder_id=elder.id,
              # A registered person, not a simulated resident: always in the ward feed. A demo-phone
              # missed call says so in its message and data.
              data={"from": who, "outcome": outcome, "simulated": simulated})
    return outcome


def handle(session: Session, number: str | None, *, simulated: bool = False) -> Result:
    found = match(session, number)
    if not found:
        # The number itself is not kept: it belongs to someone who has not registered.
        log_event(session, "missed_call", "Missed call from an unregistered number · not called back",
                  actor="system", data={"outcome": "unknown"}, simulated=simulated)
        session.commit()
        return Result("unknown", [])
    outcomes = [call_back(session, e, who, simulated=simulated) for e, who in found]
    session.commit()
    best = next((o for o in ("calling", "sooner", "in_progress", "cooldown") if o in outcomes), "unknown")
    return Result(best, [e.id for e, _ in found])


def demo_missed_call(session: Session) -> Result:
    """The browser phone's "Give Neralu a missed call": from the demo persona's own phone."""
    kamala = session.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.name == "Kamala R.",
                                              Elder.is_simulated == False)).first()  # noqa: E712
    if kamala is None:
        return Result("unknown", [])
    outcome = call_back(session, kamala, "elder", simulated=True)
    session.commit()
    return Result(outcome, [kamala.id])

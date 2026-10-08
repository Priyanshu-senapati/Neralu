"""Cases and human escalation tiers (plan §7.2 E2, E4–E6).

The system never calls 108. Only a human records "called 108" as a resolution.
"""
from sqlalchemy import update
from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id
from app.events import log_event
from app.geo import km
from app.models import RESOLUTIONS, Case, Elder, Volunteer
from app.notify import notify_family, notify_neighbour
from app.state import state

NEXT_TIER = {"neighbour": "volunteer", "volunteer": "asha"}
TIER_LABEL = {"neighbour": "Neighbour", "volunteer": "Volunteer", "asha": "ASHA worker"}
RESOLUTION_LABEL = {
    "safe_in_person": "Safe — confirmed in person",
    "support_delivered": "Needs support — delivered water/ORS",
    "called_108": "Called 108",
    "not_found_escalate": "Couldn't reach — escalate",
}


class AlreadyAccepted(Exception):
    pass


class NotAllowed(Exception):
    pass


def active_case(session: Session, elder_id: int, level: str) -> Case | None:
    return session.exec(select(Case).where(
        Case.run_id == current_run_id(), Case.elder_id == elder_id, Case.level == level,
        Case.state.in_(("open", "assigned")))).first()


def _alert_tier(session: Session, case: Case, elder: Elder, *, how: str = "") -> None:
    case.tier_started_real = state.clock.real_now()
    if case.tier == "neighbour":
        notify_neighbour(session, elder, f"Please check on {elder.name} now.", case_id=case.id)
        msg = "Neighbour alerted"
    else:
        role = "asha" if case.tier == "asha" else "volunteer"
        on_duty = list(session.exec(select(Volunteer).where(
            Volunteer.run_id == current_run_id(), Volunteer.role == role, Volunteer.on_duty)))
        ranked = sorted(on_duty, key=lambda v: (km(v.lat, v.lng, elder.lat, elder.lng), v.id))
        nearest = ranked[:max(1, get_settings().alert_nearest)]
        case.alerted_ids = [v.id for v in nearest]
        if nearest and len(nearest) < len(on_duty):
            far = km(nearest[-1].lat, nearest[-1].lng, elder.lat, elder.lng)
            msg = (f"{TIER_LABEL[case.tier]} tier alerted · {len(nearest)} nearest of {len(on_duty)} on duty"
                   f" (within {far:g} km)")
        else:
            msg = f"{TIER_LABEL[case.tier]} tier alerted · {len(on_duty)} on duty"
    log_event(session, "tier_alerted", msg + how, actor="system", elder_id=elder.id,
              case_id=case.id, data={"tier": case.tier}, simulated=elder.is_simulated)


def open_case(session: Session, elder_id: int, level: str, rule_id: str, reason: str) -> Case:
    """Open a case, or return the existing active one of the same level for this elder."""
    existing = active_case(session, elder_id, level)
    if existing:
        return existing
    elder = session.get(Elder, elder_id)
    if level == "red":
        tier = "neighbour" if elder.neighbour_phone else "volunteer"
    else:
        tier = "volunteer"  # E4: support cases stay in the volunteer queue
    now = state.clock.real_now()
    case = Case(run_id=current_run_id(), elder_id=elder_id, level=level, rule_id=rule_id,
                reason=reason, tier=tier, tier_started_real=now, opened_real=now)
    session.add(case)
    session.flush()
    label = "RED" if level == "red" else "Needs support"
    source = f"Escalated by {rule_id}" if rule_id.startswith("E") else f"Rule {rule_id}"
    log_event(session, "case_opened", f"{label} case opened · {source} · {reason}",
              actor="rules", elder_id=elder_id, case_id=case.id,
              data={"level": level, "rule_id": rule_id, "reason": reason},
              simulated=elder.is_simulated)
    if level == "red" and tier == "volunteer":
        log_event(session, "tier_skipped", "No neighbour on file → skipped", actor="system",
                  elder_id=elder_id, case_id=case.id, data={"tier": "neighbour"},
                  simulated=elder.is_simulated)
    _alert_tier(session, case, elder)
    if level == "red":
        notify_family(session, elder, f"Neralu could not confirm {elder.name} is safe "
                      f"({reason}). Someone from the area is being informed.", case_id=case.id)
    return case


def _advance(session: Session, case: Case, elder: Elder, *, why: str) -> None:
    nxt = NEXT_TIER.get(case.tier)
    if nxt is None:
        case.overdue = True
        log_event(session, "tier_overdue", "Ward officer action needed", actor="system",
                  elder_id=elder.id, case_id=case.id, data={"tier": case.tier},
                  simulated=elder.is_simulated)
        return
    case.tier = nxt
    _alert_tier(session, case, elder, how=f" · {why}")


def accept_case(session: Session, case_id: int, volunteer_id: int) -> Case:
    """Atomic compare-and-set: exactly one acceptor wins; others get AlreadyAccepted."""
    result = session.exec(
        update(Case).where(Case.id == case_id, Case.state == "open")
        .values(state="assigned", assignee_id=volunteer_id)
    )
    if result.rowcount != 1:
        raise AlreadyAccepted()
    session.flush()
    case = session.get(Case, case_id)
    session.refresh(case)
    vol = session.get(Volunteer, volunteer_id)
    elder = session.get(Elder, case.elder_id)
    waited = state.clock.scenario_minutes_since(case.tier_started_real)
    log_event(session, "case_accepted", f"{vol.name} accepted · waited {waited:.0f} min",
              actor="volunteer", elder_id=case.elder_id, case_id=case.id,
              data={"volunteer_id": vol.id, "volunteer": vol.name, "waited_min": round(waited, 1)},
              simulated=vol.is_simulated)
    return case


def resolve_case(session: Session, case_id: int, volunteer_id: int, resolution: str,
                 note: str | None) -> Case:
    if resolution not in RESOLUTIONS:
        raise ValueError(f"Unknown resolution {resolution}")
    case = session.get(Case, case_id)
    if case is None or case.state != "assigned" or case.assignee_id != volunteer_id:
        raise NotAllowed()
    vol = session.get(Volunteer, volunteer_id)
    elder = session.get(Elder, case.elder_id)
    label = RESOLUTION_LABEL[resolution]
    data = {"volunteer": vol.name, "resolution": resolution, "note": note}
    if resolution == "not_found_escalate":
        # E6: reopen at the next tier (or mark overdue at the last one)
        log_event(session, "case_resolved", f"{vol.name}: {label}" + (f" · {note}" if note else ""),
                  actor="volunteer", elder_id=elder.id, case_id=case.id, data=data,
                  simulated=vol.is_simulated)
        case.state, case.assignee_id = "open", None
        _advance(session, case, elder, why="E6 · couldn't reach")
        notify_family(session, elder, f"A volunteer could not reach {elder.name}. "
                      "The case has been passed on.", case_id=case.id)
        return case
    case.state = "resolved"
    case.resolution, case.resolution_note = resolution, note
    case.resolved_real = state.clock.real_now()
    log_event(session, "case_resolved", f"{vol.name}: {label}" + (f" · {note}" if note else ""),
              actor="volunteer", elder_id=elder.id, case_id=case.id, data=data,
              simulated=vol.is_simulated)
    notify_family(session, elder, f"Update on {elder.name}: {label}.", case_id=case.id)
    return case


def check_ack_timeouts(session: Session) -> None:
    """E5: a red case not accepted within ACK_TIMEOUT_MIN advances a tier; at ASHA it goes overdue."""
    limit = state.clock.real_delta(get_settings().ack_timeout_min)
    now = state.clock.real_now()
    cases = session.exec(select(Case).where(
        Case.run_id == current_run_id(), Case.level == "red", Case.state == "open",
        Case.overdue == False))  # noqa: E712
    for case in cases:
        if now - case.tier_started_real >= limit:
            elder = session.get(Elder, case.elder_id)
            mins = get_settings().ack_timeout_min
            _advance(session, case, elder, why=f"E5 · not accepted in {mins:g} min")


def sync_tick(session: Session) -> None:
    """One scheduler step: due calls and retries/recalls, simulated residents, ack timeouts."""
    from app.calls import cancel_unanswered_calls, close_lost_calls, dispatch_due_calls
    from app.sim_caller import step_simulation

    from app import browser_phone

    dispatch_due_calls(session)
    if get_settings().telephony_mode == "browser":
        browser_phone.tick(session)  # ring timeout and idle hang-up for the browser phone
    else:
        cancel_unanswered_calls(session)  # Twilio: enforce the ring timeout ourselves
        close_lost_calls(session)  # Twilio: never leave a call stuck on a lost callback
    step_simulation(session)
    check_ack_timeouts(session)
    session.commit()


async def tick(session: Session) -> None:
    sync_tick(session)

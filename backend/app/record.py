"""A case record the ward office can print or save: what triggered the case, every call and its
answers, the rule that decided, how it escalated, who accepted, how it closed and what the family
was told. Built only from what Neralu logged; nothing is summarised or rewritten by a model.

Like the console, it never shows a phone number, and shows the address only once someone accepted.
"""
from typing import Any

from sqlmodel import Session

from app.escalation import RESOLUTION_LABEL, TIER_LABEL
from app.events import event_out, run_events
from app.models import Case, CheckIn, Elder, Volunteer
from app.rules import DECIDED_BY, explain
from app.state import state
from app.views import _scenario, checkin_out, data_source, elder_checkins, risk_detail

ESCALATION_KINDS = ("case_opened", "tier_alerted", "tier_skipped", "tier_overdue",
                    "case_declined", "case_accepted", "case_resolved")


def trigger_checkin(checkins: list[CheckIn], case: Case) -> CheckIn | None:
    """The last classified call at or before the case opened: the one whose answers opened it."""
    before = [c for c in checkins if c.processed and c.classified_real is not None
              and _naive(c.classified_real) <= _naive(case.opened_real)]
    return before[-1] if before else None


def _naive(dt):
    return dt.replace(tzinfo=None)


def case_record(session: Session, case: Case) -> dict[str, Any]:
    e = session.get(Elder, case.elder_id)
    checkins = elder_checkins(session, e.id)
    trigger = trigger_checkin(checkins, case)
    events = run_events(session, elder_id=e.id)
    escalation = [event_out(ev) for ev in events if ev.case_id == case.id and ev.kind in ESCALATION_KINDS]
    accepted = next((ev for ev in escalation if ev["kind"] == "case_accepted"), None)
    vol = session.get(Volunteer, case.assignee_id) if case.assignee_id else None
    source = data_source(e)
    return {
        "case_id": case.id, "run_id": case.run_id,
        "generated_scenario": state.clock.scenario_now().isoformat(timespec="seconds"),
        "demo_clock": state.clock.speed != 1,
        "level": case.level, "state": case.state, "tier": case.tier, "overdue": case.overdue,
        "person": {
            "name": e.name, "age": e.age, "language": e.language, "lives_alone": e.lives_alone,
            "family_name": e.family_name, "is_simulated": e.is_simulated, "source": source["kind"],
            "source_label": source["label"],
            "caregiver_route": e.cognitive_flag and bool(e.family_phone),
            # Same rule as the console: the address only once someone has accepted a visit.
            "address": e.address if case.assignee_id is not None else None,
            **risk_detail(e),
        },
        "trigger": {
            "opened_scenario": _scenario(case.opened_real), "rule_id": case.rule_id, "reason": case.reason,
            "rule_explanation": explain(case.rule_id), "decided_by": DECIDED_BY,
            "checkin_id": trigger.id if trigger else None,
        },
        "calls": [checkin_out(c) for c in checkins],
        "escalation": escalation,
        "acceptance": None if vol is None else {
            "name": vol.name, "role": TIER_LABEL.get(vol.role, vol.role.title()),
            "is_simulated": vol.is_simulated,
            "accepted_scenario": accepted["ts_scenario"] if accepted else None,
        },
        "closure": None if case.state != "resolved" else {
            "resolution": case.resolution, "label": RESOLUTION_LABEL.get(case.resolution, case.resolution),
            "note": case.resolution_note, "resolved_scenario": _scenario(case.resolved_real),
        },
        "family_told": [event_out(ev) for ev in events if ev.kind == "family_notified"],
    }

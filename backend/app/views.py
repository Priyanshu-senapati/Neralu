"""Read models for the API (plan §6.3). Addresses and phones are never in list views."""
from typing import Any

from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id
from app.events import event_out, run_events, scenario_iso
from app.models import Case, CheckIn, Elder
from app.risk import calls_due, personal_threshold_c, vulnerability_score
from app.state import state

ACTIVE_CASE_STATES = ("open", "assigned")


def _scenario(dt) -> str | None:
    return scenario_iso(state.clock.to_scenario(dt)) if dt else None


def latest_checkins(session: Session) -> dict[int, CheckIn]:
    """Most recent check-in per elder in this run (by id: later attempts have later ids)."""
    rows = session.exec(select(CheckIn).where(CheckIn.run_id == current_run_id()).order_by(CheckIn.id))
    return {c.elder_id: c for c in rows}


def active_cases(session: Session) -> dict[int, Case]:
    """The most urgent active case per elder (red before support)."""
    rows = session.exec(select(Case).where(Case.run_id == current_run_id(),
                                           Case.state.in_(ACTIVE_CASE_STATES)).order_by(Case.id))
    out: dict[int, Case] = {}
    for c in rows:
        if c.elder_id not in out or (c.level == "red" and out[c.elder_id].level != "red"):
            out[c.elder_id] = c
    return out


def due_count(elder: Elder) -> int:
    w = state.weather
    return calls_due(elder, w.heat_index_c, w.night_min_c)


def latest_out(c: CheckIn | None) -> dict[str, Any]:
    if c is None:
        return {"outcome": None, "rule_id": None, "reason": None, "attempt": None,
                "at_scenario": None, "needs_support": False, "call_status": None,
                "round_no": None}
    return {"outcome": c.outcome, "rule_id": c.rule_id, "reason": c.reason, "attempt": c.attempt,
            "at_scenario": _scenario(c.classified_real or c.scheduled_for_real),
            "needs_support": c.needs_support, "call_status": c.call_status,
            "round_no": c.round_no}


def case_brief(c: Case | None) -> dict[str, Any] | None:
    if c is None:
        return None
    return {"id": c.id, "level": c.level, "tier": c.tier, "state": c.state,
            "opened_scenario": _scenario(c.opened_real), "overdue": c.overdue,
            "tier_started_scenario": _scenario(c.tier_started_real),
            "rule_id": c.rule_id, "reason": c.reason}


def elder_item(e: Elder, latest: CheckIn | None, case: Case | None) -> dict[str, Any]:
    score, breakdown = vulnerability_score(e)
    return {
        "id": e.id, "name": e.name, "age": e.age, "language": e.language,
        "lives_alone": e.lives_alone, "roof_type": e.roof_type, "risk_score": score,
        "risk_factors": [label for label, _ in breakdown],
        "caregiver_route": e.cognitive_flag, "due_calls": due_count(e),
        "has_neighbour": e.neighbour_phone is not None,
        "lat": e.lat, "lng": e.lng, "is_simulated": e.is_simulated,
        "latest": latest_out(latest), "open_case": case_brief(case),
    }


def run_elders(session: Session) -> list[Elder]:
    return list(session.exec(select(Elder).where(Elder.run_id == current_run_id()).order_by(Elder.id)))


def elder_items(session: Session) -> list[dict[str, Any]]:
    latest, cases = latest_checkins(session), active_cases(session)
    return [elder_item(e, latest.get(e.id), cases.get(e.id)) for e in run_elders(session)]


def risk_detail(e: Elder) -> dict[str, Any]:
    score, breakdown = vulnerability_score(e)
    w = state.weather
    return {"risk_breakdown": [[label, pts] for label, pts in breakdown],
            "threshold_c": personal_threshold_c(score, w.night_min_c),
            "heat_index_c": w.heat_index_c, "night_min_c": w.night_min_c}


def checkin_out(c: CheckIn) -> dict[str, Any]:
    return {"id": c.id, "round_no": c.round_no, "attempt": c.attempt, "is_recall": c.is_recall,
            "call_status": c.call_status, "answers": c.answers or {}, "transcript": c.transcript,
            "recording_url": f"/api/recordings/{c.id}" if c.recording_url else None,
            "outcome": c.outcome, "rule_id": c.rule_id, "reason": c.reason,
            "needs_support": c.needs_support, "is_simulated": c.is_simulated,
            "at_scenario": _scenario(c.classified_real or c.scheduled_for_real)}


def elder_checkins(session: Session, elder_id: int) -> list[CheckIn]:
    return list(session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.elder_id == elder_id).order_by(CheckIn.id)))


def elder_detail(session: Session, e: Elder, *, reveal_address: bool | None = None) -> dict[str, Any]:
    latest = latest_checkins(session).get(e.id)
    case = active_cases(session).get(e.id)
    if reveal_address is None:
        reveal_address = case is not None and case.state == "assigned"
    item = elder_item(e, latest, case)
    item.update(risk_detail(e))
    item.update({"address": e.address if reveal_address else None,
                 "code_word": e.code_word, "family_name": e.family_name})
    item["checkins"] = [checkin_out(c) for c in elder_checkins(session, e.id)]
    item["events"] = [event_out(ev) for ev in run_events(session, elder_id=e.id)]
    return item


def case_detail(session: Session, case: Case, *, reveal_address: bool | None = None) -> dict[str, Any]:
    e = session.get(Elder, case.elder_id)
    if reveal_address is None:
        reveal_address = case.state == "assigned"
    elder = elder_item(e, latest_checkins(session).get(e.id), active_cases(session).get(e.id))
    elder.update(risk_detail(e))
    elder["address"] = e.address if reveal_address else None
    return {
        "id": case.id, "level": case.level, "state": case.state, "tier": case.tier,
        "overdue": case.overdue, "rule_id": case.rule_id, "reason": case.reason,
        "opened_scenario": _scenario(case.opened_real),
        "tier_started_scenario": _scenario(case.tier_started_real),
        "resolved_scenario": _scenario(case.resolved_real),
        "resolution": case.resolution, "resolution_note": case.resolution_note,
        "assignee_id": case.assignee_id, "elder": elder,
        "checkins": [checkin_out(c) for c in elder_checkins(session, e.id)],
        "events": [event_out(ev) for ev in run_events(session, elder_id=e.id)],
    }


def summary(session: Session) -> dict[str, Any]:
    s = get_settings()
    elders = run_elders(session)
    latest, cases = latest_checkins(session), active_cases(session)
    counts = {"registered": len(elders), "due_today": 0, "fine": 0, "follow_up": 0,
              "escalated": 0, "unreached_now": 0, "support": 0}
    for e in elders:
        if due_count(e) > 0:
            counts["due_today"] += 1
        case = cases.get(e.id)
        outcome = latest[e.id].outcome if e.id in latest else None
        if case and case.level == "red":
            counts["escalated"] += 1
        elif outcome == "GREEN":
            counts["fine"] += 1
        elif outcome == "AMBER":
            counts["follow_up"] += 1
        elif outcome == "UNREACHED":
            counts["unreached_now"] += 1
    counts["support"] = sum(1 for c in session.exec(select(Case).where(
        Case.run_id == current_run_id(), Case.level == "support",
        Case.state.in_(ACTIVE_CASE_STATES))))
    return {
        "run_id": current_run_id(),
        "scenario_now": scenario_iso(state.clock.scenario_now()),
        "demo_speed": s.demo_speed, "max_attempts": s.max_attempts,
        "weather": state.weather.as_dict(), "round_no": state.round_no, "counts": counts,
    }

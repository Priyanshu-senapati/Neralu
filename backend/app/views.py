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
    """Most recent *classified* check-in per elder in this run (later attempts have later ids)."""
    rows = session.exec(select(CheckIn).where(CheckIn.run_id == current_run_id(),
                                              CheckIn.processed == True).order_by(CheckIn.id))  # noqa: E712
    return {c.elder_id: c for c in rows}


def pending_checkins(session: Session) -> dict[int, CheckIn]:
    """The earliest not-yet-classified check-in per elder (a call in progress or scheduled)."""
    rows = session.exec(select(CheckIn).where(CheckIn.run_id == current_run_id(),
                                              CheckIn.processed == False).order_by(CheckIn.id.desc()))  # noqa: E712
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


def last_resolutions(session: Session) -> dict[int, Case]:
    rows = session.exec(select(Case).where(Case.run_id == current_run_id(), Case.state == "resolved")
                        .order_by(Case.resolved_real))
    return {c.elder_id: c for c in rows}


def resolution_out(c: Case | None) -> dict[str, Any] | None:
    if c is None:
        return None
    return {"case_id": c.id, "level": c.level, "resolution": c.resolution,
            "resolved_scenario": _scenario(c.resolved_real)}


def resolved_after_latest(resolved: Case | None, latest: CheckIn | None) -> bool:
    """A human resolution newer than the last classified call supersedes that call's outcome."""
    return resolved is not None and (latest is None or latest.classified_real is None
                                     or resolved.resolved_real >= latest.classified_real)


def due_count(elder: Elder) -> int:
    w = state.weather
    return calls_due(elder, w.heat_index_c, w.night_min_c)


def latest_out(c: CheckIn | None) -> dict[str, Any]:
    if c is None:
        return {"outcome": None, "rule_id": None, "reason": None, "attempt": None,
                "at_scenario": None, "needs_support": False, "call_status": None}
    return {"outcome": c.outcome, "rule_id": c.rule_id, "reason": c.reason, "attempt": c.attempt,
            "at_scenario": _scenario(c.classified_real), "needs_support": c.needs_support,
            "call_status": c.call_status}


def current_call_out(c: CheckIn | None) -> dict[str, Any] | None:
    if c is None:
        return None
    return {"checkin_id": c.id, "attempt": c.attempt, "is_recall": c.is_recall,
            "started": c.started, "call_status": c.call_status, "round_no": c.round_no,
            "scheduled_scenario": _scenario(c.scheduled_for_real)}


def case_brief(c: Case | None) -> dict[str, Any] | None:
    if c is None:
        return None
    return {"id": c.id, "level": c.level, "tier": c.tier, "state": c.state,
            "opened_scenario": _scenario(c.opened_real), "overdue": c.overdue,
            "tier_started_scenario": _scenario(c.tier_started_real),
            "rule_id": c.rule_id, "reason": c.reason}


def elder_item(e: Elder, latest: CheckIn | None, case: Case | None,
               pending: CheckIn | None = None, resolved: Case | None = None) -> dict[str, Any]:
    score, breakdown = vulnerability_score(e)
    return {
        "id": e.id, "name": e.name, "age": e.age, "language": e.language,
        "lives_alone": e.lives_alone, "roof_type": e.roof_type, "risk_score": score,
        "risk_factors": [label for label, _ in breakdown],
        "caregiver_route": e.cognitive_flag, "due_calls": due_count(e),
        "has_neighbour": e.neighbour_phone is not None,
        "lat": e.lat, "lng": e.lng, "is_simulated": e.is_simulated,
        "latest": latest_out(latest), "current_call": current_call_out(pending),
        "open_case": case_brief(case),
        "last_resolution": resolution_out(resolved) if resolved_after_latest(resolved, latest) else None,
    }


def run_elders(session: Session) -> list[Elder]:
    return list(session.exec(select(Elder).where(Elder.run_id == current_run_id()).order_by(Elder.id)))


def elder_items(session: Session) -> list[dict[str, Any]]:
    latest, cases, pending = latest_checkins(session), active_cases(session), pending_checkins(session)
    resolved = last_resolutions(session)
    return [elder_item(e, latest.get(e.id), cases.get(e.id), pending.get(e.id), resolved.get(e.id))
            for e in run_elders(session)]


def elder_item_one(session: Session, e: Elder) -> dict[str, Any]:
    checkins = elder_checkins(session, e.id)
    latest = next((c for c in reversed(checkins) if c.processed), None)
    pending = next((c for c in checkins if not c.processed), None)
    cases = [c for c in session.exec(select(Case).where(
        Case.elder_id == e.id, Case.state.in_(ACTIVE_CASE_STATES))).all()]
    case = next((c for c in cases if c.level == "red"), cases[0] if cases else None)
    resolved = session.exec(select(Case).where(Case.elder_id == e.id, Case.state == "resolved")
                            .order_by(Case.resolved_real.desc())).first()
    return elder_item(e, latest, case, pending, resolved)


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
            "at_scenario": _scenario(c.classified_real or c.scheduled_for_real),
            "classified": c.processed}


def elder_checkins(session: Session, elder_id: int) -> list[CheckIn]:
    return list(session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.elder_id == elder_id).order_by(CheckIn.id)))


def elder_detail(session: Session, e: Elder, *, reveal_address: bool | None = None) -> dict[str, Any]:
    item = elder_item_one(session, e)
    case = item["open_case"]
    if reveal_address is None:
        reveal_address = case is not None and case["state"] == "assigned"
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
    elder = elder_item_one(session, e)
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
    latest, cases, resolved = latest_checkins(session), active_cases(session), last_resolutions(session)
    counts = {"registered": len(elders), "due_today": 0, "fine": 0, "follow_up": 0,
              "escalated": 0, "unreached_now": 0, "support": 0}
    for e in elders:
        if due_count(e) > 0:
            counts["due_today"] += 1
        case = cases.get(e.id)
        outcome = latest[e.id].outcome if e.id in latest else None
        r = resolved.get(e.id)
        if not case and resolved_after_latest(r, latest.get(e.id)):
            outcome = "GREEN" if r.resolution in ("safe_in_person", "support_delivered") else None
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

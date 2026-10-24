"""Read models for the API (plan §6.3). Addresses and phones are never in list views."""
from typing import Any

from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id
from app.events import event_out, run_events, scenario_iso
from app.models import Case, CheckIn, Elder, Volunteer
from app.risk import calls_due, personal_threshold_c, vulnerability_score
from app.rules import DECIDED_BY, explain
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
    # resolved_real can be missing on an object loaded earlier in the same request while the scheduler
    # resolved the case in between (the session keeps its first copy); treat it as not yet resolved.
    if resolved is None or resolved.resolved_real is None:
        return False
    return latest is None or latest.classified_real is None or resolved.resolved_real >= latest.classified_real


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
    return {"checkin_id": c.id, "attempt": c.attempt, "is_recall": c.is_recall, "requested": c.requested,
            "callee": c.callee,
            "started": c.started, "call_status": c.call_status, "round_no": c.round_no,
            "scheduled_scenario": _scenario(c.scheduled_for_real)}


def volunteer_names(session: Session) -> dict[int, str]:
    return {v.id: v.name for v in session.exec(select(Volunteer).where(Volunteer.run_id == current_run_id()))}


def case_brief(c: Case | None, assignee_name: str | None = None) -> dict[str, Any] | None:
    if c is None:
        return None
    return {"id": c.id, "level": c.level, "tier": c.tier, "state": c.state,
            "opened_scenario": _scenario(c.opened_real), "overdue": c.overdue,
            "tier_started_scenario": _scenario(c.tier_started_real),
            "rule_id": c.rule_id, "reason": c.reason, "assignee_name": assignee_name}


def data_source(e: Elder) -> dict[str, str]:
    """Where a person's risk factors came from, so the console never passes off made-up data as real."""
    if e.is_simulated:
        return {"kind": "simulated", "label": "Simulated resident: generated for the demo ward"}
    if e.name == "Kamala R." and e.address.endswith("(demo)"):  # the seeded demo persona (seed.kamala)
        return {"kind": "demo", "label": "Demo persona: details written for the demo, real phone"}
    return {"kind": "family", "label": "Family registration form"}


def shown_position(e: Elder) -> tuple[float, float]:
    """Where a person's dot goes in shared views. Real people (registered or the demo persona) are
    placed to about 100 m, never their exact point: the exact location goes only to the volunteer
    who accepted their visit (the Maps link). Simulated residents are fictional and kept as seeded."""
    if e.is_simulated:
        return e.lat, e.lng
    return round(e.lat, 3), round(e.lng, 3)


def elder_item(e: Elder, latest: CheckIn | None, case: Case | None,
               pending: CheckIn | None = None, resolved: Case | None = None,
               names: dict[int, str] | None = None) -> dict[str, Any]:
    score, breakdown = vulnerability_score(e)
    lat, lng = shown_position(e)
    return {
        "id": e.id, "name": e.name, "age": e.age, "language": e.language,
        "lives_alone": e.lives_alone, "roof_type": e.roof_type, "risk_score": score,
        "risk_factors": [label for label, _ in breakdown],
        "threshold_c": personal_threshold_c(score, state.weather.night_min_c),
        "caregiver_route": e.cognitive_flag and bool(e.family_phone), "due_calls": due_count(e),
        "has_neighbour": e.neighbour_phone is not None,
        "lat": lat, "lng": lng, "is_simulated": e.is_simulated,
        "latest": latest_out(latest), "current_call": current_call_out(pending),
        "open_case": case_brief(case, (names or {}).get(case.assignee_id) if case else None),
        "source": data_source(e)["kind"],
        "last_resolution": resolution_out(resolved) if resolved_after_latest(resolved, latest) else None,
    }


def public_household(e: Elder) -> dict[str, Any]:
    """One home as the public story page shows it. Simulated residents and the demo persona are
    fictional, so they keep their details. A family-registered person is a real person: no name,
    age or health details, and their dot placed only to about 1 km."""
    score, breakdown = vulnerability_score(e)
    source = data_source(e)["kind"]
    real = source == "family"
    lat, lng = (round(e.lat, 2), round(e.lng, 2)) if real else shown_position(e)
    return {"id": e.id, "name": None if real else e.name, "age": None if real else e.age,
            "risk_score": score, "risk_factors": [] if real else [label for label, _ in breakdown],
            "is_simulated": e.is_simulated, "source": source, "lat": lat, "lng": lng}


def public_households(session: Session) -> list[dict[str, Any]]:
    return [public_household(e) for e in run_elders(session)]


def run_elders(session: Session) -> list[Elder]:
    return list(session.exec(select(Elder).where(Elder.run_id == current_run_id()).order_by(Elder.id)))


def elder_items(session: Session) -> list[dict[str, Any]]:
    latest, cases, pending = latest_checkins(session), active_cases(session), pending_checkins(session)
    resolved, names = last_resolutions(session), volunteer_names(session)
    return [elder_item(e, latest.get(e.id), cases.get(e.id), pending.get(e.id), resolved.get(e.id), names)
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
    names = {}
    if case is not None and case.assignee_id is not None:
        v = session.get(Volunteer, case.assignee_id)
        names = {v.id: v.name} if v else {}
    return elder_item(e, latest, case, pending, resolved, names)


def risk_detail(e: Elder) -> dict[str, Any]:
    score, breakdown = vulnerability_score(e)
    w = state.weather
    return {"risk_breakdown": [[label, pts] for label, pts in breakdown],
            "threshold_c": personal_threshold_c(score, w.night_min_c),
            "heat_index_c": w.heat_index_c, "night_min_c": w.night_min_c,
            "risk_source": data_source(e)["label"],
            "weather_source": ("Live forecast for Bengaluru (Open-Meteo)" if w.source == "open-meteo"
                               else "Simulated heat preset")}


def checkin_out(c: CheckIn) -> dict[str, Any]:
    return {"id": c.id, "round_no": c.round_no, "attempt": c.attempt, "is_recall": c.is_recall,
            "requested": c.requested, "callee": c.callee,
            "call_status": c.call_status, "answers": c.answers or {}, "transcript": c.transcript,
            "recording_url": f"/api/recordings/{c.id}" if c.recording_url else None,
            "outcome": c.outcome, "rule_id": c.rule_id, "reason": c.reason,
            "rule_explanation": explain(c.rule_id),
            "needs_support": c.needs_support, "is_simulated": c.is_simulated, "language": c.language,
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
    # Never the code word: it only protects the person if the household alone knows it. The call
    # plays it, and the family sees it once when they choose it (the registration response).
    item.update({"address": e.address if reveal_address else None, "family_name": e.family_name})
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
        "rule_explanation": explain(case.rule_id), "decided_by": DECIDED_BY,
        "opened_scenario": _scenario(case.opened_real),
        "tier_started_scenario": _scenario(case.tier_started_real),
        "resolved_scenario": _scenario(case.resolved_real),
        "resolution": case.resolution, "resolution_note": case.resolution_note,
        "assignee_id": case.assignee_id, "elder": elder,
        "checkins": [checkin_out(c) for c in elder_checkins(session, e.id)],
        "events": [event_out(ev) for ev in run_events(session, elder_id=e.id)],
    }


HELPED_RESOLUTIONS = ("safe_in_person", "support_delivered", "called_108")


def impact(session: Session) -> dict[str, int]:
    """Human outcomes, not system state: who was actually checked on and who a person reached."""
    run = current_run_id()
    answered = list(session.exec(select(CheckIn).where(
        CheckIn.run_id == run, CheckIn.processed == True,  # noqa: E712
        CheckIn.outcome.in_(("GREEN", "AMBER", "RED")))))
    helped = session.exec(select(Case.elder_id).where(
        Case.run_id == run, Case.state == "resolved",
        Case.resolution.in_(HELPED_RESOLUTIONS))).all()
    return {"checks_completed": len(answered),
            "people_checked": len({c.elder_id for c in answered}),
            "people_helped": len(set(helped))}


def pilot_info(session: Session) -> dict[str, Any]:
    from app.pilot import calls_until, has_todays_forecast, next_round, round_times, started_rounds

    now = state.clock.scenario_now()
    nxt = next_round(now, started_rounds(session))
    return {"day": state.run_day.isoformat() if state.run_day else None,
            "round_times": [at.strftime("%H:%M") for _, at in round_times()],
            "calls_until": calls_until().strftime("%H:%M"),
            "next_round": nxt.strftime("%H:%M") if nxt else None,
            "forecast_loaded": has_todays_forecast()}


def summary(session: Session) -> dict[str, Any]:
    s = get_settings()
    elders = run_elders(session)
    latest, cases, resolved = latest_checkins(session), active_cases(session), last_resolutions(session)
    counts = {"registered": len(elders), "due_today": 0, "fine": 0, "follow_up": 0,
              "escalated": 0, "unreached_now": 0, "support": 0,
              "calls_active": sum(1 for c in pending_checkins(session).values() if c.started)}
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
        "impact": impact(session),
        "run_id": current_run_id(),
        "scenario_now": scenario_iso(state.clock.scenario_now()),
        "demo_speed": state.clock.speed, "max_attempts": s.max_attempts,
        "run_mode": s.run_mode, "pilot": pilot_info(session) if s.run_mode == "pilot" else None,
        "weather": state.weather.as_dict(), "round_no": state.round_no, "counts": counts,
        "telephony_mode": s.telephony_mode,
    }

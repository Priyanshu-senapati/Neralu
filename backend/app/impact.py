"""Impact panel: the same heat day as a broadcast alert would leave it, and as Neralu leaves it.

Every number is counted from this run's check-ins, cases and event log; nothing is typed in.
A broadcast reaches everyone and confirms nothing, so its column is what a one-way alert can know.
"""
from datetime import time
from statistics import median
from typing import Any

from sqlmodel import Session, select

from app.db import current_run_id
from app.events import scenario_iso
from app.models import Case, CheckIn, Event
from app.state import state
from app.views import active_cases, due_count, last_resolutions, latest_checkins, resolved_after_latest, run_elders

SAFE_RESOLUTIONS = ("safe_in_person", "support_delivered")
HELPED_RESOLUTIONS = ("safe_in_person", "support_delivered", "called_108")
NOON = time(12, 0)

# How each number is counted, shown next to it so anyone can trace it.
TRACE = {
    "called": "people with at least one call placed (check-ins started)",
    "confirmed_safe": "last call answered and fine (rule R9) with no open case, or a volunteer recorded "
                      "them safe in person after their last call",
    "follow_up": "last call needed a follow-up call (AMBER) and nobody has seen them since",
    "needed_person": "people with a case opened (RED, or needing water / a fan)",
    "reached_in_person": "cases resolved by a person at the door (safe, support delivered or called 108)",
    "waiting_for_person": "cases still open or accepted, not yet resolved",
    "not_reached": "last call not answered and no case yet (a retry is pending)",
    "caregiver_route": "people checked through their caregiver (memory difficulty)",
    "accept_median_min": "median minutes from a case opening to the case_accepted event",
    "door_median_min": "median minutes from a case opening to a person recording the visit",
    "safe_by_noon": "people due a call who were confirmed safe by 12:00 (scenario time)",
    "repeat_risk": "people with two or more concerning results today (AMBER, RED, not reached, or a case)",
    "volunteer_load": "visits each responder recorded or holds now (from case_accepted events)",
}


def _minutes(real_delta) -> float:
    return real_delta.total_seconds() * state.clock.speed / 60


def _med(xs: list[float]) -> float | None:
    return round(median(xs), 1) if xs else None


def impact(session: Session) -> dict[str, Any]:
    run = current_run_id()
    elders = run_elders(session)
    simulated = {e.id: e.is_simulated for e in elders}
    due = [e for e in elders if due_count(e) > 0]
    latest, active, resolved = latest_checkins(session), active_cases(session), last_resolutions(session)
    checkins = list(session.exec(select(CheckIn).where(CheckIn.run_id == run).order_by(CheckIn.id)))
    cases = list(session.exec(select(Case).where(Case.run_id == run).order_by(Case.id)))
    accepted = session.exec(select(Event).where(Event.run_id == run, Event.kind == "case_accepted")
                            .order_by(Event.id)).all()

    called = {c.elder_id for c in checkins if c.started or c.processed}
    status: dict[int, str] = {}
    for eid in called | {c.elder_id for c in cases}:
        last, case, done = latest.get(eid), active.get(eid), resolved.get(eid)
        if case:
            status[eid] = "waiting_for_person"
        elif resolved_after_latest(done, last) and done.resolution in SAFE_RESOLUTIONS:
            status[eid] = "confirmed_safe"
        elif last is None:
            status[eid] = "in_progress"
        elif last.outcome == "GREEN":
            status[eid] = "confirmed_safe"
        elif last.outcome == "AMBER":
            status[eid] = "follow_up"
        elif last.outcome == "UNREACHED":
            status[eid] = "not_reached"
        else:
            status[eid] = "in_progress"

    def count(s: str) -> int:
        return sum(1 for v in status.values() if v == s)

    first_accept: dict[int, Any] = {}
    for ev in accepted:
        first_accept.setdefault(ev.case_id, ev)
    accept_waits = [_minutes(first_accept[c.id].ts_real - c.opened_real) for c in cases if c.id in first_accept]
    helped = [c for c in cases if c.state == "resolved" and c.resolution in HELPED_RESOLUTIONS]
    door = [_minutes(c.resolved_real - c.opened_real) for c in helped if c.resolved_real]
    red_door = [_minutes(c.resolved_real - c.opened_real) for c in helped if c.level == "red" and c.resolved_real]

    # Pilot measures
    def safe_at(eid: int):
        """When this person was first confirmed safe today (a fine call, or a safe visit)."""
        times = [c.classified_real for c in checkins if c.elder_id == eid and c.outcome == "GREEN"
                 and not c.needs_support and c.classified_real]  # a hot room with no fan is not safe yet
        times += [c.resolved_real for c in cases if c.elder_id == eid and c.resolution in SAFE_RESOLUTIONS
                  and c.resolved_real]
        return min(times) if times else None

    callable_due = due  # everyone due is called, people with memory difficulty through their caregiver
    by_noon = sum(1 for e in callable_due
                  if (t := safe_at(e.id)) is not None and state.clock.to_scenario(t).time() <= NOON)
    concerning: dict[int, int] = {}
    for c in checkins:
        if c.processed and c.outcome in ("AMBER", "RED", "UNREACHED"):
            concerning[c.elder_id] = concerning.get(c.elder_id, 0) + 1
    for c in cases:
        concerning[c.elder_id] = concerning.get(c.elder_id, 0) + 1
    visits: dict[str, int] = {}
    for ev in first_accept.values():
        name = (ev.data or {}).get("volunteer", "?")
        visits[name] = visits.get(name, 0) + 1

    return {
        "as_of_scenario": scenario_iso(state.clock.scenario_now()),
        "weather": state.weather.as_dict(),
        "residents": len(elders),
        "due": len(due),
        "round_started": state.round_no is not None or bool(checkins),
        "broadcast": {"alerted": len(elders), "confirmed_safe": 0, "known_need_help": 0, "reached_in_person": 0},
        "neralu": {
            "called": len(called),
            "called_real": sum(1 for e in called if not simulated.get(e, True)),
            "confirmed_safe": count("confirmed_safe"),
            "follow_up": count("follow_up"),
            "not_reached": count("not_reached"),
            "in_progress": count("in_progress"),
            "needed_person": len({c.elder_id for c in cases}),
            "reached_in_person": len({c.elder_id for c in helped}),
            "waiting_for_person": count("waiting_for_person"),
            "caregiver_route": len({c.elder_id for c in checkins if c.callee == "caregiver"}),
            "accept_median_min": _med(accept_waits),
            "door_median_min": _med(door),
        },
        "pilot": {
            "safe_by_noon": {"n": by_noon, "of": len(callable_due)},
            "red_to_door_median_min": _med(red_door),
            "repeat_risk": sum(1 for n in concerning.values() if n >= 2),
            "volunteer_load": {"responders": len(visits), "max": max(visits.values(), default=0),
                               "visits": sum(visits.values())},
        },
        "trace": TRACE,
        "simulated_note": "Counts include the demo ward's simulated residents and volunteers; "
                          "real calls are counted in called_real.",
    }

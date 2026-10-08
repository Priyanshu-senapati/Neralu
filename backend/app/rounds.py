"""Per-round summary for the dashboard's "Past rounds" view (current run only)."""
from statistics import median
from typing import Any

from sqlmodel import Session, select

from app.db import current_run_id
from app.events import scenario_iso
from app.models import Case, CheckIn, Elder, Event
from app.state import state

OUTCOMES = ("GREEN", "AMBER", "RED", "UNREACHED")


def _round_starts(session: Session) -> list[tuple[int, Event]]:
    """(round_no, round_started event) in order; a repeated round start keeps the first."""
    rows = session.exec(select(Event).where(Event.run_id == current_run_id(),
                                            Event.kind == "round_started").order_by(Event.id))
    seen: dict[int, Event] = {}
    for ev in rows:
        seen.setdefault(int(ev.data.get("round_no", 0)), ev)
    return sorted(seen.items(), key=lambda kv: kv[1].id)


def _minutes(real_delta) -> float:
    return real_delta.total_seconds() * state.clock.speed / 60


def round_summaries(session: Session) -> list[dict[str, Any]]:
    run = current_run_id()
    starts = _round_starts(session)
    simulated = {e.id: e.is_simulated for e in session.exec(select(Elder).where(Elder.run_id == run))}
    checkins = list(session.exec(select(CheckIn).where(CheckIn.run_id == run).order_by(CheckIn.id)))
    cases = list(session.exec(select(Case).where(Case.run_id == run).order_by(Case.id)))
    accepted_at: dict[int, Any] = {}
    for ev in session.exec(select(Event).where(Event.run_id == run, Event.kind == "case_accepted")
                           .order_by(Event.id)):
        accepted_at.setdefault(ev.case_id, ev.ts_real)

    out = []
    for i, (round_no, start_ev) in enumerate(starts):
        window_start = start_ev.ts_real
        window_end = starts[i + 1][1].ts_real if i + 1 < len(starts) else None

        mine = [c for c in checkins if c.round_no == round_no]
        by_elder: dict[int, list[CheckIn]] = {}
        for c in mine:
            by_elder.setdefault(c.elder_id, []).append(c)
        outcomes = dict.fromkeys(OUTCOMES, 0)
        in_progress = 0
        for rows in by_elder.values():
            if any(not c.processed for c in rows):
                in_progress += 1  # a call, retry or recall for this person is still pending
                continue
            final = rows[-1].outcome
            if final in outcomes:
                outcomes[final] += 1

        in_window = [c for c in cases if c.opened_real >= window_start
                     and (window_end is None or c.opened_real < window_end)]
        waits = [_minutes(accepted_at[c.id] - c.opened_real) for c in in_window if c.id in accepted_at]
        resolutions: dict[str, int] = {}
        for c in in_window:
            if c.resolution:
                resolutions[c.resolution] = resolutions.get(c.resolution, 0) + 1

        out.append({
            "round_no": round_no,
            "started_scenario": start_ev.ts_scenario,
            "called": len(by_elder),
            "called_real": sum(1 for e in by_elder if not simulated.get(e, True)),
            "called_simulated": sum(1 for e in by_elder if simulated.get(e, True)),
            "caregiver_route": int(start_ev.data.get("caregiver_route", 0)),
            "outcomes": outcomes,
            "in_progress": in_progress,
            "red_cases": sum(1 for c in in_window if c.level == "red"),
            "support_cases": sum(1 for c in in_window if c.level == "support"),
            "accepted": len(waits),
            "accept_wait_median_min": round(median(waits), 1) if waits else None,
            "accept_wait_max_min": round(max(waits), 1) if waits else None,
            "overdue": sum(1 for c in in_window if c.overdue),
            "resolutions": resolutions,
            "as_of_scenario": scenario_iso(state.clock.scenario_now()),
        })
    return out

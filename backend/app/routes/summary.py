from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.officer import require_officer
from app.rules import DECIDED_BY, EXPLANATIONS
from app.rounds import round_summaries
from app.status import system_status
from app.state import state
from app.views import scenario_iso, summary

router = APIRouter(prefix="/api")
OFFICER = Depends(require_officer)  # console only


@router.get("/summary", dependencies=[OFFICER])
def get_summary(session: Session = Depends(get_session)) -> dict:
    return summary(session)


@router.get("/impact", dependencies=[OFFICER])
def get_impact(session: Session = Depends(get_session)) -> dict:
    """Broadcast alert against Neralu for today's run, counted from check-ins, cases and events."""
    from app.impact import impact
    return impact(session)


@router.get("/clock")
def get_clock() -> dict:
    """The scenario clock, for pages without sign-in (the volunteer's phone)."""
    return {"scenario_now": scenario_iso(state.clock.scenario_now()), "demo_speed": state.clock.speed}


@router.get("/rules")
def get_rules() -> dict:
    """The full published rule book, so the dashboard can show why any outcome happened."""
    return {"decided_by": DECIDED_BY,
            "rules": [{"id": k, "explanation": v} for k, v in EXPLANATIONS.items()]}


@router.get("/events", dependencies=[OFFICER])
def get_events(limit: int = 40, session: Session = Depends(get_session)) -> list[dict]:
    """Ward activity, newest first. Simulated residents' routine call events are left out so the
    feed shows what an officer would act on: real calls, cases, escalations and officer actions."""
    from sqlmodel import select

    from app.db import current_run_id
    from app.events import event_out
    from app.models import Event

    rows = session.exec(select(Event).where(
        Event.run_id == current_run_id(),
        (Event.simulated == False) | Event.kind.in_(("case_opened", "case_resolved", "tier_overdue", "case_declined", "volunteer_duty")),  # noqa: E712
    ).order_by(Event.id.desc()).limit(min(limit, 200))).all()
    return [event_out(e) for e in rows]


@router.get("/rounds", dependencies=[OFFICER])
def get_rounds(session: Session = Depends(get_session)) -> list[dict]:
    """One summary per round in the current run (cleared by a reset)."""
    return round_summaries(session)


@router.get("/status", dependencies=[OFFICER])
def get_status(fresh: bool = False) -> dict:
    """Everything a live call depends on, checked by evidence. Cached ~30 s; ?fresh=1 rechecks now."""
    return system_status(fresh)

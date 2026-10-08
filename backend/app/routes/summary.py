from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.rules import DECIDED_BY, EXPLANATIONS
from app.views import summary

router = APIRouter(prefix="/api")


@router.get("/summary")
def get_summary(session: Session = Depends(get_session)) -> dict:
    return summary(session)


@router.get("/rules")
def get_rules() -> dict:
    """The full published rule book, so the dashboard can show why any outcome happened."""
    return {"decided_by": DECIDED_BY,
            "rules": [{"id": k, "explanation": v} for k, v in EXPLANATIONS.items()]}


@router.get("/events")
def get_events(limit: int = 40, session: Session = Depends(get_session)) -> list[dict]:
    """Ward activity, newest first. Simulated residents' routine call events are left out so the
    feed shows what an officer would act on: real calls, cases, escalations and officer actions."""
    from sqlmodel import select

    from app.db import current_run_id
    from app.events import event_out
    from app.models import Event

    rows = session.exec(select(Event).where(
        Event.run_id == current_run_id(),
        (Event.simulated == False) | Event.kind.in_(("case_opened", "case_resolved", "tier_overdue")),  # noqa: E712
    ).order_by(Event.id.desc()).limit(min(limit, 200))).all()
    return [event_out(e) for e in rows]

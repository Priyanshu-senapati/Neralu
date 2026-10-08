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

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.rounds import round_summaries
from app.views import summary

router = APIRouter(prefix="/api")


@router.get("/summary")
def get_summary(session: Session = Depends(get_session)) -> dict:
    return summary(session)


@router.get("/rounds")
def get_rounds(session: Session = Depends(get_session)) -> list[dict]:
    """One summary per round in the current run (cleared by a reset)."""
    return round_summaries(session)

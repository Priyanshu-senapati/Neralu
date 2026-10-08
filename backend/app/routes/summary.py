from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.views import summary

router = APIRouter(prefix="/api")


@router.get("/summary")
def get_summary(session: Session = Depends(get_session)) -> dict:
    return summary(session)

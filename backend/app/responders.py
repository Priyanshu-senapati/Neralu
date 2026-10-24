"""Responders (volunteers and ASHA workers): who is on duty, how busy they are, and who to ask next."""
from collections import Counter

from sqlmodel import Session, select

from app.db import current_run_id
from app.geo import km
from app.models import Case, Elder, Volunteer


def load(session: Session) -> Counter[int]:
    """Cases each responder holds right now (accepted, not yet resolved)."""
    rows = session.exec(select(Case.assignee_id).where(
        Case.run_id == current_run_id(), Case.state == "assigned"))
    return Counter(a for a in rows if a is not None)


def ranked(session: Session, role: str, elder: Elder, exclude: set[int] = frozenset()) -> list[Volunteer]:
    """On-duty responders of a role, free ones first, then nearest. `exclude`: already asked or declined."""
    busy = load(session)
    on_duty = session.exec(select(Volunteer).where(
        Volunteer.run_id == current_run_id(), Volunteer.role == role, Volunteer.on_duty == True))  # noqa: E712
    return sorted((v for v in on_duty if v.id not in exclude),
                  key=lambda v: (busy[v.id] > 0, km(v.lat, v.lng, elder.lat, elder.lng), v.id))


def on_duty_count(session: Session, role: str) -> int:
    return len(session.exec(select(Volunteer.id).where(
        Volunteer.run_id == current_run_id(), Volunteer.role == role, Volunteer.on_duty == True)).all())  # noqa: E712

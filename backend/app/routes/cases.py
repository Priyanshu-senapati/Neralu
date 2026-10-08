import math

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import current_run_id, get_session
from app.escalation import AlreadyAccepted, NotAllowed, accept_case, resolve_case
from app.models import RESOLUTIONS, Case, Elder, Volunteer
from app.views import case_brief, case_detail, elder_item_one

router = APIRouter(prefix="/api")


class AcceptIn(BaseModel):
    volunteer_token: str


class ResolveIn(BaseModel):
    volunteer_token: str
    resolution: str
    note: str | None = Field(default=None, max_length=300)


def _volunteer(session: Session, token: str) -> Volunteer:
    v = session.exec(select(Volunteer).where(Volunteer.run_id == current_run_id(),
                                             Volunteer.token == token)).first()
    if v is None:
        raise HTTPException(401, "Unknown volunteer link")
    return v


def _case(session: Session, case_id: int) -> Case:
    c = session.get(Case, case_id)
    if c is None or c.run_id != current_run_id():
        raise HTTPException(404, "Not found")
    return c


def _km(lat1, lng1, lat2, lng2) -> float:
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2)
    return round(12742 * math.asin(math.sqrt(a)), 1)


def case_list_item(session: Session, c: Case) -> dict:
    e = session.get(Elder, c.elder_id)
    return {**case_brief(c), "elder": elder_item_one(session, e)}


@router.get("/cases")
def list_cases(state: str = "open,assigned", session: Session = Depends(get_session)) -> list[dict]:
    states = [s for s in state.split(",") if s]
    rows = session.exec(select(Case).where(Case.run_id == current_run_id(),
                                           Case.state.in_(states)).order_by(Case.id))
    return [case_list_item(session, c) for c in rows]


@router.get("/cases/{case_id}")
def get_case(case_id: int, session: Session = Depends(get_session)) -> dict:
    return case_detail(session, _case(session, case_id))


@router.post("/cases/{case_id}/accept")
def accept(case_id: int, body: AcceptIn, session: Session = Depends(get_session)):
    v = _volunteer(session, body.volunteer_token)
    _case(session, case_id)
    try:
        case = accept_case(session, case_id, v.id)
    except AlreadyAccepted:
        return JSONResponse({"error": "already_accepted"}, status_code=409)
    session.commit()
    return volunteer_case(session, case, v)


@router.post("/cases/{case_id}/resolve")
def resolve(case_id: int, body: ResolveIn, session: Session = Depends(get_session)):
    v = _volunteer(session, body.volunteer_token)
    _case(session, case_id)
    if body.resolution not in RESOLUTIONS:
        raise HTTPException(422, "Unknown resolution")
    try:
        case = resolve_case(session, case_id, v.id, body.resolution, body.note or None)
    except NotAllowed:
        return JSONResponse({"error": "not_assigned_to_you"}, status_code=409)
    session.commit()
    return volunteer_case(session, case, v)


def volunteer_case(session: Session, c: Case, v: Volunteer) -> dict:
    """A case as one volunteer sees it: address and phone only once they have accepted it."""
    mine = c.assignee_id == v.id and c.state == "assigned"
    detail = case_detail(session, c, reveal_address=mine)
    e = session.get(Elder, c.elder_id)
    detail["mine"] = mine
    detail["distance_km"] = _km(v.lat, v.lng, e.lat, e.lng)
    detail["elder"]["phone"] = e.phone if mine else None
    detail["elder"]["maps_url"] = (f"https://www.google.com/maps/search/?api=1&query={e.lat},{e.lng}"
                                   if mine else None)
    return detail


@router.get("/volunteer/me")
def volunteer_me(token: str, session: Session = Depends(get_session)) -> dict:
    v = _volunteer(session, token)
    tier = "asha" if v.role == "asha" else "volunteer"
    rows = session.exec(select(Case).where(Case.run_id == current_run_id()).order_by(Case.id))
    visible = [c for c in rows if (c.state == "open" and c.tier == tier)
               or (c.state == "assigned" and c.assignee_id == v.id)]
    return {"volunteer": {"id": v.id, "name": v.name, "role": v.role},
            "cases": [volunteer_case(session, c, v) for c in visible]}

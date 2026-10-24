from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import current_run_id, get_session
from app.geo import km
from app.escalation import AlreadyAccepted, NotAllowed, accept_case, decline_case, resolve_case, set_duty
from app.models import RESOLUTIONS, Case, Elder, Volunteer
from app.responders import load
from app.views import case_brief, case_detail, elder_item_one

router = APIRouter(prefix="/api")


class AcceptIn(BaseModel):
    volunteer_token: str


class DutyIn(BaseModel):
    volunteer_token: str
    on_duty: bool


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


@router.post("/cases/{case_id}/decline")
def decline(case_id: int, body: AcceptIn, session: Session = Depends(get_session)):
    """'Can't go': the case is offered at once to the next nearest available responder."""
    v = _volunteer(session, body.volunteer_token)
    _case(session, case_id)
    try:
        case = decline_case(session, case_id, v.id)
    except NotAllowed:
        return JSONResponse({"error": "not_open"}, status_code=409)
    session.commit()
    return volunteer_case(session, case, v)


@router.post("/volunteer/duty")
def duty(body: DutyIn, session: Session = Depends(get_session)):
    v = _volunteer(session, body.volunteer_token)
    try:
        set_duty(session, v, body.on_duty)
    except NotAllowed:
        return JSONResponse({"error": "finish_your_case_first"}, status_code=409)
    session.commit()
    return volunteer_me(body.volunteer_token, session)


@router.get("/responders")
def responders(session: Session = Depends(get_session)) -> list[dict]:
    """Every responder with duty status and load: the cases they hold and the open ones they are asked to."""
    busy = load(session)
    cases = list(session.exec(select(Case).where(Case.run_id == current_run_id(),
                                                 Case.state.in_(("open", "assigned")))))
    names = {e.id: e.name for e in session.exec(select(Elder).where(
        Elder.id.in_([c.elder_id for c in cases])))} if cases else {}

    def brief(c: Case) -> dict:
        return {"case_id": c.id, "elder_id": c.elder_id, "elder": names.get(c.elder_id), "level": c.level}
    out = []
    for v in session.exec(select(Volunteer).where(Volunteer.run_id == current_run_id()).order_by(Volunteer.id)):
        out.append({
            "id": v.id, "name": v.name, "role": v.role, "on_duty": v.on_duty, "is_simulated": v.is_simulated,
            "load": busy[v.id],
            "holding": [brief(c) for c in cases if c.state == "assigned" and c.assignee_id == v.id],
            "asked": [brief(c) for c in cases if c.state == "open" and v.id in (c.alerted_ids or [])],
            "declined": [brief(c) for c in cases if c.state == "open" and v.id in (c.declined_ids or [])],
        })
    return out


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
    detail["distance_km"] = km(v.lat, v.lng, e.lat, e.lng)
    detail["alerted_you"] = v.id in (c.alerted_ids or [])
    detail["declined_by_you"] = v.id in (c.declined_ids or [])
    detail["elder"]["phone"] = e.phone if mine else None
    detail["elder"]["maps_url"] = (f"https://www.google.com/maps/search/?api=1&query={e.lat},{e.lng}"
                                   if mine else None)
    return detail


@router.get("/volunteer/me")
def volunteer_me(token: str, session: Session = Depends(get_session)) -> dict:
    v = _volunteer(session, token)
    # Escalating adds responders: volunteers keep seeing a case after it moves up to ASHA.
    tiers = ("asha",) if v.role == "asha" else ("volunteer", "asha")
    rows = session.exec(select(Case).where(Case.run_id == current_run_id()).order_by(Case.id))
    # Off duty: nothing new is shown. A case they said they can't go to stays at the bottom, in case
    # they can go after all.
    visible = [c for c in rows if (c.state == "open" and c.tier in tiers and v.on_duty)
               or (c.state == "assigned" and c.assignee_id == v.id)]
    # Everyone on duty can still help; the ones alerted (nearest first) see those cases on top.
    visible.sort(key=lambda c: (c.assignee_id != v.id, v.id in (c.declined_ids or []),
                                v.id not in (c.alerted_ids or []), c.id))
    return {"volunteer": {"id": v.id, "name": v.name, "role": v.role, "on_duty": v.on_duty},
            "cases": [volunteer_case(session, c, v) for c in visible]}

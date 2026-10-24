"""Ward officer sign-in for the console (app/officer.py), and the links the officer hands out."""
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import officer
from app.config import get_settings
from app.db import current_run_id, get_session
from app.models import Volunteer

router = APIRouter(prefix="/api/officer")


class SignIn(BaseModel):
    passcode: str = Field(max_length=200)


@router.get("/session")
def session_state(request: Request) -> dict:
    return {"signed_in": officer.valid_session(request.cookies.get(officer.COOKIE))}


@router.post("/login")
def login(body: SignIn, request: Request, response: Response) -> dict:
    officer.check_passcode(request, body.passcode)
    officer.set_session(request, response)
    return {"signed_in": True}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    officer.clear_session(request, response)
    return {"signed_in": False}


@router.get("/volunteer-links", dependencies=[Depends(officer.require_officer)])
def volunteer_links(session: Session = Depends(get_session)) -> list[dict]:
    """Private links for the real (not simulated) volunteers, to open on their phones. The token goes
    after '#', so it never reaches a server or tunnel log when the page loads."""
    base = get_settings().public_base_url.rstrip("/")
    rows = session.exec(select(Volunteer).where(Volunteer.run_id == current_run_id(),
                                                Volunteer.is_simulated == False))  # noqa: E712
    return [{"name": v.name, "role": v.role, "path": f"/volunteer#{v.token}",
             "url": f"{base}/volunteer#{v.token}"} for v in rows]

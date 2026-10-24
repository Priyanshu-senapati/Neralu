"""Family status link API. The link's secret travels in a header, never in a URL, so it stays out of
server and tunnel logs; the page keeps it in the address's #fragment, which browsers never send."""
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlmodel import Session

from app import family
from app.db import get_session
from app.events import log_event
from app.models import Elder
from app.privacy import code_matches
from app.routes.elders import DeleteIn, erase_registration

router = APIRouter(prefix="/api/family")


def _elder(session: Session, token: str) -> Elder:
    e = family.find(session, token)
    if e is None:  # unknown, replaced or turned off: the same answer, so nothing can be probed
        raise HTTPException(404, "This link is not active")
    return e


@router.get("/status")
def status(response: Response, x_family_token: str = Header(""), session: Session = Depends(get_session)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return family.family_status(session, _elder(session, x_family_token))


@router.post("/renew")
def renew(x_family_token: str = Header(""), session: Session = Depends(get_session)) -> dict:
    """A new link replaces this one (e.g. it was shared by mistake)."""
    e = _elder(session, x_family_token)
    token = family.issue(e)
    log_event(session, "family_link_changed", "Family link replaced at the family's request",
              actor="family", elder_id=e.id, data={"action": "renewed"})
    session.commit()
    return {"family_token": token}


@router.post("/revoke")
def revoke(x_family_token: str = Header(""), session: Session = Depends(get_session)) -> dict:
    e = _elder(session, x_family_token)
    e.family_token_hash = None
    log_event(session, "family_link_changed", "Family link turned off at the family's request",
              actor="family", elder_id=e.id, data={"action": "revoked"})
    session.commit()
    return {"revoked": True}


@router.post("/erase")
def erase(body: DeleteIn, x_family_token: str = Header(""), session: Session = Depends(get_session)) -> dict:
    """Right to erasure from the family's page: the link plus the erasure code shown at registration."""
    e = family.find(session, x_family_token)
    if e is None or not code_matches(e.erasure_hash, body.code):
        raise HTTPException(403, "The link or the erasure code does not match")
    return erase_registration(session, e)

"""Proxy Twilio recordings so the browser never needs Twilio credentials."""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session

from app.config import get_settings
from app.db import current_run_id, get_session
from app.models import CheckIn

router = APIRouter(prefix="/api")


@router.get("/recordings/{checkin_id}")
async def recording(checkin_id: int, session: Session = Depends(get_session)) -> Response:
    c = session.get(CheckIn, checkin_id)
    if c is None or c.run_id != current_run_id() or not c.recording_url:
        raise HTTPException(404, "No recording")
    s = get_settings()
    async with httpx.AsyncClient(auth=(s.twilio_account_sid, s.twilio_auth_token)) as client:
        r = await client.get(f"{c.recording_url}.mp3")
    if r.status_code != 200:
        raise HTTPException(502, "Recording unavailable")
    return Response(content=r.content, media_type="audio/mpeg",
                    headers={"Cache-Control": "private, max-age=3600"})

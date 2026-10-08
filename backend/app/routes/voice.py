"""Twilio voice webhooks (plan §7.3). Every webhook validates the signature and ignores old runs."""
import asyncio
import logging

from fastapi import APIRouter, Request, Response
from sqlmodel import Session

from app import telephony as tw
from app.calls import handle_call_ended
from app.config import get_settings
from app.db import current_run_id, engine
from app.events import log_event
from app.models import TERMINAL_CALL_STATUSES, CheckIn, Elder
from app.orientation import score_orientation
from app.state import state
from app.transcribe import fetch_recording, transcribe

log = logging.getLogger(__name__)
router = APIRouter(prefix="/voice")

KEYPAD = {"1": "yes", "2": "no"}
HELP_KEYPAD = {"1": "ok", "2": "help"}

# checkin_id -> running orientation transcription, awaited (bounded) before classification
orientation_tasks: dict[int, asyncio.Task] = {}


def twiml(body: str) -> Response:
    return Response(content=body, media_type="application/xml")


def _live_checkin(session: Session, checkin_id: int) -> CheckIn | None:
    """The check-in if it belongs to the current run and is still in progress."""
    c = session.get(CheckIn, checkin_id)
    if c is None or c.run_id != current_run_id() or c.processed:
        return None
    return c


def _store(session: Session, c: CheckIn, field: str, value: str, via: str, **extra) -> None:
    c.answers = {**(c.answers or {}), field: value}
    log_event(session, "answer_recorded", f"{field.replace('_', ' ').capitalize()}: {value} · via {via}",
              actor="twilio", elder_id=c.elder_id, checkin_id=c.id,
              data={"step": field, "value": value, "via": via, **extra})


@router.post("/answer")
async def answer(request: Request, checkin_id: int) -> Response:
    await tw.validate_signature(request)
    with Session(engine) as session:
        c = _live_checkin(session, checkin_id)
        if c is None:
            return twiml(tw.hangup_twiml())
        elder = session.get(Elder, c.elder_id)
        return twiml(tw.answer_twiml(c.id, elder.name.split()[0], elder.code_word))


@router.post("/gather/{step}")
async def gather(request: Request, step: str, checkin_id: int, r: int = 0) -> Response:
    await tw.validate_signature(request)
    digits = (await request.form()).get("Digits")
    with Session(engine) as session:
        c = _live_checkin(session, checkin_id)
        if c is None or (step not in tw.STEPS and step != "help"):
            return twiml(tw.hangup_twiml())
        if step == "help":
            value = HELP_KEYPAD.get(digits, "none")
            _store(session, c, "self_report", value, "keypad")
            advice = (c.answers or {}).get("water") == "no"
            session.commit()
            return twiml(tw.close_twiml(advice=advice, help_=value == "help"))
        value = KEYPAD.get(digits)
        if value is None and not r:
            return twiml(tw.gather_twiml(step, c.id, reprompt=True))
        _store(session, c, tw.STEPS[step], value or "none", "keypad")
        session.commit()
        i = tw.STEP_ORDER.index(step)
        if i + 1 < len(tw.STEP_ORDER):
            return twiml(tw.gather_twiml(tw.STEP_ORDER[i + 1], c.id, reprompt=False))
        return twiml(tw.orientation_twiml(c.id))


@router.post("/orientation")
async def orientation(request: Request, checkin_id: int, empty: int = 0) -> Response:
    await tw.validate_signature(request)
    recording_url = None if empty else (await request.form()).get("RecordingUrl")
    with Session(engine) as session:
        c = _live_checkin(session, checkin_id)
        if c is None:
            return twiml(tw.hangup_twiml())
        if recording_url:
            if not c.recording_url:
                c.recording_url = recording_url
                orientation_tasks[c.id] = asyncio.create_task(
                    _score_orientation(c.id, recording_url, session.get(Elder, c.elder_id).language))
        elif "orientation" not in (c.answers or {}) and not c.recording_url:
            _store(session, c, "orientation", "none", "voice", transcript=None)
        session.commit()
        return twiml(tw.gather_twiml("help", c.id, reprompt=False))


async def _score_orientation(checkin_id: int, recording_url: str, lang: str) -> None:
    audio = await fetch_recording(recording_url)
    await score_audio(checkin_id, audio, lang)


async def score_audio(checkin_id: int, audio: bytes | None, lang: str,
                      filename: str = "answer.wav", mime: str = "audio/wav") -> None:
    """Transcribe a spoken day and store the orientation score. Unclear audio is never 'fine'."""
    transcript = await transcribe(audio, lang, filename, mime) if audio else None
    today = state.clock.scenario_now().date()
    value = score_orientation(transcript, today)
    if transcript is None:
        value = "uncertain"  # a recording exists but could not be understood: never "fine"
    with Session(engine) as session:
        c = _live_checkin(session, checkin_id)
        if c is None:
            return
        c.transcript = transcript
        _store(session, c, "orientation", value, "voice", transcript=transcript)
        session.commit()


async def _await_orientation(checkin_id: int) -> None:
    task = orientation_tasks.pop(checkin_id, None)
    if task is None:
        return
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=get_settings().stt_timeout_s)
    except Exception as exc:
        log.warning("Orientation scoring did not finish in time: %r", exc)


@router.post("/status")
async def status(request: Request, checkin_id: int) -> Response:
    await tw.validate_signature(request)
    call_status = (await request.form()).get("CallStatus", "")
    with Session(engine) as session:
        c = _live_checkin(session, checkin_id)
        if c is None:
            return Response(status_code=204)
        if call_status not in TERMINAL_CALL_STATUSES:
            if call_status != c.call_status:
                c.call_status = call_status
                if call_status == "ringing":
                    log_event(session, "call_ringing", "Ringing", actor="twilio",
                              elder_id=c.elder_id, checkin_id=c.id)
                elif call_status == "in-progress":
                    log_event(session, "call_answered", "Call answered", actor="twilio",
                              elder_id=c.elder_id, checkin_id=c.id)
                session.commit()
            return Response(status_code=204)
    await _await_orientation(checkin_id)
    with Session(engine) as session:
        handle_call_ended(session, checkin_id, call_status)
        session.commit()
    return Response(status_code=204)

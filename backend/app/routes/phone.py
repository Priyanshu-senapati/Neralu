"""Browser phone API (TELEPHONY_MODE=browser). Mirrors the Twilio webhooks in voice.py step for step,
storing answers through the same helpers so classification and escalation are unchanged."""
import asyncio
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session

from app import browser_phone as bp
from app import telephony as tw
from app.calls import handle_call_ended
from app.db import engine
from app.models import CheckIn, Elder
from app.routes.voice import HELP_KEYPAD, KEYPAD, _await_orientation, _live_checkin, _store, \
    orientation_tasks, score_audio
from app.state import state

router = APIRouter(prefix="/api/phone")

RECORDINGS_DIR = Path(__file__).resolve().parents[2] / "recordings"
CAPTIONS = {  # English captions shown on the phone screen while the Kannada prompt plays
    "water": "Have you had water in the last hour? Press 1 for yes, 2 for no.",
    "symptoms": "Do you feel dizzy, weak or confused? Press 1 for yes, 2 for no.",
    "room": "Is your room very hot right now? Press 1 for yes, 2 for no.",
    "fan": "Is your fan or cooler working? Press 1 for yes, 2 for no.",
    "help": "If you need help now, press 2. If you are okay, press 1.",
    "orientation": "Please tell me, what day is it today?",
}
MIME_EXT = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3",
            "audio/wav": ".wav", "audio/x-wav": ".wav"}


def _audio(name: str) -> str:
    return f"/audio/kn/{name}.mp3"


def _call(session: Session, checkin_id: int) -> tuple[bp.BrowserCall, CheckIn]:
    call, c = bp.get(checkin_id), _live_checkin(session, checkin_id)
    if call is None or c is None:
        raise HTTPException(409, "This call has ended")
    bp.touch(call)
    return call, c


@router.get("/current")
def current() -> dict:
    """What the phone page should show right now: an incoming or ongoing call, or nothing."""
    call = bp.current()
    if call is None:
        return {"call": None}
    with Session(engine) as session:
        c = session.get(CheckIn, call.checkin_id)
        elder = session.get(Elder, c.elder_id) if c else None
        if c is None or elder is None or c.processed:
            return {"call": None}
        return {"call": {"checkin_id": c.id, "status": call.status, "attempt": c.attempt,
                         "is_recall": c.is_recall, "elder_name": elder.name}}


@router.post("/calls/{checkin_id}/answer")
def answer(checkin_id: int) -> dict:
    with Session(engine) as session:
        call, c = _call(session, checkin_id)
        if call.status != bp.RINGING:
            raise HTTPException(409, "Already answered")
        bp.answer(session, call)
        session.commit()
        elder = session.get(Elder, c.elder_id)
        first = elder.name.split()[0]
        intro = ["greet"] + ([f"name_{first.lower()}"] if tw.has_audio(f"name_{first.lower()}") else []) \
            + ["code_intro", f"code_{elder.code_word}", "safety"]
        return {
            "intro": [_audio(n) for n in intro],
            "code_word": elder.code_word.capitalize(),
            "steps": [{"step": s, "prompt": _audio(tw.PROMPTS[s]), "caption": CAPTIONS[s]}
                      for s in tw.STEP_ORDER],
            "orientation": {"prompt": _audio("q_orientation"), "caption": CAPTIONS["orientation"]},
            "help": {"prompt": _audio("q_help"), "caption": CAPTIONS["help"]},
            "reprompt": _audio("reprompt"),
        }


class KeyIn(BaseModel):
    step: str
    digit: str | None = None  # None = no key pressed before the timeout


@router.post("/calls/{checkin_id}/key")
def key(checkin_id: int, body: KeyIn) -> dict:
    with Session(engine) as session:
        _, c = _call(session, checkin_id)
        extra = {"transport": "browser"}
        if body.step == "help":
            value = HELP_KEYPAD.get(body.digit or "", "none")
            _store(session, c, "self_report", value, "keypad", **extra)
            advice = (c.answers or {}).get("water") == "no"
            session.commit()
            closing = (["advice"] if advice else []) + ["close_help" if value == "help" else "close_ok"]
            return {"closing": [_audio(n) for n in closing]}
        if body.step not in tw.STEPS:
            raise HTTPException(422, "Unknown step")
        _store(session, c, tw.STEPS[body.step], KEYPAD.get(body.digit or "", "none"), "keypad", **extra)
        session.commit()
        return {"ok": True}


@router.post("/calls/{checkin_id}/orientation")
async def orientation(checkin_id: int, audio: UploadFile | None = File(None),
                      day: int | None = Form(None)) -> dict:
    """Spoken answer (recorded in the browser, transcribed like a Twilio recording), or a tapped
    day 1-7 when the microphone is unavailable. Neither can make the outcome 'fine' on its own."""
    with Session(engine) as session:
        _, c = _call(session, checkin_id)
        if day is not None:
            if not 1 <= day <= 7:
                raise HTTPException(422, "day must be 1 (Monday) to 7 (Sunday)")
            today = state.clock.scenario_now().date().weekday()
            _store(session, c, "orientation", "correct" if day - 1 == today else "wrong", "keypad",
                   transport="browser", day=day)
            session.commit()
            return {"ok": True}
        data = await audio.read() if audio else b""
        if not data:
            _store(session, c, "orientation", "none", "voice", transcript=None, transport="browser")
            session.commit()
            return {"ok": True}
        mime = (audio.content_type or "audio/webm").split(";")[0]
        RECORDINGS_DIR.mkdir(exist_ok=True)
        name = f"{c.run_id}-{c.id}{MIME_EXT.get(mime, '.webm')}"
        (RECORDINGS_DIR / name).write_bytes(data)
        c.recording_url = f"local:{name}"
        lang = session.get(Elder, c.elder_id).language
        session.commit()
    orientation_tasks[checkin_id] = asyncio.create_task(score_audio(checkin_id, data, lang, name, mime))
    return {"ok": True}


def _end(checkin_id: int, status: str) -> None:
    with Session(engine) as session:
        handle_call_ended(session, checkin_id, status)
        session.commit()


@router.post("/calls/{checkin_id}/hangup")
async def hangup(checkin_id: int) -> dict:
    with Session(engine) as session:
        _call(session, checkin_id)
    bp.forget(checkin_id)
    await _await_orientation(checkin_id)
    _end(checkin_id, "completed")
    return {"ok": True}


@router.post("/calls/{checkin_id}/decline")
def decline(checkin_id: int) -> dict:
    with Session(engine) as session:
        _call(session, checkin_id)
    bp.forget(checkin_id)
    _end(checkin_id, "busy")
    return {"ok": True}

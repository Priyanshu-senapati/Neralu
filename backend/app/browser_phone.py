"""Browser phone: a fallback for the live call when Twilio cannot reach a real phone.

With TELEPHONY_MODE=browser, a call to a real-phone resident rings the /phone page instead of a
SIM. The page plays the same recorded prompts and sends back the same answers, which are stored,
classified and escalated by exactly the code a Twilio call uses (voice.py, calls.py, rules.py).
Only the transport differs, and the call's events say so.
"""
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session

from app.config import get_settings
from app.db import current_run_id
from app.events import log_event
from app.models import CheckIn
from app.state import state

RINGING, IN_PROGRESS = "ringing", "in-progress"
IDLE_HANGUP_S = 90  # an answered call with no activity for this long is treated as hung up


@dataclass
class BrowserCall:
    checkin_id: int
    run_id: str
    status: str
    since: datetime
    last_activity: datetime
    ring_logged: bool = False


calls: dict[int, BrowserCall] = {}


def ring(checkin_id: int) -> str:
    """Called by telephony.place_call in browser mode. Returns a call id in place of a Twilio SID."""
    now = state.clock.real_now()
    calls[checkin_id] = BrowserCall(checkin_id, current_run_id(), RINGING, now, now)
    return f"browser-{checkin_id}"


def current() -> BrowserCall | None:
    """The call the phone page should show: the newest one still ringing or in progress."""
    live = [c for c in calls.values() if c.run_id == current_run_id()]
    return max(live, key=lambda c: c.since) if live else None


def get(checkin_id: int) -> BrowserCall | None:
    c = calls.get(checkin_id)
    return c if c and c.run_id == current_run_id() else None


def touch(call: BrowserCall) -> None:
    call.last_activity = state.clock.real_now()


def answer(session: Session, call: BrowserCall) -> None:
    call.status = IN_PROGRESS
    touch(call)
    c = session.get(CheckIn, call.checkin_id)
    c.call_status = IN_PROGRESS
    log_event(session, "call_answered", "Call answered · browser phone", actor="twilio",
              elder_id=c.elder_id, checkin_id=c.id, data={"transport": "browser"})


def forget(checkin_id: int) -> None:
    calls.pop(checkin_id, None)


def tick(session: Session) -> None:
    """Log ringing, and end calls nobody answered (ring timeout) or abandoned mid-call."""
    from app.calls import handle_call_ended

    now = state.clock.real_now()
    ring_timeout = get_settings().ring_timeout_s
    for call in list(calls.values()):
        if call.run_id != current_run_id():
            forget(call.checkin_id)
            continue
        c = session.get(CheckIn, call.checkin_id)
        if c is None or c.processed:
            forget(call.checkin_id)
            continue
        if call.status == RINGING and not call.ring_logged:
            call.ring_logged = True
            c.call_status = RINGING
            log_event(session, "call_ringing", "Ringing · browser phone", actor="twilio",
                      elder_id=c.elder_id, checkin_id=c.id, data={"transport": "browser"})
        elif call.status == RINGING and (now - call.since).total_seconds() > ring_timeout:
            forget(call.checkin_id)
            handle_call_ended(session, c.id, "no-answer")
        elif call.status == IN_PROGRESS and (now - call.last_activity).total_seconds() > IDLE_HANGUP_S:
            forget(call.checkin_id)
            handle_call_ended(session, c.id, "completed")

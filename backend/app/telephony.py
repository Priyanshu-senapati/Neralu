"""Twilio Programmable Voice: placing calls, TwiML builders, webhook signature validation."""
from pathlib import Path
from urllib.parse import urlencode

from fastapi import HTTPException, Request
from twilio.request_validator import RequestValidator
from twilio.rest import Client
from twilio.twiml.voice_response import Gather, VoiceResponse

from app.config import get_settings

AUDIO_DIR = Path(__file__).resolve().parent.parent / "static" / "audio" / "kn"

# Keypad steps in call order: url step -> Signals field
STEPS = {"water": "water", "symptoms": "symptoms", "room": "room_hot", "fan": "fan_working"}
STEP_ORDER = list(STEPS)
PROMPTS = {"water": "q_water", "symptoms": "q_symptoms", "room": "q_room", "fan": "q_fan",
           "help": "q_help"}

_client: Client | None = None


def _twilio() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = Client(s.twilio_account_sid, s.twilio_auth_token)
    return _client


def url(path: str, **params) -> str:
    base = get_settings().public_base_url.rstrip("/")
    return f"{base}{path}" + (f"?{urlencode(params)}" if params else "")


def audio(name: str) -> str:
    return url(f"/audio/kn/{name}.mp3")


def has_audio(name: str) -> bool:
    return (AUDIO_DIR / f"{name}.mp3").exists()


def place_call(to: str, checkin_id: int) -> str:
    s = get_settings()
    if s.telephony_mode == "browser":
        from app import browser_phone
        return browser_phone.ring(checkin_id)
    call = _twilio().calls.create(
        to=to, from_=s.twilio_from_number,
        url=url("/voice/answer", checkin_id=checkin_id),
        status_callback=url("/voice/status", checkin_id=checkin_id),
        status_callback_event=["initiated", "ringing", "answered", "completed"],
        status_callback_method="POST",
        timeout=s.ring_timeout_s,
    )
    return call.sid


def keypad_gather(resp: VoiceResponse, step: str, checkin_id: int, *, reprompt: bool) -> None:
    """Gather one digit for `step`; on silence Twilio falls through to the Redirect."""
    params = {"checkin_id": checkin_id}
    if reprompt:
        params["r"] = 1
    g = Gather(input="dtmf", num_digits=1, timeout=8, action=url(f"/voice/gather/{step}", **params),
               method="POST")
    if reprompt:
        g.play(audio("reprompt"))
    g.play(audio(PROMPTS[step]))
    resp.append(g)
    resp.redirect(url(f"/voice/gather/{step}", **params, timeout=1), method="POST")


def answer_twiml(checkin_id: int, first_name: str, code_word: str) -> str:
    resp = VoiceResponse()
    resp.play(audio("greet"))
    name_clip = f"name_{first_name.lower()}"
    if has_audio(name_clip):
        resp.play(audio(name_clip))
    resp.play(audio("code_intro"))
    resp.play(audio(f"code_{code_word}"))
    resp.play(audio("safety"))
    keypad_gather(resp, "water", checkin_id, reprompt=False)
    return str(resp)


def gather_twiml(step: str, checkin_id: int, *, reprompt: bool) -> str:
    resp = VoiceResponse()
    keypad_gather(resp, step, checkin_id, reprompt=reprompt)
    return str(resp)


def orientation_twiml(checkin_id: int) -> str:
    resp = VoiceResponse()
    resp.play(audio("q_orientation"))
    resp.record(max_length=5, timeout=3, play_beep=False, method="POST",
                action=url("/voice/orientation", checkin_id=checkin_id))
    # If nothing was recorded Twilio continues here instead of calling the action.
    resp.redirect(url("/voice/orientation", checkin_id=checkin_id, empty=1), method="POST")
    return str(resp)


def close_twiml(*, advice: bool, help_: bool) -> str:
    resp = VoiceResponse()
    if advice:
        resp.play(audio("advice"))
    resp.play(audio("close_help" if help_ else "close_ok"))
    resp.hangup()
    return str(resp)


def hangup_twiml() -> str:
    resp = VoiceResponse()
    resp.hangup()
    return str(resp)


async def validate_signature(request: Request) -> None:
    """Raise 403 unless the request carries a valid X-Twilio-Signature (when validation is on)."""
    s = get_settings()
    if not s.validate_twilio_signature:
        return
    form = await request.form()
    # Behind ngrok/Railway the request URL seen here differs; Twilio signs the public URL.
    public = url(request.url.path) + (f"?{request.url.query}" if request.url.query else "")
    ok = RequestValidator(s.twilio_auth_token).validate(
        public, dict(form), request.headers.get("X-Twilio-Signature", ""))
    if not ok:
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

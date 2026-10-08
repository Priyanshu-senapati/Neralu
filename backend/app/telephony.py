"""Twilio Programmable Voice: placing calls, TwiML builders, webhook signature validation."""
from urllib.parse import urlencode

from fastapi import HTTPException, Request
from twilio.base.exceptions import TwilioRestException
from twilio.request_validator import RequestValidator
from twilio.rest import Client
from twilio.twiml.voice_response import Gather, VoiceResponse

from app.audio import resolve
from app.config import get_settings


# Keypad steps in call order: url step -> Signals field
STEPS = {"water": "water", "symptoms": "symptoms", "room": "room_hot", "fan": "fan_working"}
STEP_ORDER = list(STEPS)
PROMPTS = {"water": "q_water", "symptoms": "q_symptoms", "room": "q_room", "fan": "q_fan",
           "day": "q_day_keypad",
           "help": "q_help"}

_client: Client | None = None
# Twilio trial accounts reject some call options; once seen, place calls without them.
# Ring time is then enforced by calls.cancel_unanswered_calls instead of Twilio's `timeout`.
_trial_limited = False
TRIAL_LIMIT_TEXT = "trial accounts have limited parameter access"


def _twilio() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = Client(s.twilio_account_sid, s.twilio_auth_token)
    return _client


def url(path: str, **params) -> str:
    base = get_settings().public_base_url.rstrip("/")
    return f"{base}{path}" + (f"?{urlencode(params)}" if params else "")


def audio(name: str, lang: str) -> str:
    """Public URL of a prompt; the audio route falls back to English if `lang` lacks it."""
    return url(f"/audio/{lang}/{name}.mp3")


def has_audio(name: str, lang: str) -> bool:
    return resolve(lang, name) is not None


def place_call(to: str, checkin_id: int) -> str:
    global _trial_limited
    s = get_settings()
    params = dict(
        to=to, from_=s.twilio_from_number,
        url=url("/voice/answer", checkin_id=checkin_id),
        status_callback=url("/voice/status", checkin_id=checkin_id),
        status_callback_event=["initiated", "ringing", "answered", "completed"],
    )
    full = dict(status_callback_method="POST", timeout=s.ring_timeout_s)
    if not _trial_limited:
        try:
            return _twilio().calls.create(**params, **full).sid
        except TwilioRestException as exc:
            if TRIAL_LIMIT_TEXT not in str(exc.msg):
                raise
            _trial_limited = True  # nothing was created; retry without the restricted options
    return _twilio().calls.create(**params).sid


def cancel_call(call_sid: str) -> bool:
    """Hang up a call that is still queued or ringing. False if it was already answered or over."""
    try:
        _twilio().calls(call_sid).update(status="canceled")
        return True
    except TwilioRestException:
        return False


def keypad_gather(resp: VoiceResponse, step: str, checkin_id: int, *, reprompt: bool, lang: str) -> None:
    """Gather one digit for `step`; on silence Twilio falls through to the Redirect."""
    params = {"checkin_id": checkin_id}
    if reprompt:
        params["r"] = 1
    g = Gather(input="dtmf", num_digits=1, timeout=8, action=url(f"/voice/gather/{step}", **params),
               method="POST")
    if reprompt:
        g.play(audio("reprompt", lang))
    g.play(audio(PROMPTS[step], lang))
    resp.append(g)
    resp.redirect(url(f"/voice/gather/{step}", **params, timeout=1), method="POST")


def answer_twiml(checkin_id: int, first_name: str, code_word: str, lang: str) -> str:
    resp = VoiceResponse()
    resp.play(audio("greet", lang))
    name_clip = f"name_{first_name.lower()}"
    if has_audio(name_clip, lang):
        resp.play(audio(name_clip, lang))
    resp.play(audio("code_intro", lang))
    resp.play(audio(f"code_{code_word}", lang))
    resp.play(audio("safety", lang))
    keypad_gather(resp, "water", checkin_id, reprompt=False, lang=lang)
    return str(resp)


def gather_twiml(step: str, checkin_id: int, *, reprompt: bool, lang: str) -> str:
    resp = VoiceResponse()
    keypad_gather(resp, step, checkin_id, reprompt=reprompt, lang=lang)
    return str(resp)


def orientation_twiml(checkin_id: int, lang: str) -> str:
    resp = VoiceResponse()
    if get_settings().orientation_mode == "keypad":
        keypad_gather(resp, "day", checkin_id, reprompt=False, lang=lang)
        return str(resp)
    resp.play(audio("q_orientation", lang))
    resp.record(max_length=5, timeout=3, play_beep=False, method="POST",
                action=url("/voice/orientation", checkin_id=checkin_id))
    # If nothing was recorded Twilio continues here instead of calling the action.
    resp.redirect(url("/voice/orientation", checkin_id=checkin_id, empty=1), method="POST")
    return str(resp)


def close_twiml(*, advice: bool, help_: bool, lang: str) -> str:
    resp = VoiceResponse()
    if advice:
        resp.play(audio("advice", lang))
    resp.play(audio("close_help" if help_ else "close_ok", lang))
    resp.hangup()
    return str(resp)


def hangup_twiml() -> str:
    resp = VoiceResponse()
    resp.hangup()
    return str(resp)


_verified_call_sids: set[str] = set()


def _call_is_ours(call_sid: str) -> bool:
    """Ask Twilio whether this CallSid is a real call on our account (cached per call)."""
    if call_sid in _verified_call_sids:
        return True
    try:
        call = _twilio().calls(call_sid).fetch()
    except TwilioRestException:
        return False
    if call.account_sid != get_settings().twilio_account_sid:
        return False
    _verified_call_sids.add(call_sid)
    return True


def _checkin_call_sid(request: Request) -> str | None:
    from sqlmodel import Session

    from app.db import engine
    from app.models import CheckIn

    try:
        checkin_id = int(request.query_params.get("checkin_id", ""))
    except ValueError:
        return None
    with Session(engine) as session:
        c = session.get(CheckIn, checkin_id)
        return c.call_sid if c else None


async def validate_signature(request: Request) -> None:
    """Raise 403 unless the request provably comes from Twilio (when validation is on).

    Normal webhooks carry X-Twilio-Signature. Twilio's trial-account gateway fetches the answer
    URL unsigned, so an unsigned request is accepted only if its CallSid is the call we placed
    for this check-in and Twilio's API confirms that call belongs to our account.
    """
    s = get_settings()
    if not s.validate_twilio_signature:
        return
    form = await request.form()
    signature = request.headers.get("X-Twilio-Signature")
    if signature:
        # Behind ngrok/Railway the request URL seen here differs; Twilio signs the public URL.
        public = url(request.url.path) + (f"?{request.url.query}" if request.url.query else "")
        if RequestValidator(s.twilio_auth_token).validate(public, dict(form), signature):
            return
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    call_sid = form.get("CallSid")
    if call_sid and call_sid == _checkin_call_sid(request) and _call_is_ours(call_sid):
        return
    raise HTTPException(status_code=403, detail="Unverified webhook")

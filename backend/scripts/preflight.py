"""Demo-day preflight: checks every external dependency of the live call before going on stage.

Run from backend/ with the server running behind ngrok:
    .venv/bin/python scripts/preflight.py            (Windows: .venv\\Scripts\\python scripts\\preflight.py)
    add --skip-stt to avoid spending a Sarvam request

Exit code 0 means every check passed. Nothing here places a call or changes any state.
"""
import io
import struct
import sys
import wave
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.models import CODE_WORDS  # noqa: E402
from app.audio import AUDIO_ROOT, resolve  # noqa: E402

PROMPTS = ["greet", "name_kamala", "code_intro", "safety", "q_water", "q_symptoms", "q_room",
           "q_fan", "q_orientation", "q_help", "reprompt", "advice", "close_ok", "close_help"]

failures: list[str] = []


def check(ok: bool, label: str, hint: str = "") -> bool:
    print(f"  {'ok  ' if ok else 'FAIL'}  {label}" + (f"\n        -> {hint}" if not ok and hint else ""))
    if not ok:
        failures.append(label)
    return ok


def warn(label: str) -> None:
    print(f"  warn  {label}")


def env(s) -> None:
    print("Config (.env)")
    placeholder = lambda v: not v or "X" in v or "<" in v  # noqa: E731
    if s.telephony_mode == "browser":
        print("  ok    TELEPHONY_MODE=browser: Kamala's call rings the /phone page, Twilio not needed")
        return
    check(not placeholder(s.twilio_account_sid), "TWILIO_ACCOUNT_SID set")
    check(not placeholder(s.twilio_auth_token), "TWILIO_AUTH_TOKEN set")
    check(s.twilio_from_number.startswith("+") and not placeholder(s.twilio_from_number),
          "TWILIO_FROM_NUMBER set (E.164)")
    check(s.kamala_phone.startswith("+") and not placeholder(s.kamala_phone),
          "KAMALA_PHONE set (E.164, e.g. +9198...)")
    check(s.public_base_url.startswith("https://") and "<" not in s.public_base_url,
          "PUBLIC_BASE_URL is an https URL", "Twilio needs a public https URL (ngrok)")
    if not s.validate_twilio_signature:
        warn("VALIDATE_TWILIO_SIGNATURE is off")
    if s.ack_timeout_min * 60 / s.demo_speed < 30:
        warn(f"ACK_TIMEOUT_MIN={s.ack_timeout_min:g} is {s.ack_timeout_min * 60 / s.demo_speed:.0f} real "
             "seconds per tier at this demo speed; 45-60 gives the volunteer time on stage")


def twilio(s) -> None:
    print("Twilio")
    from twilio.base.exceptions import TwilioRestException
    from twilio.rest import Client
    try:
        client = Client(s.twilio_account_sid, s.twilio_auth_token)
        acct = client.api.v2010.accounts(s.twilio_account_sid).fetch()
    except TwilioRestException as exc:
        check(False, "credentials accepted", str(exc.msg))
        return
    check(acct.status == "active", f"account active ({acct.status})")
    if acct.type == "Trial":
        warn("trial account: calls start with a trial message and only reach verified numbers")
    nums = client.incoming_phone_numbers.list(phone_number=s.twilio_from_number, limit=1)
    check(bool(nums), "TWILIO_FROM_NUMBER belongs to this account")
    try:
        india = client.voice.v1.dialing_permissions.countries("IN").fetch()
        check(bool(india.low_risk_numbers_enabled), "voice geo permission for India enabled",
              "Console > Voice > Settings > Geo permissions > India")
    except TwilioRestException as exc:
        warn(f"could not read India geo permission: {exc.msg}")
    if acct.type == "Trial" and s.kamala_phone:
        verified = client.outgoing_caller_ids.list(phone_number=s.kamala_phone, limit=1)
        check(bool(verified), "KAMALA_PHONE is a verified caller ID (trial accounts only)")


def audio_files() -> None:
    print("Audio prompts")
    names = PROMPTS + [f"code_{w}" for w in CODE_WORDS]
    missing = [n for n in names if resolve("kn", n) is None]
    check(not missing, f"{len(names)} prompts available for Kannada calls", f"missing in every language: {', '.join(missing)}")
    fallback = [n for n in names if (p := resolve("kn", n)) and p.parent.name != "kn"]
    if fallback:
        warn(f"{len(fallback)} Kannada prompts fall back to {resolve('kn', fallback[0]).parent.name}: "
             f"record them into {AUDIO_ROOT / 'kn'}")


def public_url(s) -> None:
    print(f"Public URL ({s.public_base_url})")
    base = s.public_base_url.rstrip("/")
    try:
        with httpx.Client(timeout=8, follow_redirects=False) as client:
            r = client.get(f"{base}/health")
            check(r.status_code == 200 and r.json().get("ok") is True, "/health reachable",
                  f"got {r.status_code}; is uvicorn running and ngrok pointed at port 8000?")
            for name in ("greet", "code_mallige", "q_water"):
                r = client.get(f"{base}/audio/kn/{name}.mp3")
                ctype = r.headers.get("content-type", "")
                check(r.status_code == 200 and "audio" in ctype, f"/audio/kn/{name}.mp3 served as audio",
                      f"got {r.status_code} {ctype}")
    except httpx.HTTPError as exc:
        check(False, "/health reachable", repr(exc))


def _silent_wav() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(struct.pack("<h", 0) * 16000)
    return buf.getvalue()


def stt(s) -> None:
    print("Speech-to-text")
    if s.stt_provider != "sarvam":
        check(False, f"STT_PROVIDER={s.stt_provider} is implemented", "only sarvam is implemented")
        return
    if not check(bool(s.sarvam_api_key), "SARVAM_API_KEY set",
                 "without it every spoken answer scores 'uncertain' (AMBER, rule R7)"):
        return
    from app.transcribe import SARVAM_MODEL, SARVAM_URL
    try:
        r = httpx.post(SARVAM_URL, headers={"api-subscription-key": s.sarvam_api_key},
                       data={"model": SARVAM_MODEL, "language_code": "kn-IN"},
                       files={"file": ("silence.wav", _silent_wav(), "audio/wav")}, timeout=15)
        check(r.status_code == 200, f"Sarvam accepted a test request ({r.status_code})", r.text[:200])
    except httpx.HTTPError as exc:
        check(False, "Sarvam reachable", repr(exc))


def main() -> int:
    s = get_settings()
    env(s)
    audio_files()
    if s.telephony_mode != "browser":
        twilio(s)
        public_url(s)
    if "--skip-stt" not in sys.argv:
        stt(s)
    print()
    if failures:
        print(f"{len(failures)} check(s) failed. Fix these before the demo.")
        return 1
    print("All checks passed. Place one real test call next.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

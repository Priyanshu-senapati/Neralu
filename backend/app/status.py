"""System status for the console: is everything a live call needs actually working right now?

Checks judge by evidence, not configuration alone: the public URL is fetched, the scheduler's
last tick is timed, Twilio is asked about the account and the last real call. External checks
are cached so the console can poll without spending requests. Nothing here changes state.
"""
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

import httpx

from app.audio import AUDIO_ROOT
from app.config import get_settings
from app.models import CODE_WORDS

PROMPTS = ["greet", "code_intro", "safety", "q_water", "q_symptoms", "q_room", "q_fan",
           "q_day_keypad", "q_help", "reprompt", "advice", "close_ok", "close_help", "lang_menu"]
CACHE_S = 30

_last_tick: float | None = None
_cache: tuple[float, list[dict]] | None = None


def mark_tick() -> None:
    """Called by the scheduler after every tick."""
    global _last_tick
    _last_tick = time.monotonic()


@dataclass
class Check:
    key: str
    label: str
    ok: bool
    detail: str
    warn: bool = False  # works, but with a caveat worth knowing on stage


def _placeholder(v: str) -> bool:
    return not v or "X" in v or "<" in v


def _scheduler() -> Check:
    age = None if _last_tick is None else time.monotonic() - _last_tick
    ok = age is not None and age < 10
    return Check("scheduler", "Scheduler", ok,
                 "running" if ok else "not ticking: retries and escalation are paused; restart the server")


def _audio() -> Check:
    names = PROMPTS + [f"code_{w}" for w in CODE_WORDS]
    missing = {lang: [n for n in names if not (AUDIO_ROOT / lang / f"{n}.mp3").is_file()]
               for lang in ("kn", "hi", "en")}
    gaps = {lang: m for lang, m in missing.items() if m}
    if not gaps:
        return Check("audio", "Call audio", True, f"Kannada, Hindi and English · {len(names)} prompts each")
    detail = "; ".join(f"{lang}: {len(m)} missing (falls back to English)" for lang, m in gaps.items())
    return Check("audio", "Call audio", "en" not in gaps, detail, warn=True)


def _speech() -> Check:
    s = get_settings()
    if s.orientation_mode == "keypad":
        return Check("speech", "Day check", True, "keypad (speech-to-text not needed)")
    ok = s.stt_provider == "sarvam" and bool(s.sarvam_api_key)
    return Check("speech", "Speech-to-text", ok,
                 "Sarvam key set" if ok else "SARVAM_API_KEY missing: spoken days score 'unclear' (AMBER)")


def _public_url(client: httpx.Client) -> Check:
    s = get_settings()
    base = s.public_base_url.rstrip("/")
    if not base.startswith("https://") or "<" in base:
        return Check("public", "Public link", False, "PUBLIC_BASE_URL is not set to the ngrok https address")
    try:
        r = client.get(f"{base}/health")
        ok = r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json") \
            and r.json().get("ok") is True
    except (httpx.HTTPError, ValueError):
        ok = False
    host = base.removeprefix("https://")
    return Check("public", "Public link", ok,
                 f"{host} reaches this server" if ok
                 else f"{host} does not reach this server: start ngrok (Twilio cannot fetch the call)")


def _twilio(client: httpx.Client) -> list[Check]:
    s = get_settings()
    if _placeholder(s.twilio_account_sid) or _placeholder(s.twilio_auth_token):
        return [Check("twilio", "Twilio", False, "credentials missing in backend/.env")]
    auth = (s.twilio_account_sid, s.twilio_auth_token)
    base = f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}"
    try:
        acct = client.get(f"{base}.json", auth=auth)
        if acct.status_code != 200:
            return [Check("twilio", "Twilio", False, f"credentials rejected ({acct.status_code})")]
        a = acct.json()
        active = a.get("status") == "active"
        trial = a.get("type") == "Trial"
        out = [Check("twilio", "Twilio", active,
                     ("trial account: calls open with Twilio's notice, verified numbers only" if trial
                      else "account active") if active else f"account {a.get('status')}",
                     warn=active and trial)]
        calls = client.get(f"{base}/Calls.json", auth=auth,
                           params={"To": s.kamala_phone, "PageSize": 1}).json().get("calls", [])
    except (httpx.HTTPError, ValueError) as exc:
        return [Check("twilio", "Twilio", False, f"cannot reach Twilio: {type(exc).__name__}")]
    if calls:
        c = calls[0]
        when = datetime.strptime(c["start_time"], "%a, %d %b %Y %H:%M:%S %z") if c.get("start_time") else None
        ago = f"{int((datetime.now(timezone.utc) - when).total_seconds() // 60)} min ago" if when else ""
        good = c["status"] in ("completed", "in-progress", "ringing", "queued", "busy", "no-answer", "canceled")
        out.append(Check("lastcall", "Last real call", good,
                         f"{c['status']} · {ago}" if good else f"{c['status']} {ago}: check Twilio's call log"))
    else:
        out.append(Check("lastcall", "Last real call", True, "none yet: place one test call", warn=True))
    return out


def _pilot() -> Check:
    from app.pilot import has_todays_forecast, next_round, started_rounds
    from app.db import engine
    from app.state import state
    from sqlmodel import Session

    if not has_todays_forecast():
        return Check("pilot", "Pilot schedule", False,
                     "today's forecast has not loaded: no automatic calls until it does (retries every 15 min)")
    with Session(engine) as session:
        nxt = next_round(state.clock.scenario_now(), started_rounds(session))
    return Check("pilot", "Pilot schedule", True,
                 f"today's forecast loaded · next automatic round {nxt.strftime('%H:%M')}" if nxt
                 else "today's forecast loaded · no more automatic rounds today")


def run_checks() -> list[dict]:
    s = get_settings()
    checks = [Check("server", "Server", True, "running"), _scheduler()]
    if s.run_mode == "pilot":
        checks.append(_pilot())
    if s.telephony_mode == "browser":
        checks.append(Check("phone", "Phone line", True, "browser phone (no telecom): open /phone", warn=True))
    else:
        with httpx.Client(timeout=6) as client:
            checks.append(_public_url(client))
            checks.extend(_twilio(client))
    checks += [_speech(), _audio()]
    return [asdict(c) for c in checks]


def system_status(fresh: bool = False) -> dict:
    global _cache
    now = time.monotonic()
    if fresh or _cache is None or now - _cache[0] > CACHE_S:
        _cache = (now, run_checks())
    checks = _cache[1]
    # The scheduler check is cheap and must never be stale.
    checks = [c if c["key"] != "scheduler" else asdict(_scheduler()) for c in checks]
    return {"ok": all(c["ok"] for c in checks), "checks": checks,
            "telephony_mode": get_settings().telephony_mode,
            "checked_seconds_ago": int(now - _cache[0])}

"""Ward officer sign-in. The console shows people's names, risk details and, once a volunteer accepts,
their address, so every console-only API route needs the officer's passcode first.

- The passcode is OFFICER_PASSCODE in backend/.env. Without one, a random passcode is made for this
  server run and printed in the server window.
- Signing in sets an HttpOnly, SameSite=Strict cookie holding an expiry signed with a key derived
  from the passcode (nothing stored server-side; changing the passcode signs everyone out).
- Scripts (scripts/stage.ps1) send the passcode in the X-Officer-Passcode header instead.
- Wrong passcodes are rate limited per client: MAX_FAILURES within LOCKOUT_S, then 429.
"""
import hashlib
import hmac
import logging
import secrets
import time
from functools import lru_cache

from fastapi import HTTPException, Request, Response

from app.config import get_settings

log = logging.getLogger(__name__)

COOKIE = "neralu_officer"
SESSION_S = 12 * 3600
MAX_FAILURES = 5
LOCKOUT_S = 15 * 60
SIGN_IN_NEEDED = "officer_sign_in"

_failures: dict[str, list[float]] = {}


@lru_cache
def _generated() -> str:
    code = secrets.token_urlsafe(9)
    log.warning("No OFFICER_PASSCODE in backend/.env. Ward console passcode for this server run: %s", code)
    return code


def passcode() -> str:
    return get_settings().officer_passcode.strip() or _generated()


def _key() -> bytes:
    return hashlib.sha256(f"neralu-officer-session:{passcode()}".encode()).digest()


def _sign(expires: int) -> str:
    return hmac.new(_key(), f"officer:{expires}".encode(), hashlib.sha256).hexdigest()


def session_value(now: float | None = None) -> str:
    expires = int((now or time.time()) + SESSION_S)
    return f"v1.{expires}.{_sign(expires)}"


def valid_session(value: str | None, now: float | None = None) -> bool:
    try:
        version, expires, sig = (value or "").split(".")
        return (version == "v1" and int(expires) > (now or time.time())
                and hmac.compare_digest(sig, _sign(int(expires))))
    except ValueError:
        return False


def _matches(given: str) -> bool:
    digest = lambda s: hashlib.sha256(s.encode()).digest()  # noqa: E731 (equal-length compare)
    return hmac.compare_digest(digest(given or ""), digest(passcode()))


def _client(request: Request) -> str:
    """Who is trying. Behind ngrok every request comes from 127.0.0.1, so use the address ngrok
    appended last to X-Forwarded-For (earlier entries can be forged by the sender)."""
    host = request.client.host if request.client else "?"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and host in ("127.0.0.1", "::1", "localhost"):
        return forwarded.split(",")[-1].strip()
    return host


def check_passcode(request: Request, given: str) -> None:
    """Raises 429 while a client is locked out, 401 for a wrong passcode (and counts it)."""
    who, now = _client(request), time.monotonic()
    recent = [t for t in _failures.get(who, []) if now - t < LOCKOUT_S]
    _failures[who] = recent
    if len(recent) >= MAX_FAILURES:
        wait = int(LOCKOUT_S - (now - recent[0])) + 1
        raise HTTPException(429, f"Too many wrong passcodes. Try again in {wait // 60 + 1} minutes.",
                            headers={"Retry-After": str(wait)})
    if not _matches(given):
        recent.append(now)
        raise HTTPException(401, "That passcode is not right.")
    _failures.pop(who, None)


def is_officer(request: Request) -> bool:
    if valid_session(request.cookies.get(COOKIE)):
        return True
    given = request.headers.get("x-officer-passcode")
    if given is not None:
        check_passcode(request, given)
        return True
    return False


def require_officer(request: Request) -> None:
    """FastAPI dependency for every console-only route."""
    if not is_officer(request):
        raise HTTPException(401, SIGN_IN_NEEDED)


def _secure(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


def set_session(request: Request, response: Response) -> None:
    response.set_cookie(COOKIE, session_value(), max_age=SESSION_S, httponly=True, samesite="strict",
                        secure=_secure(request), path="/")


def clear_session(request: Request, response: Response) -> None:
    response.delete_cookie(COOKIE, httponly=True, samesite="strict", secure=_secure(request), path="/")


def reset_for_tests() -> None:
    _failures.clear()

"""Responsible-tech safeguards: the family's erasure code and the recording retention limit.

- Erasure code: a random code shown once to the family at registration. Only its hash is stored,
  so nobody (not the console, not a database copy) can read it back or guess it from the
  registration number.
- Retention: call recordings are deleted RECORDING_RETENTION_DAYS after the call, in every run,
  including stray files the browser phone left behind. The spoken day is kept only as a weekday word.
"""
import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.config import get_settings
from app.erase import _erase_recording
from app.events import log_event
from app.models import CheckIn

log = logging.getLogger(__name__)

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L: easy to read out over the phone
SWEEP_EVERY_S = 3600
_last_sweep: float | None = None


def new_erasure_code() -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def hash_code(code: str) -> str:
    normalized = "".join(ch for ch in code.upper() if ch.isalnum())
    return hashlib.sha256(f"neralu-erasure:{normalized}".encode()).hexdigest()


def code_matches(stored_hash: str | None, code: str) -> bool:
    return bool(stored_hash) and hmac.compare_digest(stored_hash, hash_code(code or ""))


def sweep_recordings(session: Session, now: datetime | None = None) -> int:
    """Delete recordings older than the retention limit. Returns how many were deleted."""
    days = get_settings().recording_retention_days
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    old = [c for c in session.exec(select(CheckIn).where(CheckIn.recording_url != None))  # noqa: E711
           if _when(c) is not None and _when(c) < cutoff]
    for c in old:
        _erase_recording(c.recording_url)
        c.recording_url = None
        session.add(c)
    stray = _sweep_stray_files(cutoff)
    if old or stray:
        log_event(session, "recordings_deleted",
                  f"{len(old) + stray} call recording{'s' if len(old) + stray != 1 else ''} older than "
                  f"{days:g} days deleted (retention limit)",
                  actor="system", data={"checkins": len(old), "stray_files": stray, "days": days})
    return len(old) + stray


def _when(c: CheckIn) -> datetime | None:
    t = c.classified_real or c.scheduled_for_real
    if t is not None and t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)  # SQLite hands datetimes back without a zone
    return t


def _sweep_stray_files(cutoff: datetime) -> int:
    from app.routes.phone import RECORDINGS_DIR

    if not RECORDINGS_DIR.is_dir():
        return 0
    n = 0
    for f in RECORDINGS_DIR.iterdir():
        if f.is_file() and datetime.fromtimestamp(f.stat().st_mtime, timezone.utc) < cutoff:
            f.unlink(missing_ok=True)
            n += 1
    return n


def retention_tick(session: Session) -> None:
    """Called by the scheduler; sweeps at most once an hour."""
    global _last_sweep
    now = time.monotonic()
    if _last_sweep is not None and now - _last_sweep < SWEEP_EVERY_S:
        return
    _last_sweep = now
    try:
        sweep_recordings(session)
    except Exception:
        session.rollback()
        log.exception("Recording retention sweep failed; it will run again in an hour")

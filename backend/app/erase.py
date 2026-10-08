"""Right to erasure: delete one person and everything recorded about them.

Removes their check-ins (and call recordings), cases and events, then the person. Events that
named them are deleted rather than edited, so no name, phone or address survives in the feed.
"""
import logging

from sqlmodel import Session, select

from app.models import Case, CheckIn, Elder, Event

log = logging.getLogger(__name__)


def _erase_recording(url: str) -> bool:
    if url.startswith("local:"):
        from app.routes.phone import RECORDINGS_DIR
        (RECORDINGS_DIR / url.removeprefix("local:")).unlink(missing_ok=True)
        return True
    try:  # Twilio-hosted: .../Recordings/RE...; best effort, credentials may be absent
        from app.telephony import _twilio
        sid = url.rstrip("/").split("/")[-1].split(".")[0]
        if sid.startswith("RE"):
            _twilio().recordings(sid).delete()
            return True
    except Exception as exc:
        log.warning("Could not delete Twilio recording: %s", exc)
    return False


def erase_elder(session: Session, elder: Elder) -> dict:
    checkins = list(session.exec(select(CheckIn).where(CheckIn.elder_id == elder.id)))
    recordings = [c.recording_url for c in checkins if c.recording_url]
    erased = sum(_erase_recording(u) for u in recordings)
    cases = list(session.exec(select(Case).where(Case.elder_id == elder.id)))
    case_ids = [c.id for c in cases]
    about = Event.elder_id == elder.id
    if case_ids:
        about = about | Event.case_id.in_(case_ids)
    events = list(session.exec(select(Event).where(about)))
    for row in [*events, *cases, *checkins]:
        session.delete(row)
    session.flush()
    session.delete(elder)
    session.flush()
    return {"checkins": len(checkins), "cases": len(cases), "events": len(events),
            "recordings": len(recordings), "recordings_deleted": erased}

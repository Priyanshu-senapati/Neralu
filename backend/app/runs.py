"""Start a fresh run: new run_id, clock re-anchored, weather back to a normal day."""
import uuid

from sqlmodel import Session

from app.db import set_run_id
from app.events import log_event
from app.state import reset_state


def start_new_run(session: Session) -> str:
    run_id = uuid.uuid4().hex[:12]
    set_run_id(run_id)
    reset_state()
    log_event(session, "run_reset", "New demo run started", actor="officer", data={"run_id": run_id})
    session.commit()
    return run_id

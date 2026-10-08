"""Start a fresh run: new run_id, clock re-anchored, weather back to a normal day, reseeded.

Webhooks and timers belonging to the previous run are ignored from here on.
"""
import uuid

from sqlmodel import Session

from app.db import set_run_id
from app.events import log_event
from app.state import reset_state
from seed.seed import seed_run


def start_new_run(session: Session) -> str:
    run_id = uuid.uuid4().hex[:12]
    set_run_id(run_id)
    reset_state()
    seed_run(session, run_id)
    log_event(session, "run_reset", "New demo run started · Ward 47 · demo ward", actor="officer",
              data={"run_id": run_id})
    session.commit()
    return run_id

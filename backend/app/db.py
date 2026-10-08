import logging
from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

log = logging.getLogger(__name__)

_url = get_settings().database_url
_sqlite = _url.startswith("sqlite")
engine = create_engine(_url, connect_args={"check_same_thread": False, "timeout": 15} if _sqlite else {})

if _sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _record) -> None:
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()

_run_id: str | None = None


def create_tables() -> None:
    """Create tables, rebuilding them if an older schema is on disk (e.g. a neralu.db from before a
    column was added). Safe because every start begins a fresh demo run; old runs are never read."""
    from sqlalchemy import inspect

    existing = inspect(engine)
    stale = [t.name for t in SQLModel.metadata.sorted_tables
             if existing.has_table(t.name)
             and {c.name for c in t.columns} - {c["name"] for c in existing.get_columns(t.name)}]
    if stale:
        log.warning("Database schema is out of date (%s); rebuilding tables", ", ".join(stale))
        SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def current_run_id() -> str:
    """The active run. Rows and webhooks carrying any other run_id are ignored."""
    if _run_id is None:
        raise RuntimeError("No active run; call set_run_id() (via reset) first")
    return _run_id


def set_run_id(run_id: str) -> None:
    global _run_id
    _run_id = run_id

from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

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

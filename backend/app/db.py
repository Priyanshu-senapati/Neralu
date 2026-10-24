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
    """Create tables, adding any column a newer version introduced (pilot days keep their data).
    If a column cannot be added in place, the tables are rebuilt as a last resort."""
    from sqlalchemy import inspect, text

    existing = inspect(engine)
    missing = [(t, c) for t in SQLModel.metadata.sorted_tables if existing.has_table(t.name)
               for c in t.columns if c.name not in {x["name"] for x in existing.get_columns(t.name)}]
    try:
        with engine.begin() as conn:
            for t, c in missing:
                log.warning("Adding column %s.%s", t.name, c.name)
                conn.execute(text(f'ALTER TABLE "{t.name}" ADD COLUMN "{c.name}" '
                                  f'{c.type.compile(dialect=engine.dialect)}'))
    except Exception:
        log.exception("Could not add columns in place; rebuilding tables")
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

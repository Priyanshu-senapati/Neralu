"""SQLModel tables (plan §6.1). Every row carries run_id; rows from other runs are ignored."""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

CODE_WORDS = ("mallige", "sampige", "sevanthige", "tulasi", "maavu",
              "bevu", "kaveri", "chandra", "nakshatra", "gulabi")
LANGUAGES = ("kn", "ta", "te", "ur", "hi")
ROOF_TYPES = ("sheet", "tile", "concrete", "top_floor")
TERMINAL_CALL_STATUSES = ("completed", "busy", "no-answer", "failed", "canceled")
RESOLUTIONS = ("safe_in_person", "support_delivered", "called_108", "not_found_escalate")
TIERS = ("neighbour", "volunteer", "asha")

EVENT_KINDS = (
    "run_reset", "sim_weather_set", "round_started", "call_placed", "call_ringing",
    "call_answered", "answer_recorded", "call_ended", "attempt_failed", "retry_scheduled",
    "checkin_classified", "recall_scheduled", "case_opened", "tier_alerted", "tier_skipped",
    "tier_overdue", "case_accepted", "case_resolved", "family_notified", "elder_registered",
)


def utcnow() -> datetime:
    """Real time, tz-aware UTC."""
    return datetime.now(timezone.utc)


class Elder(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    name: str
    age: int
    phone: str | None = None
    language: str = "kn"
    lives_alone: bool = False
    roof_type: str = "concrete"
    has_fan: bool = True
    heat_sensitive_meds: bool = False
    hearing_difficulty: bool = False
    cognitive_flag: bool = False
    neighbour_phone: str | None = None
    family_phone: str | None = None
    family_name: str | None = None
    code_word: str = "mallige"
    address: str = ""
    lat: float = 0.0
    lng: float = 0.0
    is_simulated: bool = True
    consent_given_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)


class CheckIn(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    elder_id: int = Field(foreign_key="elder.id", index=True)
    round_no: int
    attempt: int = 1
    is_recall: bool = False
    scheduled_for_real: datetime = Field(default_factory=utcnow)
    started: bool = False
    call_sid: str | None = Field(default=None, index=True)
    call_status: str | None = None
    answers: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    recording_url: str | None = None
    transcript: str | None = None
    outcome: str | None = None
    rule_id: str | None = None
    reason: str | None = None
    needs_support: bool = False
    processed: bool = False
    classified_real: datetime | None = None
    is_simulated: bool = False


class Case(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    elder_id: int = Field(foreign_key="elder.id", index=True)
    level: str  # red | support
    rule_id: str
    reason: str
    state: str = "open"  # open | assigned | resolved
    tier: str = "volunteer"
    tier_started_real: datetime = Field(default_factory=utcnow)
    overdue: bool = False
    assignee_id: int | None = None
    resolution: str | None = None
    resolution_note: str | None = None
    opened_real: datetime = Field(default_factory=utcnow)
    resolved_real: datetime | None = None
    sim_accept_at_real: datetime | None = None  # simulated cases only: when a sim volunteer accepts


class Volunteer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    name: str
    role: str = "volunteer"  # volunteer | asha
    phone: str = ""
    token: str = Field(index=True)
    lat: float = 0.0
    lng: float = 0.0
    on_duty: bool = True
    is_simulated: bool = True


class Event(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    ts_real: datetime = Field(default_factory=utcnow)
    ts_scenario: str
    kind: str = Field(index=True)
    elder_id: int | None = Field(default=None, index=True)
    case_id: int | None = Field(default=None, index=True)
    checkin_id: int | None = None
    actor: str = "system"
    message: str
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    simulated: bool = False

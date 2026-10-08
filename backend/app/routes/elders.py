import random
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from app.db import current_run_id, get_session
from app.events import log_event
from app.erase import erase_elder
from app.models import CODE_WORDS, LANGUAGES, ROOF_TYPES, Elder, Event
from app.risk import vulnerability_score
from app.views import elder_detail, elder_items
from seed.seed import CENTER_LAT, CENTER_LNG, HALF_LAT, HALF_LNG

router = APIRouter(prefix="/api")

STATUS_FILTERS = ("GREEN", "AMBER", "RED", "UNREACHED", "escalated", "support", "pending")


def normalise_phone(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    digits = re.sub(r"[^\d+]", "", value)
    if re.fullmatch(r"\d{10}", digits):
        digits = "+91" + digits
    if not re.fullmatch(r"\+\d{10,15}", digits):
        raise ValueError("Enter a 10-digit mobile number or a number starting with +")
    return digits


class RegisterElder(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    age: int = Field(ge=50, le=110)
    phone: str
    language: str
    lives_alone: bool
    roof_type: str
    has_fan: bool
    heat_sensitive_meds: bool
    hearing_difficulty: bool
    cognitive_flag: bool
    neighbour_phone: str | None = None
    family_name: str = Field(min_length=2, max_length=60)
    family_phone: str
    code_word: str
    address: str = Field(min_length=5, max_length=200)
    consent: bool

    @field_validator("phone", "family_phone", "neighbour_phone")
    @classmethod
    def _phone(cls, v):
        return normalise_phone(v)

    @field_validator("language")
    @classmethod
    def _lang(cls, v):
        if v not in LANGUAGES:
            raise ValueError("Unknown language")
        return v

    @field_validator("roof_type")
    @classmethod
    def _roof(cls, v):
        if v not in ROOF_TYPES:
            raise ValueError("Unknown roof type")
        return v

    @field_validator("code_word")
    @classmethod
    def _code(cls, v):
        if v not in CODE_WORDS:
            raise ValueError("Choose a code word from the list")
        return v


@router.get("/elders")
def list_elders(status: str | None = None, session: Session = Depends(get_session)) -> list[dict]:
    items = elder_items(session)
    if status is None:
        return items
    if status not in STATUS_FILTERS:
        raise HTTPException(422, f"status must be one of {', '.join(STATUS_FILTERS)}")
    if status == "escalated":
        return [i for i in items if i["open_case"] and i["open_case"]["level"] == "red"]
    if status == "support":
        return [i for i in items if i["open_case"] and i["open_case"]["level"] == "support"]
    if status == "pending":
        return [i for i in items if i["current_call"]]
    return [i for i in items if i["latest"]["outcome"] == status]


@router.get("/elders/{elder_id}")
def get_elder(elder_id: int, session: Session = Depends(get_session)) -> dict:
    e = session.get(Elder, elder_id)
    if e is None or e.run_id != current_run_id():
        raise HTTPException(404, "Not found")
    return elder_detail(session, e)


class DeleteIn(BaseModel):
    registration: str  # NRL-W47-00042, shown only to the family on the confirmation screen


def registration_number(elder_id: int) -> str:
    return f"NRL-W47-{elder_id:05d}"


@router.delete("/elders/{elder_id}")
def delete_elder(elder_id: int, body: DeleteIn, session: Session = Depends(get_session)) -> dict:
    """Right to erasure: removes a person registered through the app and everything about them."""
    e = session.get(Elder, elder_id)
    if e is None or e.run_id != current_run_id():
        raise HTTPException(404, "Not found")
    registered = session.exec(select(Event.id).where(
        Event.run_id == current_run_id(), Event.kind == "elder_registered", Event.elder_id == elder_id)).first()
    if not registered:
        raise HTTPException(409, "Only people registered through Neralu can be removed here")
    if body.registration.strip().upper() != registration_number(elder_id):
        raise HTTPException(403, "Registration number does not match")
    removed = erase_elder(session, e)
    log_event(session, "elder_deleted", "A registration was removed at the family's request · all their data deleted",
              actor="family", data=removed)
    session.commit()
    return {"deleted": True, **removed}


@router.post("/elders", status_code=201)
def register(body: RegisterElder, session: Session = Depends(get_session)) -> dict:
    if not body.consent:
        raise HTTPException(422, "Consent is required")
    # No geocoding in the MVP: place the dot at an approximate point inside the ward.
    rng = random.Random(body.phone)
    data = body.model_dump(exclude={"consent"})
    e = Elder(run_id=current_run_id(), is_simulated=False,
              lat=round(CENTER_LAT + rng.uniform(-HALF_LAT, HALF_LAT) * 0.6, 6),
              lng=round(CENTER_LNG + rng.uniform(-HALF_LNG, HALF_LNG) * 0.6, 6), **data)
    session.add(e)
    session.flush()
    score, _ = vulnerability_score(e)
    log_event(session, "elder_registered",
              f"{e.name}, {e.age} registered by {e.family_name} · risk score {score}",
              actor="family", elder_id=e.id, data={"risk_score": score})
    session.commit()
    session.refresh(e)
    return elder_detail(session, e)

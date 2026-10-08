"""Demo controls. Everything here is simulated and labelled as such."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.calls import start_round
from app.db import get_session
from app.events import log_event
from app.runs import start_new_run
from app.state import Weather, state
from app.views import summary

router = APIRouter(prefix="/api/sim")


class HeatIn(BaseModel):
    temp_c: float = Field(ge=10, le=55)
    humidity_pct: float = Field(ge=0, le=100)
    night_min_c: float = Field(ge=5, le=40)


@router.post("/heat")
def set_heat(body: HeatIn, session: Session = Depends(get_session)) -> dict:
    state.weather = Weather(body.temp_c, body.humidity_pct, body.night_min_c)
    w = state.weather.as_dict()
    log_event(session, "sim_weather_set",
              f"Simulated weather set: {body.temp_c:g} °C, {body.humidity_pct:g} % humidity, "
              f"heat index {w['heat_index_c']:g} °C, night min {body.night_min_c:g} °C",
              actor="officer", data=w, simulated=True)
    session.commit()
    return summary(session)


@router.post("/reset")
def reset(session: Session = Depends(get_session)) -> dict:
    return {"run_id": start_new_run(session)}


class RoundIn(BaseModel):
    round_no: int = Field(ge=1, le=2)


@router.post("/round")
def start(body: RoundIn, session: Session = Depends(get_session)) -> dict:
    return {"created": start_round(session, body.round_no)}

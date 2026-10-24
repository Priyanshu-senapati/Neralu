"""Demo controls. Everything here is simulated and labelled as such."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import family
from app.calls import start_round
from app.db import current_run_id, get_session
from app.events import log_event
from app.models import Elder
from app.runs import start_new_run
from app.state import Weather, state
from app.weather import ForecastUnavailable, bengaluru_today
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


@router.post("/heat/live")
def set_live_heat(session: Session = Depends(get_session)) -> dict:
    """Today's real Bengaluru forecast becomes the run's weather (not simulated)."""
    try:
        state.weather = bengaluru_today()
    except ForecastUnavailable as exc:
        raise HTTPException(503, f"{exc}. Use a simulated preset instead.") from exc
    w = state.weather.as_dict()
    log_event(session, "sim_weather_set",
              f"Live forecast set (Open-Meteo, Bengaluru, {w['observed_at'][-5:]}): {w['temp_c']:g} °C, "
              f"{w['humidity_pct']:g} % humidity, heat index {w['heat_index_c']:g} °C, night min {w['night_min_c']:g} °C",
              actor="officer", data=w, simulated=False)
    session.commit()
    return summary(session)


@router.post("/reset")
def reset(session: Session = Depends(get_session)) -> dict:
    return {"run_id": start_new_run(session)}


@router.post("/family-link")
def demo_family_link(session: Session = Depends(get_session)) -> dict:
    """A fresh family link for the demo persona only (fictional), so the pitch can show her family's
    view. Registered people's links are only ever given to their family, at registration."""
    kamala = session.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.name == "Kamala R.",
                                              Elder.is_simulated == False)).first()  # noqa: E712
    if kamala is None:
        raise HTTPException(404, "No demo persona in this run")
    token = family.issue(kamala)
    session.commit()
    return {"family_token": token}


class RoundIn(BaseModel):
    round_no: int = Field(ge=1, le=2)


@router.post("/round")
def start(body: RoundIn, session: Session = Depends(get_session)) -> dict:
    return {"created": start_round(session, body.round_no)}

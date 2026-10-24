"""What-if planner: the ward's work plan for a heat forecast, without changing the run."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.officer import require_officer
from app.db import get_session
from app.state import Weather, state
from app.weather import ForecastUnavailable, bengaluru_tomorrow
from app.whatif import compare

router = APIRouter(prefix="/api", dependencies=[Depends(require_officer)])  # console only


@router.get("/whatif")
def whatif(temp_c: float = Query(38, ge=10, le=55), humidity_pct: float = Query(40, ge=0, le=100),
           night_min_c: float = Query(27, ge=5, le=40), responders: int | None = Query(None, ge=0, le=500),
           forecast: Literal["tomorrow"] | None = None, session: Session = Depends(get_session)) -> dict:
    """Baseline (the run's weather now) against a scenario: sliders, or tomorrow's real forecast."""
    if forecast == "tomorrow":
        try:
            scenario = bengaluru_tomorrow()
        except ForecastUnavailable as exc:
            raise HTTPException(503, f"{exc}. Use the sliders instead.") from exc
    else:
        scenario = Weather(temp_c, humidity_pct, night_min_c)
    return compare(session, state.weather, scenario, responders)

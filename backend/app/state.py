"""Run-level state: the demo clock, the weather (simulated preset or live forecast) and the current round."""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from app.clock import DemoClock
from app.config import get_settings
from app.risk import heat_index_c, weather_level

IST = timezone(timedelta(hours=5, minutes=30))

NORMAL_DAY = {"temp_c": 31.0, "humidity_pct": 45.0, "night_min_c": 23.0}
HEATWAVE = {"temp_c": 38.0, "humidity_pct": 40.0, "night_min_c": 27.0}


@dataclass
class Weather:
    temp_c: float
    humidity_pct: float
    night_min_c: float
    source: str = "simulated"  # "simulated" (a preset) or "open-meteo" (today's real forecast)
    observed_at: str | None = None  # forecast hour used, for "open-meteo"

    @property
    def heat_index_c(self) -> float:
        return heat_index_c(self.temp_c, self.humidity_pct)

    def as_dict(self) -> dict:
        hi = self.heat_index_c
        return {"temp_c": self.temp_c, "humidity_pct": self.humidity_pct, "heat_index_c": hi,
                "night_min_c": self.night_min_c, "level": weather_level(hi),
                "simulated": self.source == "simulated", "source": self.source, "observed_at": self.observed_at}


@dataclass
class RunState:
    clock: DemoClock
    weather: Weather = field(default_factory=lambda: Weather(**NORMAL_DAY))
    round_no: int | None = None
    run_day: date | None = None  # pilot mode: the calendar day this run covers

def is_pilot() -> bool:
    return get_settings().run_mode == "pilot"


def _demo_start() -> datetime:
    """The demo scenario starts on today's real date (IST) at the configured time, so the console
    shows today's date, the date the person on the phone is living in."""
    t = get_settings().scenario_start
    return datetime.combine(datetime.now(IST).date(), t.time(), tzinfo=t.tzinfo or IST)


def _new_clock() -> DemoClock:
    s = get_settings()
    if is_pilot():
        return DemoClock(1, datetime.now(IST))  # real time: scenario time is the wall clock in IST
    return DemoClock(s.demo_speed, _demo_start())


def person_today() -> date:
    """Today's real date in India: what "What day is it today?" is checked against. Never the demo
    clock's date, which runs ×60 and crosses midnight within minutes; the person lives in real time."""
    return state.clock.real_now().astimezone(IST).date()


state = RunState(clock=_new_clock())


def reset_state() -> None:
    if is_pilot():
        state.clock = _new_clock()
    else:
        state.clock.scenario_start = _demo_start()  # a run started after midnight shows the new date
        state.clock.reset()
    state.weather = Weather(**NORMAL_DAY)
    state.round_no = None

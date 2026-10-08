"""Run-level state: the demo clock, the weather (simulated preset or live forecast) and the current round."""
from dataclasses import dataclass, field

from app.clock import DemoClock
from app.config import get_settings
from app.risk import heat_index_c, weather_level

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


def _new_clock() -> DemoClock:
    s = get_settings()
    return DemoClock(s.demo_speed, s.scenario_start)


state = RunState(clock=_new_clock())


def reset_state() -> None:
    state.clock.reset()
    state.weather = Weather(**NORMAL_DAY)
    state.round_no = None

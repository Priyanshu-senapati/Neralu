"""Demo clock: scenario time runs `speed` times faster than real time (simulated, labelled in UI)."""
from collections.abc import Callable
from datetime import datetime, timedelta

from app.models import utcnow


class DemoClock:
    def __init__(self, speed: int, scenario_start: datetime,
                 now: Callable[[], datetime] = utcnow):
        self.speed = speed
        self.scenario_start = scenario_start
        self._now = now
        self._anchor_real = now()

    def reset(self) -> None:
        """Anchor scenario_start to the current real time."""
        self._anchor_real = self._now()

    def real_now(self) -> datetime:
        return self._now()

    def scenario_now(self) -> datetime:
        return self.to_scenario(self._now())

    def real_seconds(self, scenario_minutes: float) -> float:
        return scenario_minutes * 60 / self.speed

    def real_delta(self, scenario_minutes: float) -> timedelta:
        return timedelta(seconds=self.real_seconds(scenario_minutes))

    def to_scenario(self, real_ts: datetime) -> datetime:
        return self.scenario_start + (real_ts - self._anchor_real) * self.speed

    def scenario_minutes_since(self, real_ts: datetime) -> float:
        return (self._now() - real_ts).total_seconds() * self.speed / 60

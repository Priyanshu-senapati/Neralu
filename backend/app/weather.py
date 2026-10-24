"""Real Bengaluru forecasts from Open-Meteo (free, no key): today's as the run's weather, tomorrow's
for the what-if planner.

Uses the day's hottest forecast hour (its temperature and humidity give the afternoon heat index) and
the day's minimum as the overnight low. One request covers today and tomorrow; cached for 30 minutes
so a stage demo never waits twice.
"""
import time

import httpx

from app.state import Weather

URL = "https://api.open-meteo.com/v1/forecast"
PARAMS = {"latitude": 12.97, "longitude": 77.59, "hourly": "temperature_2m,relative_humidity_2m",
          "daily": "temperature_2m_min", "timezone": "Asia/Kolkata", "forecast_days": 2}
CACHE_S = 30 * 60
_cache: tuple[float, dict] | None = None


class ForecastUnavailable(Exception):
    pass


def parse(payload: dict, day: int = 0) -> Weather:
    """The forecast for `day` (0 today, 1 tomorrow): hottest hour of that date and its overnight low."""
    try:
        times = payload["hourly"]["time"]
        temps = payload["hourly"]["temperature_2m"]
        hums = payload["hourly"]["relative_humidity_2m"]
        date = sorted({t[:10] for t in times})[day]
        hours = [i for i, t in enumerate(times) if t.startswith(date)]
        hottest = max(hours, key=lambda i: temps[i])
        night = payload["daily"]["temperature_2m_min"][day]
        return Weather(round(float(temps[hottest]), 1), round(float(hums[hottest]), 1), round(float(night), 1),
                       source="open-meteo", observed_at=times[hottest])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ForecastUnavailable(f"Unexpected forecast format: {exc}") from exc


def _payload() -> dict:
    global _cache
    if _cache and time.monotonic() - _cache[0] < CACHE_S:
        return _cache[1]
    try:
        res = httpx.get(URL, params=PARAMS, timeout=6)
        res.raise_for_status()
        payload = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ForecastUnavailable(f"Could not reach Open-Meteo: {exc}") from exc
    _cache = (time.monotonic(), payload)
    return payload


def bengaluru_today() -> Weather:
    return parse(_payload(), 0)


def bengaluru_tomorrow() -> Weather:
    return parse(_payload(), 1)


def clear_cache() -> None:
    global _cache
    _cache = None

"""Today's real Bengaluru forecast from Open-Meteo (free, no key), as the run's weather.

Uses the hottest forecast hour (its temperature and humidity give the afternoon heat index) and
the day's minimum as the overnight low. Cached for 30 minutes so a stage demo never waits twice.
"""
import time

import httpx

from app.state import Weather

URL = "https://api.open-meteo.com/v1/forecast"
PARAMS = {"latitude": 12.97, "longitude": 77.59, "hourly": "temperature_2m,relative_humidity_2m",
          "daily": "temperature_2m_min", "timezone": "Asia/Kolkata", "forecast_days": 1}
CACHE_S = 30 * 60
_cache: tuple[float, Weather] | None = None


class ForecastUnavailable(Exception):
    pass


def parse(payload: dict) -> Weather:
    try:
        temps = payload["hourly"]["temperature_2m"]
        hums = payload["hourly"]["relative_humidity_2m"]
        hottest = max(range(len(temps)), key=lambda i: temps[i])
        night = payload["daily"]["temperature_2m_min"][0]
        return Weather(round(float(temps[hottest]), 1), round(float(hums[hottest]), 1), round(float(night), 1),
                       source="open-meteo", observed_at=payload["hourly"]["time"][hottest])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ForecastUnavailable(f"Unexpected forecast format: {exc}") from exc


def bengaluru_today() -> Weather:
    global _cache
    if _cache and time.monotonic() - _cache[0] < CACHE_S:
        return _cache[1]
    try:
        res = httpx.get(URL, params=PARAMS, timeout=6)
        res.raise_for_status()
    except httpx.HTTPError as exc:
        raise ForecastUnavailable(f"Could not reach Open-Meteo: {exc}") from exc
    weather = parse(res.json())
    _cache = (time.monotonic(), weather)
    return weather


def clear_cache() -> None:
    global _cache
    _cache = None

"""Live Bengaluru forecast as the run's weather (Open-Meteo mocked; tests never hit the network)."""
import httpx
import pytest

from app import weather

PAYLOAD = {
    "hourly": {"time": ["2026-10-09T13:00", "2026-10-09T14:00", "2026-10-09T15:00"],
               "temperature_2m": [33.0, 36.4, 35.1], "relative_humidity_2m": [40, 38, 41]},
    "daily": {"temperature_2m_min": [26.2]},
}


@pytest.fixture(autouse=True)
def fresh_cache():
    weather.clear_cache()
    yield
    weather.clear_cache()


def fake_get(payload=PAYLOAD, fail=False):
    calls = []

    def get(url, params, timeout):
        calls.append(url)
        if fail:
            raise httpx.ConnectError("offline")
        return httpx.Response(200, json=payload, request=httpx.Request("GET", url))
    return get, calls


def test_parse_uses_the_hottest_hour_and_the_overnight_low():
    w = weather.parse(PAYLOAD)
    assert (w.temp_c, w.humidity_pct, w.night_min_c) == (36.4, 38.0, 26.2)
    assert w.source == "open-meteo" and w.observed_at == "2026-10-09T14:00"


def test_parse_rejects_an_unexpected_shape():
    with pytest.raises(weather.ForecastUnavailable):
        weather.parse({"hourly": {}})


def test_forecast_is_cached(monkeypatch):
    get, calls = fake_get()
    monkeypatch.setattr(weather.httpx, "get", get)
    weather.bengaluru_today()
    weather.bengaluru_today()
    assert len(calls) == 1


def test_live_endpoint_sets_real_weather(client, monkeypatch):
    get, _ = fake_get()
    monkeypatch.setattr(weather.httpx, "get", get)
    w = client.post("/api/sim/heat/live").json()["weather"]
    assert w["source"] == "open-meteo" and w["simulated"] is False and w["temp_c"] == 36.4
    events = client.get("/api/events").json()
    assert any("Live forecast set" in e["message"] and not e["simulated"] for e in events)


def test_live_endpoint_offline_is_a_clear_503(client, monkeypatch):
    get, _ = fake_get(fail=True)
    monkeypatch.setattr(weather.httpx, "get", get)
    res = client.post("/api/sim/heat/live")
    assert res.status_code == 503 and "simulated preset" in res.json()["detail"]
    assert client.get("/api/summary").json()["weather"]["simulated"] is True  # unchanged


def test_presets_stay_simulated(client):
    w = client.post("/api/sim/heat", json={"temp_c": 38, "humidity_pct": 40, "night_min_c": 27}).json()["weather"]
    assert w["source"] == "simulated" and w["simulated"] is True

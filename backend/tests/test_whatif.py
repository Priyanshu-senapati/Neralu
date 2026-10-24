"""What-if planner: same selection as a real round, expectations labelled simulated, run untouched."""
import httpx
import pytest

from app import weather
from app.sim_caller import SCENARIOS
from app.whatif import expected_rates

HEATWAVE = {"temp_c": 38, "humidity_pct": 40, "night_min_c": 27}


def test_rates_are_exclusive_and_come_from_the_mix():
    r = expected_rates()
    parts = r["fine"] + r["follow_up"] + r["red"] + r["support"] + r["no_answer_first_try"]
    assert parts == pytest.approx(1.0)
    total = sum(w for w, _ in SCENARIOS.values())
    assert r["red"] == pytest.approx(SCENARIOS["red"][0] / total)
    assert r["support"] == pytest.approx(SCENARIOS["support"][0] / total)
    assert 0 < r["cases"] < 0.2


def test_scenario_calls_match_what_a_real_round_then_does(client):
    plan = client.get("/api/whatif", params=HEATWAVE).json()["scenario"]
    client.post("/api/sim/heat", json=HEATWAVE)
    created = client.post("/api/sim/round", json={"round_no": 1}).json()["created"]
    assert plan["rounds"][0]["calls"] == created
    assert plan["rounds"][0]["real_calls"] == 1  # Kamala


def test_baseline_is_the_run_weather_and_the_run_is_untouched(client):
    before = client.get("/api/summary").json()
    events = len(client.get("/api/events").json())
    d = client.get("/api/whatif", params=HEATWAVE).json()
    assert d["baseline"]["weather"]["heat_index_c"] == before["weather"]["heat_index_c"]
    assert d["scenario"]["weather"]["simulated"] is True and d["simulated"] is True
    assert d["scenario"]["over_threshold"] > d["baseline"]["over_threshold"]
    after = client.get("/api/summary").json()
    assert after["weather"] == before["weather"] and after["round_no"] is None
    assert len(client.get("/api/events").json()) == events


def test_workload_and_shortfall(client):
    full = client.get("/api/whatif", params=HEATWAVE).json()["scenario"]
    assert full["responders_on_duty"] == 8  # 6 volunteers and 2 ASHA workers in the demo ward
    r1 = full["rounds"][0]
    assert r1["responders_needed"] >= 1 and r1["window"] == "11:00–13:00"
    few = client.get("/api/whatif", params={**HEATWAVE, "responders": 2}).json()["scenario"]
    assert few["short"] == few["peak_needed"] - 2 > 0


def test_cool_day_needs_almost_no_one(client):
    d = client.get("/api/whatif", params={"temp_c": 26, "humidity_pct": 50, "night_min_c": 18}).json()
    assert d["scenario"]["calls"] == 0 and d["scenario"]["short"] == 0


TWO_DAYS = {
    "hourly": {"time": ["2026-10-24T14:00", "2026-10-24T15:00", "2026-10-25T14:00", "2026-10-25T15:00"],
               "temperature_2m": [33.0, 32.0, 39.5, 38.0], "relative_humidity_2m": [40, 41, 35, 36]},
    "daily": {"temperature_2m_min": [22.0, 27.4]},
}


def test_tomorrows_real_forecast(client, monkeypatch):
    weather.clear_cache()
    monkeypatch.setattr(weather.httpx, "get", lambda url, params, timeout: httpx.Response(
        200, json=TWO_DAYS, request=httpx.Request("GET", url)))
    w = client.get("/api/whatif", params={"forecast": "tomorrow"}).json()["scenario"]["weather"]
    assert (w["temp_c"], w["night_min_c"], w["observed_at"]) == (39.5, 27.4, "2026-10-25T14:00")
    assert w["source"] == "open-meteo" and w["simulated"] is False
    assert weather.bengaluru_today().temp_c == 33.0
    weather.clear_cache()


def test_tomorrow_offline_is_a_clear_503(client, monkeypatch):
    weather.clear_cache()

    def offline(url, params, timeout):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr(weather.httpx, "get", offline)
    res = client.get("/api/whatif", params={"forecast": "tomorrow"})
    assert res.status_code == 503 and "sliders" in res.json()["detail"]

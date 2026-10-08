from types import SimpleNamespace

import pytest

from app.risk import calls_due, heat_index_c, personal_threshold_c, vulnerability_score, weather_level


def f_to_c(f):
    return (f - 32) * 5 / 9


def elder(**kw):
    base = dict(age=65, lives_alone=False, roof_type="concrete", has_fan=True,
                heat_sensitive_meds=False, hearing_difficulty=False, cognitive_flag=False)
    base.update(kw)
    return SimpleNamespace(**base)


KAMALA = elder(age=74, lives_alone=True, roof_type="sheet", heat_sensitive_meds=True)


# Reference values from the NWS heat index chart (wpc.ncep.noaa.gov/html/heatindex.shtml)
@pytest.mark.parametrize("temp_f,rh,expected_f", [(90, 50, 95), (95, 50, 105), (96, 50, 108), (90, 60, 100), (100, 40, 109)])
def test_heat_index_matches_nws_chart(temp_f, rh, expected_f):
    assert heat_index_c(f_to_c(temp_f), rh) == pytest.approx(f_to_c(expected_f), abs=0.5)


def test_heat_index_35c_50pct():
    # The plan guessed ~41.7; the NWS regression (and calculator) give 105 F = 40.7 C.
    assert heat_index_c(35, 50) == pytest.approx(40.7, abs=0.3)


def test_heat_index_low_temp_uses_simple_formula():
    # 25 C / 50 %: simple Steadman formula gives ~24.9 C, below 80 F
    assert heat_index_c(25, 50) == pytest.approx(24.9, abs=0.5)


def test_heat_index_rounded_to_1dp():
    hi = heat_index_c(38, 40)
    assert hi == round(hi, 1)


def test_kamala_score_is_70():
    score, breakdown = vulnerability_score(KAMALA)
    assert score == 70
    assert breakdown == [("Age 74", 20), ("Lives alone", 20), ("Sheet roof", 15),
                         ("Heat-sensitive medicines", 15)]


def test_score_all_factors_capped_at_100():
    e = elder(age=85, lives_alone=True, roof_type="sheet", has_fan=False,
              heat_sensitive_meds=True, hearing_difficulty=True, cognitive_flag=True)
    score, breakdown = vulnerability_score(e)
    assert score == 100
    assert ("No fan", 10) in breakdown and ("Memory difficulty", 10) in breakdown


def test_score_age_bands_and_top_floor():
    assert vulnerability_score(elder(age=60))[0] == 10
    assert vulnerability_score(elder(age=80, roof_type="top_floor")) == (38, [("Age 80", 30), ("Top floor", 8)])
    assert vulnerability_score(elder(age=59))[0] == 0


def test_threshold():
    assert personal_threshold_c(70, night_min_c=24) == 33.0
    assert personal_threshold_c(70, night_min_c=27) == 32.0
    assert personal_threshold_c(70, night_min_c=26) == 32.0
    assert personal_threshold_c(25, night_min_c=20) == 37.0
    assert personal_threshold_c(0, night_min_c=20) == 40.0
    assert personal_threshold_c(100, night_min_c=20) == 30.0


def test_calls_due_boundaries():
    # Kamala: threshold 33.0 at night_min 24
    assert calls_due(KAMALA, heat_index=32.9, night_min_c=24) == 0
    assert calls_due(KAMALA, heat_index=33.0, night_min_c=24) == 1
    assert calls_due(KAMALA, heat_index=35.9, night_min_c=24) == 1
    assert calls_due(KAMALA, heat_index=36.0, night_min_c=24) == 2


def test_weather_level():
    assert weather_level(32.9) == "normal"
    assert weather_level(33.0) == "caution"
    assert weather_level(37.0) == "severe_for_vulnerable"

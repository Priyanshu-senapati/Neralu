from datetime import date

from app.orientation import parse_weekday, score_orientation

FRI = date(2026, 10, 9)  # scenario day


def test_parse_kannada():
    assert parse_weekday("ಇವತ್ತು ಗುರುವಾರ") == 3
    assert parse_weekday("ಶುಕ್ರವಾರ") == 4


def test_parse_hindi_and_alternates():
    assert parse_weekday("आज बृहस्पतिवार है") == 3
    assert parse_weekday("इतवार") == 6
    assert parse_weekday("रविवार") == 6


def test_parse_english_and_transliterations():
    assert parse_weekday("Today is Monday") == 0
    assert parse_weekday("shukravara") == 4
    assert parse_weekday("ivattu SOMVAR") == 0


def test_parse_none():
    assert parse_weekday("not sure") is None
    assert parse_weekday("") is None


def test_parse_multiple_distinct_is_none():
    assert parse_weekday("today is monday and tuesday") is None


def test_score():
    assert score_orientation("ಶುಕ್ರವಾರ", FRI) == "correct"
    assert score_orientation("friday", FRI) == "correct"
    assert score_orientation("ಗುರುವಾರ", FRI) == "wrong"
    assert score_orientation("today is monday and tuesday", FRI) == "uncertain"
    assert score_orientation("hmm", FRI) == "uncertain"
    assert score_orientation("", FRI) == "none"
    assert score_orientation("   ", FRI) == "none"
    assert score_orientation(None, FRI) == "none"

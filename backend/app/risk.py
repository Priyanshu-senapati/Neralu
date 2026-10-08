"""Who needs a call today: heat index, personal vulnerability and personal threshold (plan §7.1).

Thresholds are starting values to be calibrated in a pilot.
"""
import math
from typing import Literal, Protocol


class ElderLike(Protocol):
    age: int
    lives_alone: bool
    roof_type: str
    has_fan: bool
    heat_sensitive_meds: bool
    hearing_difficulty: bool
    cognitive_flag: bool


WeatherLevel = Literal["normal", "caution", "severe_for_vulnerable"]


def heat_index_c(temp_c: float, humidity_pct: float) -> float:
    """NOAA/NWS heat index (Rothfusz regression with adjustments), in °C to 1 dp."""
    t = temp_c * 9 / 5 + 32
    rh = humidity_pct
    hi = 0.5 * (t + 61.0 + (t - 68.0) * 1.2 + rh * 0.094)
    if (hi + t) / 2 >= 80:
        hi = (
            -42.379 + 2.04901523 * t + 10.14333127 * rh
            - 0.22475541 * t * rh - 0.00683783 * t * t
            - 0.05481717 * rh * rh + 0.00122874 * t * t * rh
            + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
        )
        if rh < 13 and 80 <= t <= 112:
            hi -= ((13 - rh) / 4) * math.sqrt((17 - abs(t - 95)) / 17)
        elif rh > 85 and 80 <= t <= 87:
            hi += ((rh - 85) / 10) * ((87 - t) / 5)
    return round((hi - 32) * 5 / 9, 1)


def vulnerability_score(elder: ElderLike) -> tuple[int, list[tuple[str, int]]]:
    breakdown: list[tuple[str, int]] = []
    if elder.age >= 80:
        breakdown.append((f"Age {elder.age}", 30))
    elif elder.age >= 70:
        breakdown.append((f"Age {elder.age}", 20))
    elif elder.age >= 60:
        breakdown.append((f"Age {elder.age}", 10))
    if elder.lives_alone:
        breakdown.append(("Lives alone", 20))
    if elder.roof_type == "sheet":
        breakdown.append(("Sheet roof", 15))
    elif elder.roof_type == "top_floor":
        breakdown.append(("Top floor", 8))
    if elder.heat_sensitive_meds:
        breakdown.append(("Heat-sensitive medicines", 15))
    if not elder.has_fan:
        breakdown.append(("No fan", 10))
    if elder.cognitive_flag:
        breakdown.append(("Memory difficulty", 10))
    if elder.hearing_difficulty:
        breakdown.append(("Hearing difficulty", 5))
    return min(100, sum(p for _, p in breakdown)), breakdown


def personal_threshold_c(score: int, night_min_c: float) -> float:
    # Round half up: Python's round() is banker's rounding and would turn 2.5 into 2.
    threshold = 40.0 - math.floor(score / 10 + 0.5)
    if night_min_c >= 26:
        threshold -= 1.0
    return threshold


def calls_due(elder: ElderLike, heat_index: float, night_min_c: float) -> int:
    """0 = no call; 1 = call at 11:00; 2 = calls at 11:00 and 15:00 (scenario time)."""
    score, _ = vulnerability_score(elder)
    threshold = personal_threshold_c(score, night_min_c)
    if heat_index < threshold:
        return 0
    if heat_index < threshold + 3:
        return 1
    return 2


def weather_level(heat_index: float) -> WeatherLevel:
    if heat_index >= 37:
        return "severe_for_vulnerable"
    if heat_index >= 33:
        return "caution"
    return "normal"

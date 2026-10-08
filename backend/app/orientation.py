"""Score the spoken answer to "What day is it today?" (plan §7.4). Deterministic dictionary."""
from datetime import date

from app.rules import Orientation

# 0=Mon … 6=Sun. Matched as case-insensitive substrings.
WEEKDAYS: dict[int, list[str]] = {
    0: ["ಸೋಮವಾರ", "सोमवार", "monday", "somavara", "somvar"],
    1: ["ಮಂಗಳವಾರ", "मंगलवार", "tuesday", "mangalavara", "mangalvar"],
    2: ["ಬುಧವಾರ", "बुधवार", "wednesday", "budhavara", "budhvar"],
    3: ["ಗುರುವಾರ", "गुरुवार", "बृहस्पतिवार", "thursday", "guruvara", "guruvar"],
    4: ["ಶುಕ್ರವಾರ", "शुक्रवार", "friday", "shukravara", "shukravar"],
    5: ["ಶನಿವಾರ", "शनिवार", "saturday", "shanivara", "shanivar"],
    6: ["ಭಾನುವಾರ", "रविवार", "इतवार", "sunday", "bhanuvara", "ravivar", "itvar"],
}


def parse_weekday(transcript: str) -> int | None:
    """The single weekday named in the transcript; None if no weekday or several distinct ones."""
    text = (transcript or "").casefold()
    days = {day for day, words in WEEKDAYS.items() if any(w in text for w in words)}
    return days.pop() if len(days) == 1 else None


def score_orientation(transcript: str | None, today: date) -> Orientation:
    if transcript is None or not transcript.strip():
        return "none"
    weekday = parse_weekday(transcript)
    if weekday is None:
        return "uncertain"
    return "correct" if weekday == today.weekday() else "wrong"

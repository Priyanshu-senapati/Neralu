"""Deterministic safety rules. This module alone decides outcomes (plan §7.2).

First matching rule wins. `needs_support` (S1) is computed independently.
A self-report of "ok" never overrides any other signal.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Literal

Answer = Literal["yes", "no", "none"]
Orientation = Literal["correct", "wrong", "uncertain", "none"]
SelfReport = Literal["ok", "help", "none"]


class Outcome(str, Enum):
    GREEN = "GREEN"
    AMBER = "AMBER"
    RED = "RED"
    UNREACHED = "UNREACHED"


@dataclass(frozen=True)
class Signals:
    water: Answer
    symptoms: Answer
    room_hot: Answer
    fan_working: Answer
    orientation: Orientation
    self_report: SelfReport


@dataclass(frozen=True)
class Verdict:
    outcome: Outcome
    rule_id: str
    reason: str
    needs_support: bool


def _keypad_missing(s: Signals) -> int:
    return [s.water, s.symptoms, s.room_hot, s.fan_working].count("none")


def _rule(s: Signals) -> tuple[Outcome, str, str]:
    if _keypad_missing(s) == 4:
        return Outcome.UNREACHED, "R0", "No valid answer on the call"
    if s.self_report == "help":
        return Outcome.RED, "R1", "Asked for help"
    if s.symptoms == "yes" and s.orientation in ("wrong", "uncertain"):
        return Outcome.RED, "R2", "Symptoms with possible confusion"
    if s.symptoms == "yes" and s.water == "no":
        return Outcome.RED, "R3", "Symptoms and no water"
    if s.symptoms == "yes":
        return Outcome.AMBER, "R4", "Reported dizziness, weakness or confusion"
    if s.orientation == "wrong":
        return Outcome.AMBER, "R5", "Did not know the day"
    if s.water == "no":
        return Outcome.AMBER, "R6", "No water in the last hour"
    if s.orientation in ("uncertain", "none"):
        return Outcome.AMBER, "R7", "Orientation answer unclear"
    if _keypad_missing(s) >= 2:
        return Outcome.AMBER, "R8", "Several questions unanswered"
    return Outcome.GREEN, "R9", "All checks fine"


def classify(signals: Signals) -> Verdict:
    outcome, rule_id, reason = _rule(signals)
    needs_support = signals.room_hot == "yes" and signals.fan_working == "no"
    return Verdict(outcome, rule_id, reason, needs_support)

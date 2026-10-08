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


# Plain-English explanation of every rule a judge, officer or family member may see (plan §7.2).
# Shown next to the rule ID so the reasoning is visible, not just the code.
EXPLANATIONS: dict[str, str] = {
    "R0": "None of the keypad questions got an answer, so the call cannot count as a check. "
          "A picked-up call with no answers is treated as not reached, never as fine.",
    "R1": "They pressed 2 to say they need help now. A request for help always escalates.",
    "R2": "They reported dizziness, weakness or confusion and could not clearly say what day it is. "
          "Confusion is a warning sign of heat illness, so this goes straight to a person.",
    "R3": "They reported dizziness, weakness or confusion and have not had water in the last hour. "
          "Together these point to heat exhaustion, so this goes straight to a person.",
    "R4": "They reported dizziness, weakness or confusion. Neralu informs the family and calls back "
          "soon; a second concerning call escalates to a person.",
    "R5": "They named the wrong day. Saying \"I'm fine\" does not override this, because heat can "
          "cause confusion the person may not notice.",
    "R6": "They have not had water in the last hour. The call ends with advice to drink water now, "
          "the family is informed and Neralu calls back.",
    "R7": "The spoken answer to \"what day is it?\" was missing or unclear. Uncertainty is treated "
          "as a reason to call back, never as a reason to assume they are fine.",
    "R8": "Two or more questions went unanswered, so the check is incomplete and Neralu calls back.",
    "R9": "Every answer was fine: they have had water, feel well, knew the day and said they are okay.",
    "S1": "Their room is very hot and the fan or cooler is not working. A volunteer is asked to help "
          "(for example with a fan, water or ORS) even if the person feels fine.",
    "E1": "Neralu could not reach them after every attempt. Not answering on a heat-risk day is "
          "itself a warning sign, so a person is asked to check in person.",
    "E3": "A follow-up call after a concerning check was also concerning or unanswered, so this now "
          "goes to a person.",
}

# Shown wherever an outcome is explained: the reason rules, not a model, decide.
DECIDED_BY = ("Decided by a fixed, published rule, not by AI. AI is only used to transcribe the "
              "spoken day; when anything is uncertain, Neralu escalates instead of assuming the "
              "person is fine.")


def explain(rule_id: str | None) -> str | None:
    return EXPLANATIONS.get(rule_id) if rule_id else None


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


@dataclass(frozen=True)
class CaregiverSignals:
    """A caregiver's answers about a person with memory difficulty, who is not asked directly:
    the day question cannot tell heat confusion from their usual memory difficulty."""
    seen: Answer             # with them now, or saw them in the last hour
    water: Answer            # they had water in the last hour
    unwell: Answer           # more confused, drowsy or unwell than usual
    room_no_cooling: Answer  # room very hot with no fan or cooler working
    self_report: SelfReport  # "they are okay" / "they need help now"


def _caregiver_rule(s: CaregiverSignals) -> tuple[Outcome, str, str]:
    keypad = [s.seen, s.water, s.unwell, s.room_no_cooling]
    if keypad.count("none") == 4:
        return Outcome.UNREACHED, "C0", "No valid answer from the caregiver"
    if s.self_report == "help":
        return Outcome.RED, "C1", "Caregiver asked for help"
    if s.unwell == "yes":
        return Outcome.RED, "C2", "More confused, drowsy or unwell than usual"
    if s.seen != "yes":
        return Outcome.AMBER, "C3", "Caregiver has not seen them in the last hour"
    if s.water == "no":
        return Outcome.AMBER, "C4", "No water in the last hour"
    if s.unwell == "none" or keypad.count("none") >= 2:
        return Outcome.AMBER, "C5", "Caregiver's check incomplete"
    return Outcome.GREEN, "C6", "Caregiver confirms they are fine"


def classify_caregiver(signals: CaregiverSignals) -> Verdict:
    outcome, rule_id, reason = _caregiver_rule(signals)
    return Verdict(outcome, rule_id, reason, needs_support=signals.room_no_cooling == "yes")


# Plain-English explanation of every rule a judge, officer or family member may see (plan §7.2).
# The single source for this wording: the dashboard reads it from GET /api/rules.
EXPLANATIONS: dict[str, str] = {
    "R0": "No keypad answers came back: the call was not picked up, or was picked up with no answers. "
          "We could not confirm they are safe, so this counts as not reached, never as fine.",
    "R1": "They pressed the key for \"I need help now\". This is escalated straight away, whatever the "
          "other answers were.",
    "R2": "They reported dizziness, weakness or confusion, and could not say what day it is. Together "
          "these can be early signs of heat illness affecting thinking.",
    "R3": "They reported dizziness, weakness or confusion, and had no water in the last hour. Together "
          "these signal heat distress.",
    "R4": "They reported dizziness, weakness or confusion. On its own this needs a follow-up call and a "
          "family check.",
    "R5": "They named the wrong day. Heat can cause confusion, so this is followed up even if they said "
          "they are okay.",
    "R6": "They have not had water in the last hour. Neralu advises them to drink now and calls again later.",
    "R7": "Their answer to \"What day is it today?\" was missing or unclear, so we cannot rule out confusion.",
    "R8": "Two or more questions went unanswered, so the check is incomplete.",
    "R9": "All answers were fine and they knew the day.",
    "E1": "No one answered any of the call attempts, so a person nearby is asked to check in person.",
    "E3": "A follow-up call was still concerning or went unanswered, so this moves to a person checking "
          "in person.",
    "S1": "Their room is very hot and their fan or cooler is not working. A volunteer can bring water, "
          "ORS or a fan.",
    # Caregiver check: people with memory difficulty are checked through their caregiver.
    "C0": "The caregiver gave no keypad answers, so no one has confirmed this person is safe. This counts "
          "as not reached, never as fine.",
    "C1": "The caregiver pressed the key for \"they need help now\". This is escalated straight away.",
    "C2": "The caregiver says they seem more confused, drowsy or unwell than usual. In someone with memory "
          "difficulty, a change like this in the heat can be an early sign of heat illness, so a person "
          "checks in person.",
    "C3": "The caregiver has not seen them in the last hour, so the other answers cannot be relied on. The "
          "caregiver is asked to go and see them now, and Neralu calls back.",
    "C4": "They have not had water in the last hour. The caregiver is asked to give water now, and Neralu "
          "calls back later.",
    "C5": "The caregiver did not say whether they seem unwell, or two or more questions went unanswered, so "
          "the check is incomplete.",
    "C6": "The caregiver is with them or saw them in the last hour, and says they had water and seem their "
          "usual selves.",
}

# Shown wherever an outcome is explained: the reason rules, not a model, decide.
DECIDED_BY = ("Decided by a fixed rule, not by AI. \"I'm okay\" never overrides another warning sign, "
              "and anything unclear is followed up rather than assumed fine.")


def explain(rule_id: str | None) -> str | None:
    return EXPLANATIONS.get(rule_id) if rule_id else None

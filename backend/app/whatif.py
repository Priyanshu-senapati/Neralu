"""What-if planner: turn a heat forecast into a ward work plan before the heat arrives.

Who would be called uses exactly the rules a real round uses (`select_for_round`), so the call counts
match what a round then does. What those calls would find is an *expectation*: the answer mix of the
simulated residents, pushed through the same safety rules. It is labelled simulated, and a pilot
would replace it with measured rates.

Workload: every case needs one responder at the door for VISIT_MIN; a round's cases come in over
CASE_WINDOW_MIN (first calls, retries, follow-up calls). Responders needed at the same time =
cases x VISIT_MIN / CASE_WINDOW_MIN, rounded up.
"""
import math
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.calls import select_for_round
from app.db import current_run_id
from app.models import Elder, Volunteer
from app.pilot import round_times
from app.risk import calls_due
from app.rules import Outcome, Signals, classify
from app.sim_caller import RECALL_FINE, SCENARIOS
from app.state import Weather

VISIT_MIN = 45        # travel, the check at the door, water / ORS / a fan
CASE_WINDOW_MIN = 120  # a round's cases arrive over about two hours


def expected_rates() -> dict[str, float]:
    """Per first call, exclusive shares: fine, needing a follow-up call, red, needing support, not answered
    at first; plus `cases`, the share needing a person (red, support, follow-ups still concerning)."""
    total = sum(w for w, _ in SCENARIOS.values())
    r = {"fine": 0.0, "follow_up": 0.0, "red": 0.0, "support": 0.0, "no_answer_first_try": 0.0, "cases": 0.0}
    for weight, answers in SCENARIOS.values():
        p = weight / total
        if answers is None:
            r["no_answer_first_try"] += p  # in the mix these answer the retry, so no case
            continue
        v = classify(Signals(**answers))
        if v.needs_support:
            key = "support"  # a person brings water or a fan, whatever else they said
        else:
            key = {Outcome.GREEN: "fine", Outcome.AMBER: "follow_up", Outcome.RED: "red"}[v.outcome]
        r[key] += p
        if v.needs_support or v.outcome == Outcome.RED:
            r["cases"] += p  # one visit, even when both
        elif v.outcome == Outcome.AMBER:
            r["cases"] += p * (1 - RECALL_FINE)
    return r


def _hhmm(t) -> str:
    return t.strftime("%H:%M")


def plan(elders: list[Elder], weather: Weather, responders: int) -> dict:
    rates = expected_rates()
    hi, night = weather.heat_index_c, weather.night_min_c
    over = [e for e in elders if calls_due(e, hi, night) >= 1]
    rounds = []
    for n, at in round_times():
        to_call, caregiver = select_for_round(elders, n, weather)
        calls = len(to_call)
        cases = calls * rates["cases"]
        needed = math.ceil(round(cases * VISIT_MIN / CASE_WINDOW_MIN, 6)) if calls else 0
        end = (datetime.combine(datetime.today(), at) + timedelta(minutes=CASE_WINDOW_MIN)).time()
        rounds.append({
            "round_no": n, "at": _hhmm(at), "window": f"{_hhmm(at)}–{_hhmm(end)}",
            "calls": calls, "real_calls": sum(not e.is_simulated for e in to_call), "caregiver_route": caregiver,
            "expected": {k: round(calls * rates[k], 1) for k in
                         ("fine", "follow_up", "red", "support", "no_answer_first_try")},
            "cases": round(cases, 1), "responders_needed": needed, "short": max(0, needed - responders),
        })
    return {
        "weather": weather.as_dict(),
        "residents": len(elders),
        "over_threshold": len(over),
        "rounds": rounds,
        "calls": sum(r["calls"] for r in rounds),
        "cases": round(sum(r["cases"] for r in rounds), 1),
        "responders_on_duty": responders,
        "peak_needed": max((r["responders_needed"] for r in rounds), default=0),
        "short": max((r["short"] for r in rounds), default=0),
    }


def assumptions() -> list[str]:
    r = expected_rates()
    pct = lambda x: f"{x * 100:.0f} %"  # noqa: E731
    return [
        "Who is called uses the same rules as a real round: personal threshold from the risk score, "
        "two calls when the heat index is 3 °C or more above it, caregiver route for memory difficulty.",
        f"What the calls find is simulated: the demo residents' answer mix ({pct(r['fine'])} fine, "
        f"{pct(r['follow_up'])} need a follow-up call, {pct(r['red'])} red, {pct(r['support'])} need support, "
        f"{pct(r['no_answer_first_try'])} miss the first call) through the same safety rules. "
        f"A pilot replaces it with measured rates.",
        f"{pct(1 - RECALL_FINE)} of follow-up calls still need a person.",
        f"Each case needs one responder for about {VISIT_MIN} minutes; a round's cases arrive over "
        f"about {CASE_WINDOW_MIN // 60} hours.",
    ]


def on_duty(session: Session) -> int:
    return len(session.exec(select(Volunteer).where(
        Volunteer.run_id == current_run_id(), Volunteer.on_duty == True)).all())  # noqa: E712


def compare(session: Session, baseline: Weather, scenario: Weather, responders: int | None = None) -> dict:
    elders = list(session.exec(select(Elder).where(Elder.run_id == current_run_id())))
    have = on_duty(session) if responders is None else responders
    return {"baseline": plan(elders, baseline, on_duty(session)),
            "scenario": plan(elders, scenario, have),
            "assumptions": assumptions(), "simulated": True}

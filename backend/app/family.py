"""Family status link: one registered person's heat check today, in plain words, for their family.

Opened with a private, random link (`/family?t=…`) given at registration. It shows this one person
only: no address, no code word, nothing about anyone else.
"""
import secrets
from typing import Any

from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id
from app.models import Case, CheckIn, Elder, Event, Volunteer
from app.risk import personal_threshold_c, vulnerability_score
from app.state import state
from app.views import due_count, resolved_after_latest

TIMELINE_KINDS = ("checkin_classified", "recall_scheduled", "case_opened", "case_accepted",
                  "case_resolved", "tier_overdue")
TIER_WORD = {"neighbour": "neighbour", "volunteer": "volunteer", "asha": "ASHA health worker"}


def new_token() -> str:
    return secrets.token_urlsafe(12)


def link(token: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/family?t={token}"


def find(session: Session, token: str) -> Elder | None:
    if not token:
        return None
    return session.exec(select(Elder).where(Elder.run_id == current_run_id(),
                                            Elder.family_token == token)).first()


def _hhmm(real_ts) -> str:
    return state.clock.to_scenario(real_ts).strftime("%H:%M")


def _first(name: str | None) -> str:
    return (name or "").split(" ")[0]


def _outcome_line(e: Elder, d: dict, caregiver: bool) -> tuple[str, str]:
    who = "Their caregiver" if caregiver else e.name.split(" ")[0]
    outcome, reason = d.get("outcome"), str(d.get("reason", "")).rstrip(".")
    if outcome == "GREEN":
        return f"{who} answered: all fine", "ok"
    if outcome == "AMBER":
        return f"{who} answered: needs a follow-up call ({reason.lower()})", "watch"
    if outcome == "RED":
        return f"{who} answered: needs a person to check ({reason.lower()})", "alert"
    return "Neralu called: no answer", "muted"


def timeline(session: Session, e: Elder) -> list[dict[str, str]]:
    callee = {c.id: c.callee for c in session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.elder_id == e.id))}
    rows = session.exec(select(Event).where(Event.run_id == current_run_id(), Event.elder_id == e.id,
                                            Event.kind.in_(TIMELINE_KINDS)).order_by(Event.id))
    out = []
    for ev in rows:
        d = ev.data or {}
        if ev.kind == "checkin_classified":
            text, tone = _outcome_line(e, d, callee.get(ev.checkin_id) == "caregiver")
        elif ev.kind == "recall_scheduled":
            text, tone = ("Follow-up call booked" + (" to make sure they are still okay" if d.get("aftercare") else ""),
                          "muted")
        elif ev.kind == "case_opened":
            text, tone = "A person nearby was asked to check in person", "alert"
        elif ev.kind == "case_accepted":
            text, tone = f"{_first(d.get('volunteer'))}, a volunteer, accepted and is on the way", "watch"
        elif ev.kind == "case_resolved":
            text, tone = _resolution_text(d.get("resolution"), _first(d.get("volunteer")))
        else:
            text, tone = "The ward office was alerted to arrange a visit", "alert"
        out.append({"time": ev.ts_scenario[11:16], "text": text, "tone": tone})
    return out


def _resolution_text(resolution: str | None, who: str) -> tuple[str, str]:
    return {
        "safe_in_person": (f"{who} checked in person: safe", "ok"),
        "support_delivered": (f"{who} checked in person and brought water / ORS", "ok"),
        "called_108": (f"{who} called 108; they are in medical care", "alert"),
        "not_found_escalate": (f"{who} could not reach them; the next person is being asked", "alert"),
    }.get(resolution or "", ("Visit recorded", "ok"))


def status(session: Session, e: Elder) -> dict[str, Any]:
    run = current_run_id()
    first = e.name.split(" ")[0]
    checkins = list(session.exec(select(CheckIn).where(CheckIn.run_id == run, CheckIn.elder_id == e.id)
                                 .order_by(CheckIn.id)))
    done = [c for c in checkins if c.processed]
    pending = [c for c in checkins if not c.processed]
    last = done[-1] if done else None
    nxt = min(pending, key=lambda c: c.scheduled_for_real) if pending else None
    cases = list(session.exec(select(Case).where(Case.run_id == run, Case.elder_id == e.id).order_by(Case.id)))
    active = next((c for c in reversed(cases) if c.state in ("open", "assigned")), None)
    resolved = next((c for c in reversed(cases) if c.state == "resolved"), None)
    later = f" Neralu will call again at {_hhmm(nxt.scheduled_for_real)}." if nxt and not nxt.started else ""

    if active and active.state == "assigned":
        v = session.get(Volunteer, active.assignee_id)
        headline, tone = f"{_first(v.name) if v else 'A volunteer'}, a volunteer, is on the way to {first}.", "watch"
    elif active and active.overdue:
        headline, tone = f"The ward office has been alerted and is arranging a visit to {first}.", "alert"
    elif active:
        headline, tone = f"Neralu is asking a {TIER_WORD.get(active.tier, 'person')} nearby to visit {first}.", "alert"
    elif nxt and nxt.started:
        headline, tone = f"Neralu is calling {'their caregiver' if nxt.callee == 'caregiver' else first} now.", "neutral"
    elif resolved_after_latest(resolved, last):
        t = _hhmm(resolved.resolved_real)
        headline, tone = {
            "called_108": (f"A volunteer called 108 for {first} at {t}; they are in medical care.", "alert"),
            "support_delivered": (f"{first} was checked in person at {t}; water / ORS was brought.{later}", "ok"),
        }.get(resolved.resolution, (f"{first} was checked in person at {t}: safe.{later}", "ok"))
    elif last and last.outcome == "GREEN":
        t = _hhmm(last.classified_real)
        headline = (f"Their caregiver confirmed {first} is fine at {t}.{later}" if last.callee == "caregiver"
                    else f"{first} answered at {t} · all fine.{later}")
        tone = "ok"
    elif last and last.outcome == "AMBER":
        headline, tone = f"{first} answered at {_hhmm(last.classified_real)}: {str(last.reason).lower()}.{later}", "watch"
    elif last and last.outcome == "UNREACHED":
        headline, tone = f"{first} did not answer at {_hhmm(last.classified_real)}.{later}", "watch"
    elif nxt:
        headline, tone = f"Neralu will call {first} at {_hhmm(nxt.scheduled_for_real)}.", "neutral"
    elif due_count(e) > 0:
        headline, tone = f"It is hot enough today for Neralu to call {first}. The call round has not started yet.", "neutral"
    else:
        headline, tone = f"Not hot enough today for {first} to need a call.", "ok"

    score, _ = vulnerability_score(e)
    return {
        "name": e.name,
        "as_of_scenario": state.clock.scenario_now().isoformat(timespec="seconds"),
        "headline": headline,
        "tone": tone,
        "timeline": timeline(session, e),
        "heat_index_c": state.weather.heat_index_c,
        "weather_simulated": state.weather.source == "simulated",
        "threshold_c": personal_threshold_c(score, state.weather.night_min_c),
        "demo_clock": state.clock.speed != 1,
    }

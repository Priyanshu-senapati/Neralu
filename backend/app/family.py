"""Family status link: a private, read-only page with one registered person's checks today.

The family gets a random link once, at registration (or when they ask for a new one). Only a hash of
it is stored, so the database alone cannot open anyone's page. The page says, in plain words, how that
one person is: never their address, phone numbers or code word, nor the volunteer's name, nor anything
about anyone else. The family can replace the link or turn it off; erasing the registration removes it.
"""
import hashlib
import secrets
from typing import Any

from sqlmodel import Session, select

from app.calls import callee_for
from app.db import current_run_id
from app.events import run_events
from app.models import Case, CheckIn, Elder, Event
from app.risk import personal_threshold_c, vulnerability_score
from app.state import is_pilot, state
from app.views import due_count, elder_checkins

TOKEN_BYTES = 18  # 144 random bits: cannot be guessed

RESOLVED = {
    "safe_in_person": ("Checked in person at {at} · safe", "ok"),
    "support_delivered": ("Checked in person at {at} · water or ORS delivered", "ok"),
    "called_108": ("The volunteer called 108 at {at}", "alert"),
}


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue(elder: Elder) -> str:
    """A new link for this person; any earlier one stops working."""
    token = new_token()
    elder.family_token_hash = token_hash(token)
    return token


def find(session: Session, token: str | None) -> Elder | None:
    if not token or len(token) > 64:
        return None
    return session.exec(select(Elder).where(Elder.run_id == current_run_id(),
                                            Elder.family_token_hash == token_hash(token))).first()


def _hhmm(real_ts) -> str:
    return state.clock.to_scenario(real_ts).strftime("%H:%M")


def _plain(reason: str | None) -> str:
    return (reason[0].lower() + reason[1:]) if reason else ""


def _headline(first: str, e: Elder, latest: CheckIn | None, pending: CheckIn | None,
              case: Case | None, resolved: Case | None, caregiver: bool) -> tuple[str, str]:
    if case is not None:
        if case.state == "assigned":
            return f"A volunteer is on the way to {first}", "watch"
        if case.overdue:
            return f"The ward office has been asked to check on {first}", "alert"
        if case.level == "support":
            return f"A volunteer is being asked to bring {first} water, ORS or a fan", "watch"
        return f"A person nearby is being asked to check on {first}", "alert"
    if pending is not None and pending.started:
        return (f"Neralu is calling {first}'s caregiver now" if pending.callee == "caregiver"
                else f"Neralu is calling {first} now"), "neutral"
    if resolved is not None and (latest is None or latest.classified_real is None
                                 or resolved.resolved_real >= latest.classified_real):
        text, tone = RESOLVED.get(resolved.resolution, ("Checked in person at {at}", "ok"))
        return text.format(at=_hhmm(resolved.resolved_real)), tone
    if latest is not None:
        at = _hhmm(latest.classified_real)
        if latest.outcome == "GREEN":
            return (f"Caregiver confirmed {first} is fine at {at}" if latest.callee == "caregiver"
                    else f"{first} answered at {at} · all fine"), "ok"
        if latest.outcome == "AMBER":
            return f"{first} needs a follow-up call · {_plain(latest.reason)}", "watch"
        if latest.outcome == "UNREACHED":
            return f"No answer at {at}", "watch"
        return f"A person is being sent to {first}", "alert"
    if due_count(e) > 0:
        return (f"{first} is due a check call today" + (" (through their caregiver)" if caregiver else "")), "neutral"
    return f"No call needed today: the heat is below {first}'s personal threshold", "neutral"


def _last_check(latest: CheckIn | None) -> dict[str, Any] | None:
    if latest is None:
        return None
    text = {"GREEN": "All fine", "UNREACHED": "No answer"}.get(latest.outcome or "", latest.reason or "")
    return {"at": _hhmm(latest.classified_real), "text": text, "outcome": latest.outcome,
            "by_caregiver": latest.callee == "caregiver"}


def _next_call(pending: CheckIn | None, aftercare_ids: set[int]) -> dict[str, Any] | None:
    if pending is None or pending.started:
        return None
    kind = ("after-care" if pending.id in aftercare_ids else "follow-up" if pending.is_recall
            else "retry" if pending.attempt > 1 else "check")
    return {"at": _hhmm(pending.scheduled_for_real), "kind": kind,
            "to_caregiver": pending.callee == "caregiver"}


def _timeline(events: list[Event], first: str) -> list[dict[str, str]]:
    """Plain lines a family may see. Anything not listed here (answers, transcripts, volunteer names,
    who else was alerted) never leaves the server through this page."""
    out: list[dict[str, str]] = []
    caregiver = False

    def add(ev: Event, text: str, tone: str = "neutral") -> None:
        out.append({"at": ev.ts_scenario[11:16], "text": text, "tone": tone})

    for ev in events:
        d, msg = ev.data or {}, ev.message
        if ev.kind == "elder_registered":
            add(ev, "Registered with Neralu")
        elif ev.kind == "call_placed":
            if msg.startswith("Call failed"):
                add(ev, "The call could not be placed", "watch")
                continue
            caregiver = "caregiver" in msg
            who = f"{first}'s caregiver" if caregiver else first
            add(ev, f"Neralu made a follow-up call to {who}" if msg.startswith("Recall")
                else f"Neralu called {who} back" if msg.startswith("Calling back")
                else f"Neralu called {who}" + (" again" if int(d.get("attempt", 1)) > 1 else ""))
        elif ev.kind == "missed_call" and d.get("outcome") in ("calling", "sooner"):
            add(ev, f"{'The family' if d.get('from') == 'family' else first} gave Neralu a missed call to ask for a check")
        elif ev.kind == "call_answered":
            add(ev, "The caregiver picked up" if caregiver else f"{first} picked up")
        elif ev.kind == "attempt_failed":
            add(ev, "No answer", "watch")
        elif ev.kind == "checkin_classified" and d.get("outcome") != "UNREACHED":
            outcome = d.get("outcome")
            if outcome == "GREEN":
                add(ev, "All fine", "ok")
            elif outcome == "AMBER":
                add(ev, f"Needs a follow-up: {_plain(d.get('reason'))}", "watch")
            else:
                add(ev, f"Needs a person: {_plain(d.get('reason'))}", "alert")
        elif ev.kind == "retry_scheduled":
            add(ev, f"Neralu will try again at {msg.split(' at ')[-1][:5]}")
        elif ev.kind == "recall_scheduled":
            at = msg.split(" at ")[-1][:5]
            add(ev, f"After-care call booked for {at}" if d.get("aftercare") else f"Follow-up call booked for {at}")
        elif ev.kind == "case_opened":
            add(ev, "A person nearby is being asked to check" if d.get("level") == "red"
                else "A volunteer is being asked to bring water, ORS or a fan", "alert" if d.get("level") == "red" else "watch")
        elif ev.kind == "case_accepted":
            add(ev, "A volunteer accepted and is on the way", "watch")
        elif ev.kind == "case_resolved":
            r = d.get("resolution")
            add(ev, {"safe_in_person": "A volunteer checked in person: safe",
                     "support_delivered": "A volunteer delivered water or ORS",
                     "called_108": "The volunteer called 108",
                     "not_found_escalate": "The volunteer could not reach them; the case was passed on"}.get(r, "Visit recorded"),
                "alert" if r in ("called_108", "not_found_escalate") else "ok")
        elif ev.kind == "tier_overdue":
            add(ev, "The ward office has been asked to act", "alert")
    return out


def family_status(session: Session, e: Elder) -> dict[str, Any]:
    run = current_run_id()
    first = e.name.split()[0]
    checkins = elder_checkins(session, e.id)
    done = [c for c in checkins if c.processed]
    latest = done[-1] if done else None
    pending = next((c for c in checkins if not c.processed), None)
    cases = list(session.exec(select(Case).where(Case.run_id == run, Case.elder_id == e.id).order_by(Case.id)))
    active = [c for c in cases if c.state in ("open", "assigned")]
    case = next((c for c in active if c.level == "red"), active[0] if active else None)
    resolved = max((c for c in cases if c.state == "resolved" and c.resolved_real is not None),
                   key=lambda c: c.resolved_real, default=None)
    events = run_events(session, elder_id=e.id)
    aftercare_ids = {ev.checkin_id for ev in events if ev.kind == "recall_scheduled" and (ev.data or {}).get("aftercare")}
    caregiver = callee_for(e) == "caregiver"
    headline, tone = _headline(first, e, latest, pending, case, resolved, caregiver)
    score, _ = vulnerability_score(e)
    w = state.weather
    threshold = personal_threshold_c(score, w.night_min_c)
    return {
        "name": e.name,
        "first_name": first,
        "headline": headline,
        "tone": tone,
        "last_check": _last_check(latest),
        "next_call": _next_call(pending, aftercare_ids),
        "through_caregiver": caregiver,
        "heat": {"heat_index_c": w.heat_index_c, "threshold_c": threshold,
                 "above_threshold": w.heat_index_c >= threshold, "source": w.source},
        "today": _timeline(events, first),
        "as_of": state.clock.scenario_now().strftime("%H:%M"),
        "pilot": is_pilot(),
        "registered": any(ev.kind == "elder_registered" for ev in events),
    }

"""Call rounds, dispatching due calls, classifying ended calls, retries and recalls (E1–E4)."""
import logging
from dataclasses import replace
from datetime import timedelta

from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id
from app.escalation import open_case
from app.events import log_event
from app.models import CheckIn, Elder
from app.notify import notify_family
from app.rules import Outcome, Signals, classify
from app.state import state
from app.telephony import cancel_call, place_call
from app.views import due_count

log = logging.getLogger(__name__)

MISSED_REASON = {"no-answer": "Did not answer", "busy": "Line busy or declined",
                 "failed": "Call could not be placed",
                 "canceled": "Did not answer"}  # canceled = hung up by our ring timeout
STATUS_LABEL = {"busy": "busy", "no-answer": "no answer", "failed": "call failed",
                "canceled": "call canceled", "completed": "answered, no valid input"}


def _hhmm(real_ts) -> str:
    return state.clock.to_scenario(real_ts).strftime("%H:%M")


def start_round(session: Session, round_no: int) -> int:
    """Create check-ins for every elder due a call this round. Returns how many were created."""
    state.round_no = round_no
    already = {c.elder_id for c in session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.round_no == round_no))}
    elders = session.exec(select(Elder).where(Elder.run_id == current_run_id()))
    created, caregiver = 0, 0
    now = state.clock.real_now()
    for e in elders:
        if due_count(e) < round_no or e.id in already:
            continue
        if e.cognitive_flag:
            caregiver += 1  # caregiver route: counted as due, not called directly in the MVP
            continue
        if not e.is_simulated and not e.phone:
            continue
        session.add(CheckIn(run_id=current_run_id(), elder_id=e.id, round_no=round_no,
                            scheduled_for_real=now, is_simulated=e.is_simulated))
        created += 1
    log_event(session, "round_started",
              f"Round {round_no} started · {created} calls" +
              (f" · {caregiver} on caregiver route" if caregiver else ""),
              actor="officer", data={"round_no": round_no, "created": created,
                                     "caregiver_route": caregiver})
    session.commit()
    return created


def due_real_checkins(session: Session) -> list[CheckIn]:
    return list(session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.is_simulated == False,  # noqa: E712
        CheckIn.started == False, CheckIn.scheduled_for_real <= state.clock.real_now())))  # noqa: E712


def dispatch_due_calls(session: Session) -> None:
    """Place every real call whose time has come. A failed placement is a failed attempt."""
    for c in due_real_checkins(session):
        elder = session.get(Elder, c.elder_id)
        c.started = True
        session.commit()
        try:
            c.call_sid = place_call(elder.phone, c.id)
        except Exception as exc:
            log.warning("Placing call failed: %r", exc)
            log_event(session, "call_placed", "Call failed · number unreachable",
                      actor="twilio", elder_id=elder.id, checkin_id=c.id, data={"error": str(exc)[:200]})
            session.commit()
            handle_call_ended(session, c.id, "failed")
            session.commit()
            continue
        c.call_status = "queued"
        c.placed_real = state.clock.real_now()
        what = "Recall" if c.is_recall else "Calling"
        log_event(session, "call_placed", f"{what} · attempt {c.attempt}", actor="system",
                  elder_id=elder.id, checkin_id=c.id,
                  data={"attempt": c.attempt, "round_no": c.round_no, "call_sid": c.call_sid})
        session.commit()


def cancel_unanswered_calls(session: Session) -> None:
    """Hang up real calls still ringing after RING_TIMEOUT_S (needed where Twilio's own ring
    timeout is unavailable, e.g. trial accounts). Twilio then reports them as canceled."""
    limit = timedelta(seconds=get_settings().ring_timeout_s)
    now = state.clock.real_now()
    ringing = session.exec(select(CheckIn).where(
        CheckIn.run_id == current_run_id(), CheckIn.is_simulated == False,  # noqa: E712
        CheckIn.processed == False, CheckIn.ring_timed_out == False,  # noqa: E712
        CheckIn.call_sid != None, CheckIn.call_status.in_(("queued", "initiated", "ringing"))))  # noqa: E711
    for c in ringing:
        if c.placed_real and now - c.placed_real >= limit and cancel_call(c.call_sid):
            c.ring_timed_out = True
            session.commit()


def schedule_retry(session: Session, checkin: CheckIn) -> CheckIn | None:
    s = get_settings()
    if checkin.attempt >= s.max_attempts:
        return None
    retry = CheckIn(run_id=checkin.run_id, elder_id=checkin.elder_id, round_no=checkin.round_no,
                    attempt=checkin.attempt + 1, is_recall=checkin.is_recall,
                    is_simulated=checkin.is_simulated,
                    scheduled_for_real=state.clock.real_now() + state.clock.real_delta(s.retry_gap_min))
    session.add(retry)
    session.flush()
    log_event(session, "retry_scheduled",
              f"Retry scheduled · attempt {retry.attempt} at {_hhmm(retry.scheduled_for_real)}",
              actor="system", elder_id=retry.elder_id, checkin_id=retry.id,
              data={"attempt": retry.attempt}, simulated=retry.is_simulated)
    return retry


def schedule_recall(session: Session, checkin: CheckIn) -> CheckIn:
    s = get_settings()
    recall = CheckIn(run_id=checkin.run_id, elder_id=checkin.elder_id, round_no=checkin.round_no,
                     attempt=1, is_recall=True, is_simulated=checkin.is_simulated,
                     scheduled_for_real=state.clock.real_now() + state.clock.real_delta(s.amber_recall_min))
    session.add(recall)
    session.flush()
    log_event(session, "recall_scheduled",
              f"Recall scheduled at {_hhmm(recall.scheduled_for_real)} · E3",
              actor="system", elder_id=recall.elder_id, checkin_id=recall.id,
              simulated=recall.is_simulated)
    return recall


def signals_for(checkin: CheckIn, call_status: str) -> Signals:
    a = (checkin.answers or {}) if call_status == "completed" else {}
    orientation = a.get("orientation")
    if orientation is None:
        # A recording whose scoring did not finish in time counts as uncertain, never as fine.
        orientation = "uncertain" if checkin.recording_url else "none"
    return Signals(water=a.get("water", "none"), symptoms=a.get("symptoms", "none"),
                   room_hot=a.get("room_hot", "none"), fan_working=a.get("fan_working", "none"),
                   orientation=orientation, self_report=a.get("self_report", "none"))


def handle_call_ended(session: Session, checkin_id: int, call_status: str) -> None:
    """Classify a finished call and apply escalation rules. Idempotent per check-in."""
    c = session.get(CheckIn, checkin_id)
    if c is None or c.run_id != current_run_id() or c.processed:
        return
    elder = session.get(Elder, c.elder_id)
    sim = c.is_simulated
    c.processed = True
    c.call_status = call_status
    c.classified_real = state.clock.real_now()
    signals = signals_for(c, call_status)
    if signals.orientation != (c.answers or {}).get("orientation") and call_status == "completed":
        c.answers = {**(c.answers or {}), "orientation": signals.orientation}
    verdict = classify(signals)
    if call_status != "completed":  # nobody picked up: say what happened, not "no valid answer"
        verdict = replace(verdict, reason=MISSED_REASON.get(call_status, "Not answered"))
    c.outcome, c.rule_id, c.reason = verdict.outcome.value, verdict.rule_id, verdict.reason
    c.needs_support = verdict.needs_support
    actor = "sim" if sim else "twilio"
    log_event(session, "call_ended", f"Call ended · {call_status}", actor=actor,
              elder_id=elder.id, checkin_id=c.id, data={"call_status": call_status}, simulated=sim)
    log_event(session, "checkin_classified",
              f"{verdict.outcome.value} · Rule {verdict.rule_id} · {verdict.reason}"
              + (" · needs support" if verdict.needs_support else ""),
              actor="rules", elder_id=elder.id, checkin_id=c.id,
              data={"outcome": verdict.outcome.value, "rule_id": verdict.rule_id,
                    "reason": verdict.reason, "needs_support": verdict.needs_support,
                    "signals": signals.__dict__}, simulated=sim)
    _apply_escalation(session, c, elder, verdict.outcome, verdict.rule_id, verdict.reason,
                      call_status)
    if verdict.needs_support:
        open_case(session, elder.id, "support", "S1", "Room very hot and fan not working")


def _apply_escalation(session, c: CheckIn, elder: Elder, outcome: Outcome, rule_id: str,
                      reason: str, call_status: str) -> None:
    if outcome == Outcome.UNREACHED:
        label = STATUS_LABEL.get(call_status, call_status)
        log_event(session, "attempt_failed", f"Attempt {c.attempt} failed · {label}",
                  actor="system", elder_id=elder.id, checkin_id=c.id,
                  data={"attempt": c.attempt, "call_status": call_status}, simulated=c.is_simulated)
        if schedule_retry(session, c) is None:
            if c.is_recall:
                open_case(session, elder.id, "red", "E3", "Second concerning check-in")
            else:
                open_case(session, elder.id, "red", "E1", f"No answer ×{c.attempt}")
    elif outcome == Outcome.RED:
        open_case(session, elder.id, "red", rule_id, reason)
    elif outcome == Outcome.AMBER:
        if c.is_recall:
            open_case(session, elder.id, "red", "E3", "Second concerning check-in")
        else:
            notify_family(session, elder, f"Today's check on {elder.name} needs follow-up "
                          f"({reason}). Neralu will call again soon.")
            schedule_recall(session, c)

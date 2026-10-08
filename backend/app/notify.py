"""Family/neighbour notifications.

Default: a simulated channel (logged, labelled simulated). With FAMILY_SMS=twilio, people registered
through the app (never the simulated residents) get a real SMS from the Twilio number; any failure
falls back to the simulated log so the escalation never stalls on a message.
"""
import logging
import re
from typing import Protocol

from sqlmodel import Session

from app.config import get_settings
from app.events import log_event
from app.models import Elder

log = logging.getLogger(__name__)
E164 = re.compile(r"^\+[1-9]\d{7,14}$")


class Notifier(Protocol):
    def notify(self, to: str, message: str) -> None: ...


def _who(elder: Elder, recipient: str) -> str:
    return elder.family_name if recipient == "family" and elder.family_name else recipient.capitalize()


class ConsoleNotifier:
    """Logs a family_notified event marked simulated instead of sending anything."""

    def __init__(self, session: Session, elder: Elder, *, case_id: int | None = None,
                 recipient: str = "family", note: str = ""):
        self.session, self.elder, self.case_id, self.recipient, self.note = session, elder, case_id, recipient, note

    def notify(self, to: str, message: str) -> None:
        data = {"recipient": self.recipient, "channel": "simulated", "text": message}
        if self.note:
            data["sms_error"] = self.note
        log_event(self.session, "family_notified",
                  f"{_who(self.elder, self.recipient)} notified · simulated channel: {message}",
                  actor="system", elder_id=self.elder.id, case_id=self.case_id, data=data, simulated=True)


class TwilioSmsNotifier:
    """Sends a real SMS. Twilio trial accounts can text verified numbers only."""

    def __init__(self, session: Session, elder: Elder, *, case_id: int | None = None, recipient: str = "family"):
        self.session, self.elder, self.case_id, self.recipient = session, elder, case_id, recipient

    def notify(self, to: str, message: str) -> None:
        from app.telephony import _twilio  # twilio client is only needed when SMS is on

        body = f"Neralu: {message} Neralu never asks for money, OTP or bank details."
        try:
            sid = _twilio().messages.create(to=to, from_=get_settings().twilio_from_number, body=body).sid
        except Exception as exc:  # network, trial-unverified number, bad credentials: fall back, never stall
            log.warning("SMS to %s failed: %s", self.recipient, exc)
            ConsoleNotifier(self.session, self.elder, case_id=self.case_id, recipient=self.recipient,
                            note=str(exc)[:200]).notify(to, message)
            return
        log_event(self.session, "family_notified", f"{_who(self.elder, self.recipient)} notified by SMS: {message}",
                  actor="system", elder_id=self.elder.id, case_id=self.case_id,
                  data={"recipient": self.recipient, "channel": "sms", "text": message, "sid": sid},
                  simulated=False)


def notifier_for(session: Session, elder: Elder, to: str, *, case_id: int | None = None,
                 recipient: str = "family") -> Notifier:
    real = get_settings().family_sms == "twilio" and not elder.is_simulated and bool(E164.match(to.replace(" ", "")))
    cls = TwilioSmsNotifier if real else ConsoleNotifier
    return cls(session, elder, case_id=case_id, recipient=recipient)


def notify_family(session: Session, elder: Elder, message: str, *, case_id: int | None = None) -> None:
    if elder.family_phone:
        to = elder.family_phone.replace(" ", "")
        notifier_for(session, elder, to, case_id=case_id).notify(to, message)


def notify_neighbour(session: Session, elder: Elder, message: str, *, case_id: int | None = None) -> None:
    if elder.neighbour_phone:
        to = elder.neighbour_phone.replace(" ", "")
        notifier_for(session, elder, to, case_id=case_id, recipient="neighbour").notify(to, message)

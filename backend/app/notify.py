"""Family/neighbour notifications. The demo uses a simulated channel (WhatsApp in production)."""
from typing import Protocol

from sqlmodel import Session

from app.events import log_event
from app.models import Elder


class Notifier(Protocol):
    def notify(self, to: str, message: str) -> None: ...


class ConsoleNotifier:
    """Logs a family_notified event marked simulated instead of sending anything."""

    def __init__(self, session: Session, elder: Elder, *, case_id: int | None = None,
                 recipient: str = "family"):
        self.session, self.elder, self.case_id, self.recipient = session, elder, case_id, recipient

    def notify(self, to: str, message: str) -> None:
        who = self.elder.family_name if self.recipient == "family" and self.elder.family_name \
            else self.recipient.capitalize()
        log_event(self.session, "family_notified", f"{who} notified · simulated channel: {message}",
                  actor="system", elder_id=self.elder.id, case_id=self.case_id,
                  data={"recipient": self.recipient, "channel": "simulated", "text": message},
                  simulated=True)


def notify_family(session: Session, elder: Elder, message: str, *, case_id: int | None = None) -> None:
    if elder.family_phone:
        ConsoleNotifier(session, elder, case_id=case_id).notify(elder.family_phone, message)


def notify_neighbour(session: Session, elder: Elder, message: str, *, case_id: int | None = None) -> None:
    if elder.neighbour_phone:
        ConsoleNotifier(session, elder, case_id=case_id, recipient="neighbour").notify(
            elder.neighbour_phone, message)

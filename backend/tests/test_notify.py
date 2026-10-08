"""Family/neighbour messages: simulated by default; a real SMS only for registered people when enabled."""
from types import SimpleNamespace

import pytest
from sqlmodel import select

from app import telephony
from app.config import get_settings
from app.models import Elder, Event
from app.notify import notify_family, notify_neighbour


def make_elder(session, *, simulated: bool, family_phone="+919845022222", neighbour_phone=None) -> Elder:
    e = Elder(run_id="run-test", name="Lakshmi N.", age=78, phone="+919845011111", language="kn",
              lives_alone=True, roof_type="sheet", has_fan=False, heat_sensitive_meds=True,
              family_name="Suresh (son)", family_phone=family_phone, neighbour_phone=neighbour_phone,
              code_word="mallige", lat=12.93, lng=77.58, is_simulated=simulated)
    session.add(e)
    session.commit()
    session.refresh(e)
    return e


class FakeTwilio:
    def __init__(self, fail: Exception | None = None):
        self.sent, self.fail = [], fail
        self.messages = self

    def create(self, *, to, from_, body):
        if self.fail:
            raise self.fail
        self.sent.append((to, body))
        return SimpleNamespace(sid="SM123")


@pytest.fixture
def sms_on(monkeypatch):
    fake = FakeTwilio()
    monkeypatch.setattr(get_settings(), "family_sms", "twilio")
    monkeypatch.setattr(telephony, "_twilio", lambda: fake)
    return fake


def last_event(session) -> Event:
    return session.exec(select(Event).where(Event.kind == "family_notified").order_by(Event.id.desc())).first()


def test_default_is_simulated(session, monkeypatch):
    sent = FakeTwilio()
    monkeypatch.setattr(telephony, "_twilio", lambda: sent)
    notify_family(session, make_elder(session, simulated=False), "Update.")
    ev = last_event(session)
    assert ev.data["channel"] == "simulated" and ev.simulated and sent.sent == []


def test_registered_person_gets_a_real_sms_when_enabled(session, sms_on):
    notify_family(session, make_elder(session, simulated=False), "Update on Lakshmi N.: safe.")
    to, body = sms_on.sent[0]
    assert to == "+919845022222" and "never asks for money" in body
    ev = last_event(session)
    assert ev.data["channel"] == "sms" and ev.data["sid"] == "SM123" and not ev.simulated


def test_simulated_residents_never_get_real_sms(session, sms_on):
    notify_family(session, make_elder(session, simulated=True), "Update.")
    assert sms_on.sent == [] and last_event(session).data["channel"] == "simulated"


def test_number_that_is_not_e164_stays_simulated(session, sms_on):
    notify_family(session, make_elder(session, simulated=False, family_phone="98450 22222"), "Update.")
    assert sms_on.sent == [] and last_event(session).data["channel"] == "simulated"


def test_neighbour_with_spaces_in_number_is_texted(session, sms_on):
    notify_neighbour(session, make_elder(session, simulated=False, neighbour_phone="+91 98450 33333"), "Please check.")
    assert sms_on.sent[0][0] == "+919845033333"


def test_sms_failure_falls_back_to_simulated_log(session, monkeypatch):
    monkeypatch.setattr(get_settings(), "family_sms", "twilio")
    monkeypatch.setattr(telephony, "_twilio", lambda: FakeTwilio(fail=RuntimeError("unverified number")))
    notify_family(session, make_elder(session, simulated=False), "Update.")
    ev = last_event(session)
    assert ev.data["channel"] == "simulated" and "unverified" in ev.data["sms_error"]

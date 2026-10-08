from types import SimpleNamespace

import pytest
from twilio.base.exceptions import TwilioRestException

from app import telephony

TRIAL_ERROR = ("Unable to create record: Invalid or disallowed parameters provided - trial "
               "accounts have limited parameter access, upgrade your account to unlock full functionality")


class FakeCalls:
    def __init__(self, reject_trial_params):
        self.reject, self.created = reject_trial_params, []

    def create(self, **kw):
        if self.reject and ("timeout" in kw or "status_callback_method" in kw):
            raise TwilioRestException(400, "/Calls.json", TRIAL_ERROR)
        self.created.append(kw)
        return SimpleNamespace(sid=f"CA{len(self.created)}")


@pytest.fixture
def fake_twilio(monkeypatch):
    def make(reject):
        calls = FakeCalls(reject)
        monkeypatch.setattr(telephony, "_twilio", lambda: SimpleNamespace(calls=calls))
        monkeypatch.setattr(telephony, "_trial_limited", False)
        return calls
    return make


def test_full_account_sends_ring_timeout(fake_twilio):
    calls = fake_twilio(reject=False)
    assert telephony.place_call("+919900000001", 7) == "CA1"
    assert calls.created[0]["timeout"] == 15
    assert calls.created[0]["status_callback"].endswith("/voice/status?checkin_id=7")


def test_trial_account_retries_without_restricted_options(fake_twilio):
    calls = fake_twilio(reject=True)
    assert telephony.place_call("+919900000001", 7) == "CA1"
    assert "timeout" not in calls.created[0] and "status_callback" in calls.created[0]
    telephony.place_call("+919900000001", 8)  # remembered: no failed attempt the second time
    assert len(calls.created) == 2


def test_other_twilio_errors_still_raise(fake_twilio, monkeypatch):
    def boom(**kw):
        raise TwilioRestException(400, "/Calls.json", "Unable to create record: unverified number")
    monkeypatch.setattr(telephony, "_twilio", lambda: SimpleNamespace(calls=SimpleNamespace(create=boom)))
    with pytest.raises(TwilioRestException):
        telephony.place_call("+919900000001", 7)


def test_cancel_stops_trying_when_account_cannot_update_calls(monkeypatch):
    attempts = []

    def refuse(**kw):
        attempts.append(kw)
        raise TwilioRestException(404, "/Calls/CA1.json", "Unable to update record: not found", code=20404)

    monkeypatch.setattr(telephony, "_twilio", lambda: SimpleNamespace(calls=lambda sid: SimpleNamespace(update=refuse)))
    monkeypatch.setattr(telephony, "_cancel_unsupported", False)
    assert telephony.cancel_call("CA1") is False
    assert telephony.cancel_call("CA2") is False
    assert len(attempts) == 1  # remembered: no API call every second while the phone rings

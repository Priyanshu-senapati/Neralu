"""E7 after-care: after a person checked in person, Neralu calls again to make sure they are still okay."""
from sqlmodel import Session, select

from app.calls import handle_call_ended
from app.config import get_settings
from app.db import engine
from app.models import Case, CheckIn, Event
from app.state import state
from tests.test_api import kamala_id, red_case_for_kamala

PRIYA = {"volunteer_token": "priya-test-link-0123456789"}


def close_case(client, resolution="safe_in_person") -> int:
    cid = red_case_for_kamala()
    client.post(f"/api/cases/{cid}/accept", json=PRIYA)
    r = client.post(f"/api/cases/{cid}/resolve", json={**PRIYA, "resolution": resolution})
    assert r.status_code == 200
    return cid


def aftercare_calls(s: Session) -> list[CheckIn]:
    return list(s.exec(select(CheckIn).where(CheckIn.elder_id == kamala_id(), CheckIn.is_recall == True)))  # noqa: E712


def test_safe_in_person_books_an_aftercare_call_an_hour_later(client):
    cid = close_case(client)
    with Session(engine) as s:
        [c] = aftercare_calls(s)
        assert c.callee == "elder" and c.attempt == 1 and not c.processed
        mins = (c.scheduled_for_real - state.clock.real_now()).total_seconds() * state.clock.speed / 60
        assert 58 <= mins <= 60
        ev = s.exec(select(Event).where(Event.kind == "recall_scheduled", Event.case_id == cid)).one()
        assert "E7" in ev.message and ev.data["aftercare"] is True
        told = s.exec(select(Event).where(Event.kind == "family_notified", Event.case_id == cid)).all()[-1]
        assert "will call again at" in told.data["text"]


def test_support_delivered_also_books_aftercare(client):
    close_case(client, "support_delivered")
    with Session(engine) as s:
        assert len(aftercare_calls(s)) == 1


def test_no_aftercare_after_108(client):
    close_case(client, "called_108")
    with Session(engine) as s:
        assert aftercare_calls(s) == []


def test_aftercare_can_be_switched_off(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "aftercare_min", 0)
    close_case(client)
    with Session(engine) as s:
        assert aftercare_calls(s) == []


def test_concerning_aftercare_call_sends_a_person_again(client):
    close_case(client)
    with Session(engine) as s:
        [c] = aftercare_calls(s)
        c.started, c.answers = True, {"water": "no", "symptoms": "no", "room_hot": "no", "fan_working": "yes",
                                      "orientation": "correct", "self_report": "ok"}
        s.commit()
        handle_call_ended(s, c.id, "completed")
        s.commit()
        assert (c.outcome, c.rule_id) == ("AMBER", "R6")
        reopened = s.exec(select(Case).where(Case.elder_id == kamala_id(), Case.state == "open")).one()
        assert reopened.rule_id == "E3"


def test_fine_aftercare_call_closes_the_episode(client):
    close_case(client)
    with Session(engine) as s:
        [c] = aftercare_calls(s)
        c.started, c.answers = True, {"water": "yes", "symptoms": "no", "room_hot": "no", "fan_working": "yes",
                                      "orientation": "correct", "self_report": "ok"}
        s.commit()
        handle_call_ended(s, c.id, "completed")
        s.commit()
        assert c.outcome == "GREEN"
        assert s.exec(select(Case).where(Case.elder_id == kamala_id(), Case.state != "resolved")).all() == []
    assert client.get("/api/summary").json()["counts"]["fine"] == 1


def test_no_second_aftercare_while_a_call_is_already_due(client):
    close_case(client)
    with Session(engine) as s:
        [c] = aftercare_calls(s)
        case = s.exec(select(Case).where(Case.elder_id == kamala_id())).one()
        from app.calls import schedule_aftercare
        from app.models import Elder
        assert schedule_aftercare(s, s.get(Elder, kamala_id()), case.id) is None

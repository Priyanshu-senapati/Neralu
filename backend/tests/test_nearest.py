"""The nearest on-duty responders are alerted first; everyone on duty can still help."""
from sqlmodel import Session, select

from app.config import get_settings
from app.db import current_run_id, engine
from app.escalation import open_case
from app.geo import km
from app.models import Case, Elder, Event, Volunteer


def kamala(s: Session) -> Elder:
    return s.exec(select(Elder).where(Elder.name == "Kamala R.")).one()


def test_nearest_volunteers_are_alerted_and_named_in_the_event(client):
    with Session(engine) as s:
        e = kamala(s)
        case = open_case(s, e.id, "red", "E1", "No answer ×2")
        s.commit()
        on_duty = list(s.exec(select(Volunteer).where(Volunteer.run_id == current_run_id(),
                                                      Volunteer.role == "volunteer", Volunteer.on_duty)))
        expected = [v.id for v in sorted(on_duty, key=lambda v: (km(v.lat, v.lng, e.lat, e.lng), v.id))]
        n = get_settings().alert_nearest
        assert s.get(Case, case.id).alerted_ids == expected[:n]
        msg = s.exec(select(Event).where(Event.kind == "tier_alerted", Event.case_id == case.id)).one().message
        assert (f"{n} nearest of {len(on_duty)} on duty" in msg) if len(on_duty) > n else ("on duty" in msg)


def test_volunteer_sees_alerted_flag_and_any_volunteer_can_still_accept(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "alert_nearest", 1)
    with Session(engine) as s:
        case = open_case(s, kamala(s).id, "red", "E1", "No answer ×2")
        s.commit()
        alerted = s.get(Case, case.id).alerted_ids
        priya = s.exec(select(Volunteer).where(Volunteer.token == "priya-demo")).one()
    me = client.get("/api/volunteer/me", params={"token": "priya-demo"}).json()
    c = next(c for c in me["cases"] if c["id"] == case.id)  # visible whether or not alerted
    assert c["alerted_you"] == (priya.id in alerted)
    assert client.post(f"/api/cases/{case.id}/accept", json={"volunteer_token": "priya-demo"}).status_code == 200

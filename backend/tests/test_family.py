"""Family status link: private, live through a call and an escalation, and about one person only."""
from sqlmodel import Session, select

from app import telephony
from app.calls import handle_call_ended
from app.config import get_settings
from app.db import current_run_id, engine
from app.escalation import accept_case, resolve_case
from app.models import Case, CheckIn, Elder, Volunteer

HEATWAVE = {"temp_c": 38, "humidity_pct": 40, "night_min_c": 27}
FINE = {"water": "yes", "symptoms": "no", "room_hot": "no", "fan_working": "yes",
        "orientation": "correct", "self_report": "ok"}
REGISTER = {
    "name": "Gowri Bai", "age": 79, "phone": "+919845011111", "language": "kn", "lives_alone": True,
    "roof_type": "sheet", "has_fan": True, "heat_sensitive_meds": False, "hearing_difficulty": False,
    "cognitive_flag": False, "address": "#9, 3rd Cross, Ward 47", "family_name": "Ravi",
    "family_phone": "+919845022222", "code_word": "mallige", "consent": True,
}


def family(client, token):
    return client.get("/api/family", params={"t": token})


def kamala_token():
    return get_settings().family_demo_token


def end_call(checkin_id: int, answers: dict | None):
    with Session(engine, expire_on_commit=False) as s:
        c = s.get(CheckIn, checkin_id)
        c.started, c.answers = True, answers
        handle_call_ended(s, c.id, "completed" if answers else "no-answer")
        s.commit()


def kamala_checkin() -> int:
    with Session(engine, expire_on_commit=False) as s:
        k = s.exec(select(Elder).where(Elder.run_id == current_run_id(), Elder.name == "Kamala R.")).one()
        return s.exec(select(CheckIn).where(CheckIn.elder_id == k.id, CheckIn.processed == False)  # noqa: E712
                      .order_by(CheckIn.id)).first().id


def test_registration_gives_a_private_random_link(client):
    reg = client.post("/api/elders", json=REGISTER).json()
    token = reg["family_link"].split("t=")[1]
    assert len(token) >= 16 and reg["family_link"].startswith("https://neralu.test/family?t=")
    d = family(client, token).json()
    assert d["name"] == "Gowri Bai" and "Not hot enough" in d["headline"]
    text = str(d)
    assert "3rd Cross" not in text and "mallige" not in text and "9845" not in text  # no address, code word or phones
    # the console never sees the token
    assert token not in str(client.get(f"/api/elders/{reg['id']}").json())
    assert token not in str(client.get("/api/elders").json())


def test_unknown_or_empty_link_is_refused(client):
    assert family(client, "not-a-real-link").status_code == 404
    assert family(client, "").status_code == 404


def test_live_through_a_call_and_an_escalation(client):
    t = kamala_token()
    client.post("/api/sim/heat", json=HEATWAVE)
    assert "has not started yet" in family(client, t).json()["headline"]
    client.post("/api/sim/round", json={"round_no": 1})
    assert "Neralu will call Kamala at" in family(client, t).json()["headline"]

    end_call(kamala_checkin(), {**FINE, "water": "no", "symptoms": "yes"})  # RED, R3
    d = family(client, t).json()
    assert d["tone"] == "alert" and "asking a volunteer nearby to visit Kamala" in d["headline"]

    with Session(engine, expire_on_commit=False) as s:
        case = s.exec(select(Case).where(Case.run_id == current_run_id(), Case.state == "open")).first()
        priya = s.exec(select(Volunteer).where(Volunteer.token == "priya-demo")).one()
        accept_case(s, case.id, priya.id)
        s.commit()
    assert family(client, t).json()["headline"] == "Priya, a volunteer, is on the way to Kamala."

    with Session(engine, expire_on_commit=False) as s:
        resolve_case(s, case.id, priya.id, "safe_in_person", None)
        s.commit()
    d = family(client, t).json()
    assert d["tone"] == "ok" and "Kamala was checked in person at" in d["headline"] and ": safe." in d["headline"]
    assert "call again at" in d["headline"]  # after-care call (E7)
    texts = [x["text"] for x in d["timeline"]]
    assert texts[0].startswith("Kamala answered: needs a person to check")
    assert "A person nearby was asked to check in person" in texts
    assert "Priya, a volunteer, accepted and is on the way" in texts
    assert "Priya checked in person: safe" in texts


def test_fine_call_and_no_answer(client):
    t = kamala_token()
    client.post("/api/sim/heat", json=HEATWAVE)
    client.post("/api/sim/round", json={"round_no": 1})
    end_call(kamala_checkin(), None)
    d = family(client, t).json()
    assert "Kamala did not answer at" in d["headline"] and "call again at" in d["headline"]
    end_call(kamala_checkin(), FINE)
    assert "Kamala answered at" in family(client, t).json()["headline"] and "all fine" in family(client, t).json()["headline"]


def test_shows_nothing_about_anyone_else(client):
    t = kamala_token()
    client.post("/api/sim/heat", json=HEATWAVE)
    client.post("/api/sim/round", json={"round_no": 1})
    end_call(kamala_checkin(), {**FINE, "water": "no", "symptoms": "yes"})
    text = str(family(client, t).json())
    with Session(engine, expire_on_commit=False) as s:
        others = [e.name for e in s.exec(select(Elder).where(Elder.run_id == current_run_id(),
                                                             Elder.name != "Kamala R."))]
    assert not [n for n in others if n in text]


def test_removed_registration_link_stops_working(client):
    reg = client.post("/api/elders", json=REGISTER).json()
    token = reg["family_link"].split("t=")[1]
    client.request("DELETE", f"/api/elders/{reg['id']}", json={"registration": f"NRL-W47-{reg['id']:05d}"})
    assert family(client, token).status_code == 404


def test_family_sms_carries_the_link(client, monkeypatch):
    from app.notify import notify_family

    sent = []

    class Msgs:
        def create(self, to, from_, body):
            sent.append(body)
            return type("M", (), {"sid": "SM1"})()

    monkeypatch.setattr(get_settings(), "family_sms", "twilio")
    monkeypatch.setattr(telephony, "_twilio", lambda: type("C", (), {"messages": Msgs()})())
    reg = client.post("/api/elders", json=REGISTER).json()
    with Session(engine, expire_on_commit=False) as s:
        notify_family(s, s.get(Elder, reg["id"]), "Update.")
        s.commit()
    assert reg["family_link"] in sent[0]

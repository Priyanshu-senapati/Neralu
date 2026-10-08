"""Deterministic demo seed for "Ward 47 · demo ward" (fictional). No real people or phone numbers.

400 simulated residents + the demo persona Kamala R. (real phone) + volunteers and ASHA workers.
"""
import random

from sqlmodel import Session

from app.config import get_settings
from app.models import CODE_WORDS, Elder, Volunteer
from seed.names import INITIALS, NAMES

# ~2 km box around a residential area of south Bengaluru
CENTER_LAT, CENTER_LNG = 12.9250, 77.5838
HALF_LAT, HALF_LNG = 0.009, 0.0092
FICTIONAL_PHONE = "+910000000000"  # stands in for family/neighbour numbers; never dialled

N_SIMULATED = 400


def _pick(rng: random.Random, weights: dict):
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def _point(rng: random.Random) -> tuple[float, float]:
    return (round(CENTER_LAT + rng.uniform(-HALF_LAT, HALF_LAT), 6),
            round(CENTER_LNG + rng.uniform(-HALF_LNG, HALF_LNG), 6))


def _address(rng: random.Random) -> str:
    return (f"#{rng.randint(1, 240)}, {rng.randint(1, 18)} Cross, {rng.randint(1, 9)} Main, "
            "Ward 47 (demo)")


def _age(rng: random.Random) -> int:
    return max(60, min(92, round(rng.triangular(60, 92, 72))))


def kamala(run_id: str) -> Elder:
    return Elder(
        run_id=run_id, name="Kamala R.", age=74, phone=get_settings().kamala_phone or None,
        language="kn", lives_alone=True, roof_type="sheet", has_fan=True,
        heat_sensitive_meds=True, hearing_difficulty=False, cognitive_flag=False,
        neighbour_phone=None, family_phone=FICTIONAL_PHONE, family_name="Suresh (son)",
        code_word="mallige", address="#18, 4 Cross, 2 Main, Ward 47 (demo)",
        lat=12.9262, lng=77.5851, is_simulated=False,
    )


def simulated_elder(rng: random.Random, run_id: str) -> Elder:
    language = _pick(rng, {"kn": 55, "ta": 15, "te": 10, "ur": 10, "hi": 10})
    lat, lng = _point(rng)
    has_family = rng.random() < 0.7
    return Elder(
        run_id=run_id, name=f"{rng.choice(NAMES[language])} {rng.choice(INITIALS)}.",
        age=_age(rng), phone=None, language=language,
        lives_alone=rng.random() < 0.25,
        roof_type=_pick(rng, {"sheet": 25, "tile": 20, "concrete": 45, "top_floor": 10}),
        has_fan=rng.random() < 0.85, heat_sensitive_meds=rng.random() < 0.35,
        hearing_difficulty=rng.random() < 0.08, cognitive_flag=rng.random() < 0.04,
        neighbour_phone=FICTIONAL_PHONE if rng.random() < 0.40 else None,
        family_phone=FICTIONAL_PHONE if has_family else None,
        family_name="Family" if has_family else None,
        code_word=rng.choice(CODE_WORDS), address=_address(rng), lat=lat, lng=lng,
        is_simulated=True,
    )


def volunteers(rng: random.Random, run_id: str) -> list[Volunteer]:
    s = get_settings()
    out = [Volunteer(run_id=run_id, name="Priya", role="volunteer", phone="",
                     token=s.volunteer_demo_token, lat=12.9241, lng=77.5822, is_simulated=False)]
    for i, name in enumerate(["Ravi K.", "Shabnam A.", "Deepak M.", "Anitha S.", "Joseph D."], 1):
        lat, lng = _point(rng)
        out.append(Volunteer(run_id=run_id, name=name, role="volunteer", token=f"sim-vol-{i}",
                             lat=lat, lng=lng))
    for i, name in enumerate(["Mangala (ASHA)", "Rekha (ASHA)"], 1):
        lat, lng = _point(rng)
        out.append(Volunteer(run_id=run_id, name=name, role="asha", token=f"sim-asha-{i}",
                             lat=lat, lng=lng))
    return out


def seed_run(session: Session, run_id: str, *, n_simulated: int = N_SIMULATED) -> None:
    rng = random.Random(47)
    session.add(kamala(run_id))
    for v in volunteers(rng, run_id):
        session.add(v)
    for _ in range(n_simulated):
        session.add(simulated_elder(rng, run_id))
    session.flush()

# Neralu

Heatwave welfare checks for elderly people who live alone. On a hot day Neralu works out who is at
risk, phones them on any phone in their language, asks a few keypad questions plus "What day is it
today?", and escalates to a neighbour, volunteer or ASHA worker when something looks wrong.
Deterministic rules decide every outcome; the system never calls 108 itself.

Full spec, decisions and build order: [docs/NERALU_PLAN.md](docs/NERALU_PLAN.md).
Rules for working in this repo: [CLAUDE.md](CLAUDE.md).

## Run it locally (Windows)

Needs Python 3.11+ and Node 20+.

**Backend** (port 8000)

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
copy .env.example .env
python -m uvicorn app.main:app --port 8000 --host 0.0.0.0 --timeout-graceful-shutdown 2
```

Do not use `--reload` on Windows: it can leave an old worker holding port 8000.
Every server start begins a fresh demo run (new seed of 401 residents).

**Frontend** (port 5180, proxies `/api` and `/audio` to the backend)

```
cd frontend
npm install
npm run dev -- --port 5180
```

| Page | URL |
|---|---|
| Ward dashboard | http://localhost:5180/ |
| Volunteer (phone) | http://localhost:5180/volunteer?token=priya-demo |
| Family registration (phone) | http://localhost:5180/register |

Phones on the same network can open the same pages using the laptop's IP instead of `localhost`.

**Tests**

```
cd backend
.venv\Scripts\activate
pytest
```

## Real phone calls

Without Twilio settings everything works except the real call (it is logged as a failed attempt).
To make real calls, fill these in `backend/.env` (never commit `.env`):

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`: an upgraded Twilio account, India enabled in Voice geo permissions
- `KAMALA_PHONE`: the demo phone, in `+91...` form
- `PUBLIC_BASE_URL`: the public https address Twilio can reach, e.g. `ngrok http 8000`
- `SARVAM_API_KEY`: speech-to-text for the "What day is it?" answer

## Layout

```
backend/   FastAPI + SQLModel + SQLite: rules, risk, calls, escalation, simulation
  app/rules.py        the only place outcomes are decided (GREEN / AMBER / RED / UNREACHED)
  static/audio/<lang>/  call prompts per language; missing clips fall back to English
  scripts/make_audio.py regenerates prompts: English with Kokoro, Hindi with Sarvam
frontend/  Vite + React + TypeScript + Tailwind: dashboard, volunteer and registration pages
docs/      the plan
```

## What is simulated

The weather, the demo clock (×60), the ~400 seeded residents' answers and family notifications.
Each is labelled "simulated" in the data and the UI. The call, the answers, the rules and the
escalation are real.

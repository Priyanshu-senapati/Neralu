# Neralu

Heatwave welfare checks for elderly people who live alone. On a hot day Neralu works out who is at
risk, phones them on any phone in their language, asks a few keypad questions plus "What day is it
today?", and escalates to a neighbour, volunteer or ASHA worker when something looks wrong.
Deterministic rules decide every outcome; the system never calls 108 itself.

Full spec, decisions and build order: [docs/NERALU_PLAN.md](docs/NERALU_PLAN.md).
Rules for working in this repo: [CLAUDE.md](CLAUDE.md).

## One command (demo laptop)

Builds the website and serves everything (site, API, call audio) on one port, :8000, and prints
the address for phones on the same Wi-Fi.

```
scripts/demo.sh                                              # Mac / Linux
powershell -ExecutionPolicy Bypass -File scripts\demo.ps1    # Windows
```

## Run it locally for development (Windows)

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

## Past rounds API

`GET /api/rounds` returns one entry per round in the current run (a reset clears them):

| Field | Meaning |
|---|---|
| `called`, `called_real`, `called_simulated` | people with a check-in this round |
| `caregiver_route` | due, but not called directly (memory difficulty) |
| `outcomes` | each person's final outcome this round: `GREEN` / `AMBER` / `RED` / `UNREACHED` |
| `in_progress` | people whose call, retry or recall is still pending |
| `red_cases`, `support_cases` | cases opened during the round (includes E1 "no answer" and E3 escalations) |
| `accepted`, `accept_wait_median_min`, `accept_wait_max_min` | volunteer acceptance, in scenario minutes |
| `overdue` | cases that reached the ward officer |
| `resolutions` | e.g. `{"safe_in_person": 3, "called_108": 1}` |

Counts mix real and simulated residents; `called_real` says how many were real phones.

## Real phone calls

Without Twilio settings everything works except the real call (it is logged as a failed attempt).
To make real calls, fill these in `backend/.env` (never commit `.env`):

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`: an upgraded Twilio account, India enabled in Voice geo permissions
- `KAMALA_PHONE`: the demo phone, in `+91...` form
- `PUBLIC_BASE_URL`: the public https address Twilio can reach, e.g. `ngrok http 8000`
- `SARVAM_API_KEY`: speech-to-text for the "What day is it?" answer

Check everything before going on stage (read-only, never places a call):
`.venv\Scripts\python scripts\preflight.py`

### No Twilio? Use the browser phone

Set `TELEPHONY_MODE=browser` in `backend/.env` and restart the backend. Kamala's call then rings the
`/phone` page instead of a SIM: open `http://<laptop-ip>:5173/phone` on a teammate's phone, tap
**Turn on phone**, and hand it to the judge. It plays the same prompts (with English captions), takes the
same keypad answers and records the spoken day, and everything after that (rules, escalation,
volunteer alert, dashboard) is the same code a real call uses. The call's events say "browser phone".

- The microphone needs https (or localhost). Over plain http on a phone the page asks the judge to tap
  the day instead, which is scored the same way.
- Twilio settings are not needed in this mode, and the preflight skips them.

## Layout

```
backend/   FastAPI + SQLModel + SQLite: rules, risk, calls, escalation, simulation
  app/rules.py        the only place outcomes are decided (GREEN / AMBER / RED / UNREACHED)
  static/audio/<lang>/  call prompts per language; missing clips fall back to English
  scripts/make_audio.py regenerates prompts: English with Kokoro, Hindi with Sarvam
frontend/  Vite + React + TypeScript + Tailwind: dashboard, volunteer and registration pages
docs/      the plan
```

## Optional real-world switches (backend/.env)

| Setting | Effect |
|---|---|
| `FAMILY_SMS=twilio` | Families and neighbours of people registered through the app get a real SMS from `TWILIO_FROM_NUMBER`. Simulated residents never do. A trial account can text verified numbers only; any failure falls back to the simulated log. |
| `ALERT_NEAREST=3` | How many of the nearest on-duty volunteers/ASHAs are alerted first. Everyone on duty can still accept. |
| `FRONTEND_DIST=` | Where the built website is (default `frontend/dist`). |

Demo controls also offer **Today's real forecast, Bengaluru** (Open-Meteo, free, no key): the hottest
forecast hour and the overnight low become the run's weather, labelled "live forecast".

A family can remove a person they registered from the confirmation screen (`DELETE /api/elders/{id}`
with the registration number): the person, their check-ins, recordings, cases and events are erased.

## What is simulated

The weather (unless the live forecast is chosen), the demo clock (×60), the ~400 seeded residents'
answers and family notifications (unless `FAMILY_SMS=twilio`). Each is labelled "simulated" in the
data and the UI. The call, the answers, the rules and the escalation are real.

# Neralu · ನೆರಳು ("shade")

**Heat warnings tell a city what's coming. Neralu checks who's safe.**

Hack4SDG 2026 finale entry · Ward 47 demo ward, Bengaluru

## The problem

In a heatwave the people most likely to be hurt are older people who live alone, often on a basic keypad
phone, often on heat-sensitive medicines, often under sheet roofs. India broadcasts heat alerts, but a
broadcast only *tells*: nobody *checks* whether a particular person is all right, and heat varies sharply
within a single ward, so "it's fine today" for the city can be wrong for one house.

## What Neralu does

1. **Works out who is at risk today**, from each person's own heat threshold (age, living alone, roof,
   fan, heat-sensitive medicines), not one city-wide number.
2. **Phones them on any phone**, in Kannada, Hindi or English, opening with a code word their family
   chose so they know it is not a scam call. People with memory difficulty are checked **through their
   caregiver** instead: a caregiver call with its own published rules (C0–C6), so nobody is skipped.
3. **Asks a few keypad questions** (water, dizziness, a hot room, the fan, help) and **"What day is it
   today?"**, because heat confusion can make someone say "I'm fine" when they are not.
4. **Fixed, published rules decide** GREEN / AMBER / RED. AI never decides an outcome; anything unclear
   is followed up, never assumed fine.
5. **A person goes to the door when needed:** a neighbour, then the nearest volunteer, then an ASHA
   worker, then the ward officer, each with a timer. Neralu never calls 108 itself; a human decides that.
   After a person has checked on them, Neralu **calls again an hour later** (E7) to make sure they are
   still okay; a worrying or missed after-care call sends a person again.
6. **The family is told**, and the ward console shows who is fine, who needs follow-up and who is
   waiting for a person, with the full record of every step. Families also get a **private status
   link** at registration ("answered at 11:02 · all fine", "a volunteer is on the way"): read-only,
   one person only, no address or phone numbers, and they can replace it or turn it off.

## SDGs

- **SDG 11** Sustainable cities: an enhanced public service that sends scarce responders only where needed;
  target **11.5**, reduce disaster deaths, focusing on the vulnerable.
- **SDG 3** Good health: target **3.d**, early warning for health risks.
- **SDG 13** Climate action: target **13.1**, resilience to climate hazards.

## What is real and what is simulated

| Real | Simulated, and labelled so |
|---|---|
| The phone call (Twilio) to the demo phone; its keypad answers; the speech-to-text of a spoken day | Ward 47 and its ~400 residents (fictional names and places; no real people's data) |
| The rules, the escalation, the timers, the volunteer accepting on a real phone | Their call outcomes, the weather presets (a live Bengaluru forecast is optional), the ×60 demo clock |
| The live console, registration, the audit trail | Family notifications (real SMS is optional, off by default) |

## Tech stack

Backend: Python 3.11, FastAPI, SQLModel + SQLite, Twilio Programmable Voice, Sarvam AI (speech).
Frontend: React 19, TypeScript, Vite, Tailwind CSS, Leaflet, three.js, d3. Details: [SETUP.md](SETUP.md).

## Team

| Name | GitHub |
|---|---|
| Priyanshu Kumar Senapati | [@Priyanshu-senapati](https://github.com/Priyanshu-senapati) |
| Gourab Dash | [@gd23456](https://github.com/gd23456) |
| Mohsin | [@mohsin200711](https://github.com/mohsin200711) |
| | [@Vkun2508](https://github.com/Vkun2508) |

## Run it

**On stage:** `powershell -ExecutionPolicy Bypass -File scripts\stage.ps1` starts everything and prints a go / no-go check.
**New laptop? Start with [SETUP.md](SETUP.md)**: everything to install, the settings, how to run it and fixes for common problems.

Full spec and decisions: [docs/NERALU_PLAN.md](docs/NERALU_PLAN.md) · finale plan: [docs/HACKATHON_PLAN.md](docs/HACKATHON_PLAN.md) ·
rules for working in this repo: [CLAUDE.md](CLAUDE.md).

## Built honestly: credits and pre-existing work

**Pre-existing work.** Neralu was designed for the Hack4SDG ideathon (prelims, 9 Oct 2026) and built
before the finale: the git history starts on 8 Oct 2026 and is public. Everything up to the git tag
**`pre-finale`** existed before the finale began (12:00, 24 Oct 2026); everything after it was built at
the finale. `git log pre-finale..main` lists the finale work.

**AI tools.**
- **Claude Code** (Anthropic): wrote most of the code under the team's direction and review, and helped
  plan, test and debug.
- **ChatGPT** (OpenAI): brainstorming and reviewing the feature plan.
- **Sarvam AI**: *Bulbul* text-to-speech generated the call prompts (Kannada, Hindi, Indian English);
  *Saaras* speech-to-text transcribes a spoken day during calls. The Kannada wording still needs
  review by a native speaker.
- AI never decides an outcome in Neralu: `backend/app/rules.py` does, with tests.

**APIs and services.** Twilio (calls, optional SMS) · Sarvam AI (speech) · Open-Meteo (optional live
forecast, free, no key) · ngrok (public tunnel for the demo) · Google Maps (volunteer "Open in Maps" link).

**Data, maps and methods.** Basemap tiles © Esri, HERE, Garmin, © OpenStreetMap contributors (Esri
World Light Gray Base) · heat index by the US National Weather Service Rothfusz regression · all
residents, addresses and phone numbers in the demo ward are fictional.

**Open-source libraries.** Backend: FastAPI, Uvicorn, SQLModel / SQLAlchemy, Pydantic, Twilio Python SDK,
HTTPX, sse-starlette, python-multipart, pytest. Frontend: React, React Router, Vite, TypeScript,
Tailwind CSS, Leaflet and react-leaflet, three.js, d3, GSAP, Motion, lucide-react, clsx, tailwind-merge.
Exact versions: `backend/requirements.txt`, `frontend/package-lock.json`.

**Borrowed UI components** (adapted, credited in each file): from [21st.dev](https://21st.dev) the
FlowButton, the shader animation behind the story page's hero and the "wireframe dotted globe" (rebuilt
in three.js); a Spline demo kept for reference only, not used.

**Fonts** (Google Fonts): Public Sans, IBM Plex Mono, Newsreader, Noto Sans Kannada.

---

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
| Story page | http://localhost:5180/ |
| Ward console | http://localhost:5180/ward |
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
`/phone` page instead of a SIM: open `http://<laptop-ip>:5180/phone` on a teammate's phone, tap
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
  scripts/make_audio.py regenerates prompts with Sarvam (Kannada, Hindi, Indian English)
frontend/  Vite + React + TypeScript + Tailwind: dashboard, volunteer and registration pages
docs/      the plan
```

## Optional real-world switches (backend/.env)

| Setting | Effect |
|---|---|
| `FAMILY_SMS=twilio` | Families and neighbours of people registered through the app get a real SMS from `TWILIO_FROM_NUMBER`. Simulated residents never do. A trial account can text verified numbers only; any failure falls back to the simulated log. |
| `ALERT_NEAREST=3` | How many of the nearest on-duty volunteers/ASHAs are alerted first. Everyone on duty can still accept. |
| `FRONTEND_DIST=` | Where the built website is (default `frontend/dist`). |

### Impact: a heat alert against Neralu

On the console, **Impact** puts the same day in two columns. A broadcast alert tells everyone and
confirms nothing. Neralu shows who was called, confirmed safe, known to need a person and reached at
the door, plus what a pilot would measure: confirmed safe by noon, time from a RED case to a person at
the door, repeat-risk residents and volunteer load. Every number is counted live from the run's
check-ins, cases and events; the panel says how each one is counted.

### Responders: availability and live reassignment

Volunteers go on and off duty from their page. **Can't go** tells Neralu, which asks the next nearest
free responder at once; going off duty hands pending alerts on; if nobody is left at a tier, the case
moves up (volunteers → ASHA workers → ward officer), so no case is left with nobody asked. Free
responders are asked before those already on a visit. On the console, **Responders** shows who is on
duty, on a visit, being asked, or said they can't go.

### What-if planner: a forecast turned into a work plan

On the console, **Plan ahead** opens the planner. Drag temperature, humidity and night minimum, or load
tomorrow's real Bengaluru forecast, and see against today: residents over their own threshold, calls
in each round, expected follow-ups and cases needing a person, and the responders needed at the busiest
time against those on duty ("774 calls, ~40 cases, 5 responders on duty → 3 short from 11:00 to 13:00").
Who is called uses exactly the rules a real round uses. What the calls would find is an estimate from
the simulated residents' answer mix, labelled simulated; a pilot would replace it with measured rates.
Nothing in the planner changes the run.

### Pilot mode: a real day, run by itself

`RUN_MODE=pilot` (or `scripts\stage.ps1 -Pilot`) turns the demo into a real day: the clock is real
time (IST), today's Bengaluru forecast is fetched from Open-Meteo, and the call rounds start by
themselves at `PILOT_ROUND_TIMES` (default 11:00 and 15:00). Safeguards: no automatic round without
today's real forecast, none after `PILOT_CALLS_UNTIL` (18:00), and a late start runs only the latest
round already due, so nobody is called twice minutes apart. A restart resumes the day; after
midnight a new day's run begins and the people families registered carry over. The officer can
still start a round by hand.

Demo controls also offer **Today's real forecast, Bengaluru** (Open-Meteo, free, no key): the hottest
forecast hour and the overnight low become the run's weather, labelled "live forecast".

A family can remove a person they registered from the confirmation screen (`DELETE /api/elders/{id}`
with the registration number): the person, their check-ins, recordings, cases and events are erased.

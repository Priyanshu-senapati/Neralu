# Running and operating Neralu

Everything needed to start Neralu, make real phone calls, and use each console feature. Back to the [README](../README.md).

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

### Missed-call check-in

A registered person, or their family, gives a missed call to the Neralu number and Neralu calls back
at once with the usual check. Neralu never answers the incoming call (it rejects it as busy), so it
costs the caller nothing. The callback is an ordinary check: same rules, retries and escalation.
Unknown numbers are not called back and not stored; one callback per person per 30 minutes. Callers
with memory difficulty are checked through their caregiver, as on any call.
- **Real phone:** in the Twilio console, set the Neralu number's "A call comes in" webhook to
  `https://<public address>/voice/inbound` (HTTP POST). On a trial account Twilio plays its trial
  notice to inbound callers first, so test it before relying on it on stage.
- **Browser phone:** the `/phone` page has "Give Neralu a missed call" (simulated, labelled so).

### Console: filters, data sources, case records

The attention list filters by heat risk, where the call stands (calling, answered, not reached, not
called yet) and who has the case, and shows who accepted each visit. Every risk factor says where it
came from (family registration form, the demo persona, or a simulated resident) and where today's heat
came from. Each case has a record the ward office can print or save as PDF (`/ward/record/<case id>`):
what opened it, every call and its answers, the rule, the escalation, who accepted, how it closed and
who was told what. No phone numbers; the address only once someone accepted.

### Responsible by design

`/responsible` sets out what Neralu stores, who sees what, how it lines up with India's DPDP Act 2023
(our reading, not a legal review), accessibility, and each known risk with its mitigation and what
remains. In the code: the family's erasure code is random, shown once and stored only as a hash;
call recordings are deleted 7 days after the call (`RECORDING_RETENTION_DAYS`); only the weekday word
is kept from a spoken answer; addresses appear only to the volunteer who accepts.

### Family status link

Registering gives the family a private link, shown once, that shows that one person's checks today in
plain words: "Kamala answered at 11:02 · all fine", "A volunteer is on the way", "Checked in person at
11:29 · safe". It updates by itself and shows nothing about anyone else (no address, no code word, no
volunteer's name). Only a hash of the link is stored, and its secret stays out of server logs. From the
page the family can replace the link, turn it off, or delete the registration with their erasure code.
Demo: console > Demo controls > "Kamala's family view".

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

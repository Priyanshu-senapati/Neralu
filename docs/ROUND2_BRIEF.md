# Round 2 brief: how Neralu works, and what AI we used

Everything here is checked against the code on `main` (24 Oct 2026). File paths let you show the
code if a judge asks. If you don't know an answer, say so and point to the file; don't guess.

---

## 1. The 30-second version

Neralu phones older people who live alone when the heat crosses **their own** threshold. It plays
recorded prompts in Kannada, Hindi or English and asks keypad questions plus "what day is it?".
**Fixed rules, not AI,** turn the answers into GREEN / AMBER / RED / UNREACHED. A worrying answer or
no answer sends a **person** to the door: neighbour, then volunteer, then ASHA worker, then the ward
officer. The family is told. Neralu **never calls 108 itself**; only a human records "called 108".

---

## 2. Architecture

```
Phone (any phone) ──Twilio──► FastAPI backend ──► SQLite (SQLModel)
                               │  scheduler loop, 1 tick/second
                               │  rules.py decides · escalation.py sends people
                               └─SSE /api/stream──► React console (/ward)
Volunteer phone (/volunteer) · Family page (/family) · Registration (/register)
```

- **Backend:** Python 3.11, FastAPI, SQLModel on SQLite, Uvicorn. About 4,800 lines in `backend/app`.
- **Frontend:** React 19, TypeScript, Vite, Tailwind 4, Leaflet map, three.js (story page only),
  GSAP. About 9,000 lines in `frontend/src`. FastAPI serves the built site on the same port.
- **Telephony:** Twilio Programmable Voice (`app/telephony.py`, webhooks in `app/routes/voice.py`).
  A **browser phone** (`/phone`, `TELEPHONY_MODE=browser`) is the fallback: same webhooks logic, same
  rules, it just rings a web page instead of a SIM.
- **Live updates:** Server-Sent Events (`app/routes/stream.py`) with a 10 s heartbeat; clients
  reconnect when heartbeats stop.
- **Public access for the demo:** ngrok tunnel (`deputy-folic-tiptop.ngrok-free.dev`).
- **One command:** `scripts/stage.ps1` builds the site, starts server + ngrok, and runs a go/no-go
  check (server, scheduler, public link, Twilio, call audio).
- **Tests:** 247 automated tests (`backend/tests`, pytest). Frontend: TypeScript strict build.

---

## 3. Who gets called: risk score and personal threshold

`backend/app/risk.py` (mirrored for previews in `frontend/src/heat.ts`).

**Heat index** = US National Weather Service formula (Rothfusz regression with its adjustments),
from temperature and humidity. Weather comes from a **simulated preset** in the demo or the **live
Open-Meteo forecast** for Bengaluru (free, no key, `app/weather.py`).

**Vulnerability score** (capped at 100):

| Factor | Points |
|---|---|
| Age 80+ / 70–79 / 60–69 | 30 / 20 / 10 |
| Lives alone | 20 |
| Sheet roof / top floor | 15 / 8 |
| Heat-sensitive medicines | 15 |
| No fan | 10 |
| Memory difficulty | 10 |
| Hearing difficulty | 5 |

**Personal threshold** = 40 °C − (score ÷ 10, rounded half up), and 1 °C lower if the night stays at
26 °C or more. Example: Kamala, score 70 → 33 °C.

**Calls due:** heat index below threshold → no call; up to 3 °C above → one call at 11:00; more
than 3 °C above → calls at 11:00 and 15:00.

**If asked "where do the weights come from?":** they encode the risk factors public heat-action
guidance names (age, living alone, hot roofs, medicines, no cooling). The exact points and the 40 °C
base are **starting values to calibrate in a pilot**; the UI says so. We have not validated them on
outcome data. Don't claim otherwise.

---

## 4. The call

`app/telephony.py`, `app/routes/voice.py`, prompts in `backend/scripts/prompts.py`, clips in
`backend/static/audio/{kn,hi,en}` (26–27 clips each).

1. **Language menu:** "1 Kannada · 2 Hindi · 3 English"; no key keeps the registered language.
2. **Code word first:** "This is Neralu… your family's code word is Mallige", then "Neralu will never
   ask for money, OTP, Aadhaar or bank details." This is the scam defence.
3. **Keypad questions (1 = yes, 2 = no):** water in the last hour, dizzy/weak/confused, room very
   hot, fan or cooler working.
4. **"What day is it today?"** Spoken answer recorded → speech-to-text → only the **weekday** is
   extracted with a fixed word list (`app/orientation.py`, Kannada/Hindi/English spellings). Keypad
   fallback: press 1–7. No weekday or two weekdays → "uncertain", which is treated as a warning
   sign.
5. **"If you need help now press 2, if you're okay press 1."**
6. A question with no answer is asked once more. A call picked up with no key presses is
   **UNREACHED, never fine**.

**People with memory difficulty** are not asked the day question (it can't tell heat confusion from
their usual memory difficulty). Their **caregiver** (family contact) is called instead with five
caregiver questions and caregiver rules C0–C6.

**Ring timeout:** we hang up after 15 s ringing ourselves (`cancel_unanswered_calls`), because
Twilio trial accounts don't honour the ring timeout. **Lost callbacks** are closed so no call stays
stuck (`close_lost_calls`).

**Security of webhooks:** every Twilio webhook checks `X-Twilio-Signature`. Twilio's trial gateway
fetches the first URL unsigned, so an unsigned request is accepted only if its CallSid is the call
we placed for that check-in **and** Twilio's API confirms it's our account (`validate_signature`).

---

## 5. The rules (the core: `backend/app/rules.py`)

First match wins, in this order. "I'm okay" never overrides another warning sign. **Help comes
first:** a key pressed for help proves the person was reached, so R1 is checked before R0 (and C1
before C0 for caregivers). A teammate fixed this at the finale.

| Rule | Condition | Outcome |
|---|---|---|
| R1 | pressed "need help" | RED |
| R0 | no keypad answers | UNREACHED |
| R2 | symptoms + wrong/unclear day | RED |
| R3 | symptoms + no water | RED |
| R4 | symptoms | AMBER |
| R5 | wrong day | AMBER |
| R6 | no water | AMBER |
| R7 | day unclear or missing | AMBER |
| R8 | 2+ questions unanswered | AMBER |
| R9 | all fine | GREEN |
| S1 | room very hot + fan not working | support case (water/ORS/fan), alongside any outcome |

Escalation rules (`app/calls.py`, `app/escalation.py`):

| Rule | What |
|---|---|
| E1 | no answer on every attempt (2 in demo, 3 in production) → RED case |
| E3 | follow-up call still concerning or unanswered → RED case |
| E4 | support cases stay in the volunteer queue |
| E5 | RED case not accepted in 15 min → next tier; after ASHA → "ward officer action needed" |
| E7 | after a person checked in person, call again 60 min later |
| E8 | a volunteer accepted but recorded no visit within 120 min → ward officer alerted (the volunteer keeps the case) |

AMBER → family told + follow-up call 30 min later. Retries are 15 min apart. Every outcome stores
the rule id and reason; the console shows the plain-English explanation of each rule.

**Why rules and not an AI model:** it's a safety decision about vulnerable people. Rules are
predictable, explainable to a family in one sentence, testable (`tests/test_rules.py`), and auditable.
An LLM can be wrong in ways nobody can predict or explain.

---

## 6. Escalation: sending a person

`app/escalation.py`, `app/responders.py`.

- **Tiers:** neighbour (if on file) → volunteer → ASHA worker → ward officer (overdue).
- **Who is alerted:** the 3 nearest on-duty responders (`ALERT_NEAREST`), ranked free first, then by
  distance (haversine, `app/geo.py`). Anyone on duty can still accept.
- **Accept is atomic:** a SQL compare-and-set (`UPDATE … WHERE state='open'`); exactly one
  volunteer wins, the others see "Someone else accepted" (HTTP 409).
- **"Can't go":** the case goes straight to the next nearest available responder; if nobody is left,
  the tier is skipped rather than leaving the case unasked.
- **Address privacy:** volunteers see why and the distance (no coordinates); the address, phone and
  exact location appear only after they accept that one case. On the console, real people are
  placed to about 100 m, and the **family code word is not shown to the console at all**: it's played
  on the call and shown once to the family who chose it.
- **Resolution** by the volunteer: safe in person · support delivered · called 108 · couldn't reach
  (escalates).
- **Never 108 automatically.** Only a human records "called 108".

---

## 7. The scheduler and the demo clock

`app/scheduler.py` runs `sync_tick` every real second: pilot schedule → place due calls → ring
timeouts → simulated residents → acknowledgement timeouts (E5) → hourly recording sweep.

**Demo clock ×60:** one real second = one scenario minute, so a 15-minute timeout takes 15 seconds on
stage. The console always shows the badge "Demo · time ×60 · 2 call attempts (production 3)".

**Pilot mode** (`RUN_MODE=pilot`): real time, today's real forecast, rounds placed automatically at
11:00 and 15:00 IST, and it resumes after a restart.

---

## 8. What is real and what is simulated (say this proactively)

| Real | Simulated (labelled in the UI) |
|---|---|
| The call to the demo phone, its audio, its answers | Ward 47 and its ~400 residents (fictional) |
| Speech-to-text of the spoken day | Their call answers (weighted scenarios, `app/sim_caller.py`) |
| The rules, escalation, timers, volunteer phone | Weather presets (unless "live forecast" is used) |
| Registration, family link, erasure, missed call | Family/neighbour messages (unless `FAMILY_SMS=twilio`) |
| Live Open-Meteo forecast (optional) | Simulated volunteers who accept other residents' cases |

Simulated residents go through **the same rules and escalation code** as Kamala. The demo persona's
case is never auto-accepted; only a real person on the volunteer phone can accept it.

---

## 9. Features built at the finale (after the `pre-finale` git tag)

`git log pre-finale..main` shows them. Main ones:
- **Pilot mode** (R2-1): real day, automatic rounds, resumes after restart.
- **What-if planner** (R2-2): from tomorrow's forecast → who gets called, expected cases,
  volunteers needed, shortfall. Uses the same selection code as real rounds.
- **Reassignment** (R2-3): on/off duty, "Can't go", nearest-free ranking, simulated visits that end.
- **Impact panel** (R2-4): a broadcast heat alert vs Neralu on the same day; each number shows how it
  was counted.
- **Family status link** (R2-5, merged with Gourab's version): private random link, only its hash
  stored, secret kept out of server logs, replace or turn off.
- **Responsible-tech hardening** (R2-6): erasure code, 7-day recording deletion, `/responsible`.
- **Console polish** (R2-7): filters, data source per risk factor, printable case record.
- **Missed-call check-in:** ring the Neralu number, it rejects the call (free) and calls back.
- From teammates: caregiver check, after-care call (E7), browser-phone speech watchdog, pitch notes.

---

## 10. Privacy and safety (DPDP Act 2023 alignment)

See `/responsible` and `app/privacy.py`.
- **Stored:** what the check needs. No Aadhaar, bank details, location tracking, diagnoses.
- **Spoken answers:** only the weekday word is kept, never the words. Recordings auto-deleted
  after 7 days (`RECORDING_RETENTION_DAYS`), hourly sweep, including stray files.
- **Right to erasure:** a random code (`XXXX-XXXX`, no look-alike letters) shown once at registration,
  stored only as a SHA-256 hash, compared in constant time. Deletes the person and everything about
  them, from the confirmation screen or the family page.
- **Family link:** 144 random bits, only the hash stored, sent in a header so it stays out of logs.
- **Consent:** registration can't finish without confirming the person's permission.
- **Honest gaps (say these if asked):** the person themselves doesn't yet confirm on their first call;
  no written retention period for call records beyond recordings; no volunteer safety check-in; the
  demo console has **no officer login** (a deployment needs authentication and role-based access).
  The DPDP mapping is our reading, not a legal review.

---

## 11. AI disclosure: exactly what and where

### A. AI inside the product (runs while Neralu works)

| Where | What AI | What it does | What it does not do |
|---|---|---|---|
| `app/transcribe.py` | **Sarvam AI Saaras v4** speech-to-text | Transcribes the spoken answer to "what day is it?" | Never decides an outcome. Only a weekday word is extracted, by a fixed word list. Failure or timeout → "uncertain" → treated as a warning sign (R7/R2) |
| `backend/static/audio/*` (made by `scripts/make_audio.py`) | **Sarvam AI Bulbul v4** text-to-speech | Generated the recorded prompts in Kannada, Hindi, Indian English, at a slower pace for older listeners | Generated **once, offline**; calls play fixed MP3 files, nothing is generated live |
| `app/telephony.py` (`SAY_VOICE = "Polly.Aditi"`) | **Amazon Polly** voice through Twilio `<Say>` | Fallback only: speaks a prompt whose clip doesn't exist yet (the caregiver prompts today) | Same fixed text; no generation of content |
| `/phone` page | Browser's built-in speech synthesis | Fallback voice on the browser phone for missing clips | Same fixed text |

**No language model (LLM) is used anywhere in the running product.** No outcome, message, escalation
or number is produced by AI. `rules.py` decides, and it has tests.

An AI incident briefing for officers was considered and rejected (`docs/HACKATHON_PLAN.md`,
"Considered and not building"); its unused API-key settings were removed from the code.

Earlier, **Kokoro** (an open-source text-to-speech model) was tried for English prompts and replaced
by Sarvam's Indian-English voice (commit `d30b7b6`). It is not used now.

### B. AI used to build Neralu (development)

| Tool | How we used it |
|---|---|
| **Claude Code** (Anthropic; model Claude Opus 5.5) | Wrote most of the code under the team's direction and review; planning, tests, debugging, merges. 87 of 105 commits carry the `Co-Authored-By: Claude` trailer, so it's visible in git history |
| **ChatGPT** (OpenAI) | Brainstorming and reviewing the feature plan |
| **Sarvam AI** | The prompt audio above (also a product dependency) |

**What the team did:** chose the problem and the design (who to call, the rules, the escalation
ladder, never calling 108), decided every feature and trade-off, reviewed and tested the code,
tested real calls on real phones, merged teammates' work, and wrote the pitch.

**Borrowed components (human-made, not AI):** from 21st.dev, the FlowButton, the story page's shader
background and the wireframe dotted globe (adapted, credited in each file and in the README).

**Content still needing a human:** the Kannada (and Hindi) prompt wording has **not yet been reviewed
by a native speaker**, and the audio is synthetic. Say this openly. (Fill in who wrote the Kannada
text, and how, before round 2: the code doesn't record it.)

### How to say it in one breath

"We used Claude Code to write most of the code under our direction, and ChatGPT to brainstorm. In
the product, AI only does speech: Sarvam turns a spoken weekday into text and generated our
recorded prompts. No AI makes any decision. Fixed rules do, and they're tested."

---

## 12. Questions judges are likely to ask

**Why not WhatsApp or an app?** The people at risk are least connected. A plain call works on any
phone, needs no smartphone, no data, no literacy.

**What if they say "I'm fine" but aren't?** "I'm okay" never overrides another sign. The day
question catches confusion. Unclear = follow up. Unanswered = a person goes. After a visit, Neralu
calls again (E7).

**What if the speech-to-text is wrong?** Worst case is a false alarm, never false reassurance:
any failure, timeout or unclear transcript scores "uncertain" → AMBER (R7) or RED with symptoms (R2).
And it only affects one of six signals.

**Scam calls pretending to be Neralu?** Every call opens with the household's code word, and
never asks for money/OTP/Aadhaar. A code word can leak; families should choose one only they know.

**Two volunteers accept at once?** Atomic SQL compare-and-set; exactly one wins (tested).

**Nobody accepts?** E5: every 15 min the next tier; after ASHA the ward officer is alerted on the
console. A case is never left with nobody asked.

**A volunteer accepts and never goes?** E8: no visit recorded within two hours → the ward officer is
alerted; the volunteer can still record the visit.

**How does it scale?** Calls are independent; Twilio handles concurrency. SQLite is fine for one
ward; a city needs Postgres and one worker per ward or a queue. The scheduler is one loop per server
today. The what-if planner shows how many volunteers a forecast needs.

**What does it cost?** Twilio charges per call minute; a check is about a minute. Missed calls cost
the caller nothing. Don't quote a figure we haven't measured.

**Data protection?** See section 10. Be honest about the gaps.

**What's real in this demo?** See section 8.

**Twilio trial limits?** Trial accounts can only call verified numbers and play a trial notice.
That's why the browser phone exists as a fallback, with identical logic.

**What would a pilot need?** Native-speaker Kannada recordings, calibrated thresholds, an officer
login, ASHA/resident-association onboarding, and a legal review of the DPDP mapping.

---

## 13. Live checks you can show

- `cd backend && .venv\Scripts\python.exe -m pytest -q` → 247 passed.
- Console `/ward` → click a resident → "Why Neralu calls" (score breakdown with data source) →
  "Case record · print or save".
- `/responsible` → the privacy and risk page.
- `git log pre-finale..main --oneline` → finale work.
- `backend/app/rules.py` → the whole decision logic fits on one screen.

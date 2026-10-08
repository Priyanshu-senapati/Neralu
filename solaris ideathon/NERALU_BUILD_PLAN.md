# Neralu — Context & Build Plan (for Claude Code)

> **Read this whole file before writing any code.** It contains the product context, the decisions that are already made (and why), the exact contracts between modules, and the build order. Work task by task, in order. Run the tests after every task. Commit after every task. Do not add features that are not in this file. If something here is ambiguous or seems wrong, stop and ask instead of guessing.

**Demo date:** Friday 9 October 2026 (Hack4SDG ideathon prelims, AIESEC in Bengaluru). Presentation slot is 7–8 minutes. There is roughly one working day to build.

---

## 0. Put this in `CLAUDE.md` at the repo root

```markdown
# Neralu
Heatwave welfare-check system: calls elderly people who live alone, checks observable warning signs,
escalates to humans. Full spec and build order: docs/NERALU_PLAN.md — read it before any task.

Rules for working in this repo:
- Follow the build order in docs/NERALU_PLAN.md §9. One task at a time. Tests pass before moving on. Commit per task.
- The safety decision is made by deterministic rules in backend/app/rules.py. Never let an LLM decide an outcome.
- The system never calls 108/emergency services. Only a human records "called 108".
- No placeholder UI. If a button exists, it works. If it doesn't work yet, it doesn't exist.
- No emoji, no gradients, no glassmorphism, no "AI-powered" marketing copy. Follow §8 design rules.
- Everything simulated (weather, demo clock, the ~400 seeded residents' responses, family notifications) is labelled as simulated in data and UI.
- Keep files small and single-purpose. Backend: FastAPI + SQLModel + SQLite. Frontend: Vite + React + TypeScript + Tailwind.
```

---

## 1. Product context

### The problem
In a heatwave, the people most likely to be hurt are elderly people living alone — often on a basic keypad phone, often with heat-sensitive medicines, often under sheet roofs. India broadcasts heat alerts, but a broadcast only *tells*; nobody *checks* whether a specific person is okay. Heat action plans generally lack mapping of vulnerable individuals, and heat varies sharply within a single ward, so city-level "it's fine today" can be wrong for one house.

### The solution
**Neralu turns a city-wide heat warning into a personalised welfare check for the people most likely to be hurt by it.**

1. A **risk engine** decides who needs a call today, using a personal vulnerability score and a personal heat threshold (not a city-wide one).
2. Neralu **phones** each due person on any phone, in their language, with a pre-recorded human voice and a family-chosen code word.
3. It asks closed questions answered by keypad, plus one spoken **orientation check** ("What day is it today?") — because heat-related confusion can make someone say "I'm fine" when they are not.
4. A **deterministic rule engine** classifies the result: GREEN / AMBER / RED, plus a separate "needs support" flag.
5. **Escalation** goes to humans step by step: neighbour (if on file) → RWA volunteer → ASHA worker. The system never calls an ambulance; only a human decides that.
6. A **ward dashboard** shows the ward officer who is fine, who needs follow-up, who is escalated and how long each case has been waiting.

Punchline for the pitch: *"We don't just warn vulnerable people. We make sure someone knows they're safe."*

### Honest positioning (do not contradict this anywhere in the product or copy)
- The call → check → escalate method is **proven abroad** (Seoul, Taipei AI welfare calls; Australian Red Cross TeleRedi heat check-ins). Neralu does not claim to have invented it.
- Neralu's contribution is **adapting it for India**: basic phones, Indian languages, a scam-flooded phone culture (trust layer), registries that already exist (ASHA records, pension rolls, RWAs, family members registering a parent), and no dependence on the elder's electricity or internet.

### SDG mapping
- **Primary:** SDG 11 (booklet problem statement: smart city application improving urban living through efficient resource management and enhanced public services). Neralu = an enhanced public service that sends scarce responders only where needed.
- **Supporting:** SDG 3 (target 3.d, early warning for health risks), SDG 13 (target 13.1, resilience to climate hazards). Also SDG target 11.5 (reduce disaster deaths, focus on the vulnerable).

### Non-negotiable product decisions (do not "improve" these away)
| Decision | Why |
|---|---|
| Voice call, not an app, for the elder | Most vulnerable elders use keypad phones and may not read. |
| Pre-recorded human Kannada voice for fixed prompts | Warmth and zero mispronunciation risk. Production would use Bhashini TTS. |
| Code word chosen by family from a preset list, played on every call | Scam-call distrust is the #1 adoption risk. Preset list means every code word can be pre-recorded. |
| Every call says "Neralu will never ask for money, OTP, Aadhaar or bank details" | Once people trust Neralu, scammers will impersonate it. |
| Orientation question ("What day is it today?") is scored | A confused person may press "I'm okay". Self-report never overrides other signals. |
| Rules decide outcomes; AI only transcribes/parses | Defensible: AI never decides someone is safe. Uncertainty escalates. |
| Answered call with zero valid inputs = **unreached** | Operator announcements / picked-up-and-dropped calls must not count as "fine". |
| Never auto-call 108 | Only a human, after seeing/hearing an emergency, records "called 108". |
| Addresses hidden by default; volunteer sees an address only after accepting a case | A database of elderly people living alone is a burglar's dream. |
| No "within the hour" promises in UI copy | Show live waiting timers instead of SLAs. |
| Simulated things are labelled | Judges trust teams that show their simulation. |

---

## 2. What is real vs simulated in the demo

| Real | Simulated (and labelled as such) |
|---|---|
| The phone call to "Kamala" (a team phone handed to a judge) | Weather input (set from the demo controls) |
| Keypad answers, the recorded orientation answer, its transcription | Demo clock speed (e.g. ×60) and reduced attempts (2 instead of 3) |
| Rule engine classification | The ~400 seeded residents' call outcomes (`SimulatedCaller`) |
| Escalation state machine and timers | Family notifications (logged as "simulated channel"; WhatsApp in production) |
| Volunteer accepting/resolving on a real phone (mobile web) | — |
| Live dashboard updates via SSE | — |
| Live registration of a new elder from a phone | — |

Prepared answer for "what's simulated?": *"The weather trigger, the clock speed and the other residents' responses. The call, the answers, the rules and the escalation are real."*

---

## 3. Architecture

```
            ┌──────────────┐  POST /api/sim/heat   ┌────────────────────────────┐
 Demo ctrl ─►  Dashboard   │──────────────────────►│        FastAPI backend      │
            │  (laptop)    │◄──── SSE /api/stream ─┤                            │
            └──────────────┘                       │ risk.py → who is due        │
            ┌──────────────┐  accept / resolve     │ calls.py → schedule rounds  │
 Teammate ─►  Volunteer    │──────────────────────►│ telephony.py ─► Twilio ─────┼──► Kamala's phone
 phone      │  page (mob.) │◄──── SSE ─────────────┤ voice routes ◄─ webhooks ───┤
            └──────────────┘                       │ transcribe.py ─► Sarvam/    │
            ┌──────────────┐  POST /api/elders     │              Bhashini STT   │
 Family  ──►  Register     │──────────────────────►│ rules.py → Verdict          │
 phone      └──────────────┘                       │ escalation.py → cases/tiers │
                                                   │ events.py → log + SSE       │
                                                   │ SQLite (SQLModel)           │
                                                   └────────────────────────────┘
```

**Tech stack**
- Backend: Python 3.11+, FastAPI, Uvicorn, SQLModel (SQLite), `twilio`, `httpx`, `pydantic-settings`, `sse-starlette`, `pytest`.
- Frontend: Vite, React 18, TypeScript, Tailwind CSS, React Router, Leaflet + react-leaflet (CARTO Positron basemap, with attribution). **Do not use shadcn default styling**; if any component library is used, restyle it to §8 tokens.
- Telephony: Twilio Programmable Voice (upgraded account — trial accounts prepend a trial message and can only call verified numbers).
- Speech-to-text for the orientation answer: Sarvam AI or Bhashini, behind one interface. **Look up the current endpoint, model name and auth format in their official docs; do not guess.**
- Optional LLM fallback for parsing a messy transcript: Anthropic API, constrained to a fixed JSON schema.
- Public URL for Twilio webhooks: ngrok during development; Railway (or laptop + ngrok + phone hotspot) for the demo. **Not Render free tier** (sleeps, ~50 s cold start).

---

## 4. Repository layout

```
neralu/
  CLAUDE.md
  docs/NERALU_PLAN.md                 ← this file
  backend/
    pyproject.toml
    .env.example
    app/
      main.py            FastAPI app, routers, CORS, startup (create tables, start scheduler loop)
      config.py          Settings (env vars, §5)
      db.py              engine, get_session(), current_run_id()
      models.py          SQLModel tables (§6)
      clock.py           DemoClock
      events.py          log_event(), Broadcaster (SSE fan-out)
      risk.py            heat index, vulnerability score, personal threshold, calls_due
      rules.py           Signals, Verdict, classify()
      orientation.py     parse_weekday(), score_orientation()
      transcribe.py      transcribe() provider interface (Sarvam | Bhashini)
      telephony.py       place_call(), TwiML builders, signature validation
      calls.py           start_round(), handle_call_ended(), retries
      sim_caller.py      SimulatedCaller for seeded residents
      escalation.py      open_case(), accept_case(), resolve_case(), tick()
      notify.py          Notifier interface (ConsoleNotifier = "simulated channel")
      routes/
        voice.py         Twilio webhooks
        elders.py        list/register/get elders
        cases.py         list/get/accept/resolve cases
        summary.py       counts + weather
        sim.py           heat trigger, round, reset
        stream.py        SSE endpoint
        recordings.py    authenticated proxy for Twilio recordings
    seed/
      seed.py            deterministic seed (random.seed(47))
      names.py           given-name pools per language
    static/audio/kn/     pre-recorded prompts (§7.3)
    tests/
      test_rules.py  test_risk.py  test_orientation.py  test_escalation.py
      test_voice_flow.py  test_calls.py  test_api.py
  frontend/
    index.html
    src/
      main.tsx  App.tsx            routes: "/" dashboard, "/volunteer", "/register"
      api.ts                       typed fetch helpers
      types.ts                     API types (§6.3)
      useEventStream.ts            SSE hook with auto-reconnect + refetch
      styles/tokens.css            design tokens (§8)
      pages/Dashboard.tsx  pages/Volunteer.tsx  pages/Register.tsx
      components/
        TopBar.tsx  WeatherBlock.tsx  DemoClockBadge.tsx  CountCards.tsx
        AttentionList.tsx  StatusPill.tsx  WardMap.tsx  CaseDrawer.tsx
        RiskBreakdown.tsx  AnswerTable.tsx  EventTimeline.tsx  RecordingPlayer.tsx
        DemoControls.tsx  WaitingTimer.tsx
```

---

## 5. Configuration (`backend/.env.example`)

```
DATABASE_URL=sqlite:///./neralu.db
PUBLIC_BASE_URL=https://<your-ngrok-or-railway-host>
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
VALIDATE_TWILIO_SIGNATURE=true
STT_PROVIDER=sarvam            # sarvam | bhashini
SARVAM_API_KEY=
BHASHINI_API_KEY=
ANTHROPIC_API_KEY=             # optional, transcript-parsing fallback only
STT_TIMEOUT_S=6

# Demo tuning (all escalation timers are in SCENARIO minutes, converted by DemoClock)
DEMO_SPEED=60                  # 1 real second = 60 scenario seconds
MAX_ATTEMPTS=2                 # production value: 3
RING_TIMEOUT_S=15              # real seconds the phone rings (cannot be compressed)
RETRY_GAP_MIN=15
ACK_TIMEOUT_MIN=15             # volunteer / ASHA must accept within this
AMBER_RECALL_MIN=30
SCENARIO_START=2026-10-09T10:55:00+05:30

# Demo persona phones (E.164)
KAMALA_PHONE=+91XXXXXXXXXX
VOLUNTEER_DEMO_TOKEN=priya-demo
```

---

## 6. Data model and contracts

### 6.1 Tables (`app/models.py`)

All tables carry `run_id: str` (a new run starts on every reset). Webhooks or events for an old `run_id` are ignored.

**Elder**
`id, run_id, name, age:int, phone:str|None, language: "kn"|"ta"|"te"|"ur"|"hi", lives_alone:bool, roof_type: "sheet"|"tile"|"concrete"|"top_floor", has_fan:bool, heat_sensitive_meds:bool, hearing_difficulty:bool, cognitive_flag:bool, neighbour_phone:str|None, family_phone:str|None, family_name:str|None, code_word: CodeWord, address:str, lat:float, lng:float, is_simulated:bool, consent_given_at:datetime, created_at`

`CodeWord` = one of: `mallige, sampige, sevanthige, tulasi, maavu, bevu, kaveri, chandra, nakshatra, gulabi` (each has a pre-recorded audio file).

**CheckIn** (one per elder per round per attempt)
`id, run_id, elder_id, round_no:int, attempt:int, scheduled_for_real:datetime, call_sid:str|None, call_status: "queued"|"ringing"|"in-progress"|"completed"|"busy"|"no-answer"|"failed"|"canceled"|None, answers: JSON (Signals fields), recording_url:str|None, transcript:str|None, outcome: Outcome|None, rule_id:str|None, reason:str|None, needs_support:bool, processed:bool (idempotency), is_simulated:bool`

**Case**
`id, run_id, elder_id, level: "red"|"support", rule_id, reason, state: "open"|"assigned"|"resolved", tier: "neighbour"|"volunteer"|"asha", tier_started_real:datetime, overdue:bool, assignee_id:int|None, resolution: "safe_in_person"|"support_delivered"|"called_108"|"not_found_escalate"|None, resolution_note:str|None, opened_real, resolved_real`

**Volunteer**
`id, run_id, name, role: "volunteer"|"asha", phone, token:str, lat, lng, on_duty:bool`

**Event** (append-only; powers timeline, audit log and SSE)
`id, run_id, ts_real, ts_scenario, kind: EventKind, elder_id|None, case_id|None, checkin_id|None, actor: "system"|"rules"|"twilio"|"volunteer"|"family"|"officer"|"sim", message:str, data: JSON, simulated:bool`

`EventKind` = `run_reset, sim_weather_set, round_started, call_placed, call_ringing, call_answered, answer_recorded, call_ended, attempt_failed, retry_scheduled, checkin_classified, recall_scheduled, case_opened, tier_alerted, tier_skipped, tier_overdue, case_accepted, case_resolved, family_notified, elder_registered`

### 6.2 Module interfaces (exact names — later tasks depend on these)

```python
# clock.py
class DemoClock:
    def __init__(self, speed: int, scenario_start: datetime): ...
    def reset(self) -> None                                  # anchors scenario_start to now
    def scenario_now(self) -> datetime
    def real_seconds(self, scenario_minutes: float) -> float # minutes * 60 / speed
    def to_scenario(self, real_ts: datetime) -> datetime

# events.py
def log_event(session, kind: EventKind, message: str, *, actor: str, elder_id=None,
              case_id=None, checkin_id=None, data: dict | None = None, simulated: bool = False) -> Event
class Broadcaster:
    async def subscribe(self) -> AsyncIterator[Event]
    def publish(self, event: Event) -> None

# risk.py
def heat_index_c(temp_c: float, humidity_pct: float) -> float           # NOAA Rothfusz, computed in °F, returned in °C, 1 dp
def vulnerability_score(elder: Elder) -> tuple[int, list[tuple[str, int]]]  # (score 0–100, breakdown)
def personal_threshold_c(score: int, night_min_c: float) -> float
def calls_due(elder: Elder, heat_index: float, night_min_c: float) -> int   # 0, 1 or 2

# rules.py
Answer = Literal["yes", "no", "none"]
Orientation = Literal["correct", "wrong", "uncertain", "none"]
SelfReport = Literal["ok", "help", "none"]
class Outcome(str, Enum): GREEN, AMBER, RED, UNREACHED
@dataclass(frozen=True)
class Signals: water: Answer; symptoms: Answer; room_hot: Answer; fan_working: Answer
               orientation: Orientation; self_report: SelfReport
@dataclass(frozen=True)
class Verdict: outcome: Outcome; rule_id: str; reason: str; needs_support: bool
def classify(signals: Signals) -> Verdict

# orientation.py
def parse_weekday(transcript: str) -> int | None        # 0=Mon … 6=Sun; Kannada, Hindi, English, transliterations
def score_orientation(transcript: str | None, today: date) -> Orientation

# transcribe.py
async def transcribe(audio: bytes, lang: str) -> str | None   # None on error/timeout (STT_TIMEOUT_S)

# telephony.py
def place_call(to: str, checkin_id: int) -> str               # returns CallSid
def validate_signature(request) -> None                       # raises 403 if invalid and validation enabled

# calls.py
def start_round(session, round_no: int) -> int                # returns number of check-ins created
def handle_call_ended(session, checkin_id: int, call_status: str) -> None   # idempotent
def schedule_retry(session, checkin: CheckIn) -> CheckIn | None

# escalation.py
def open_case(session, elder_id: int, level: str, rule_id: str, reason: str) -> Case
def accept_case(session, case_id: int, volunteer_id: int) -> Case     # raises AlreadyAccepted
def resolve_case(session, case_id: int, volunteer_id: int, resolution: str, note: str | None) -> Case
async def tick(session) -> None                                       # retries, ack timeouts, recalls

# notify.py
class Notifier(Protocol):
    def notify(self, to: str, message: str) -> None
class ConsoleNotifier: ...   # logs a family_notified event with simulated=True
```

### 6.3 HTTP API

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /api/summary` | — | `Summary` |
| `GET /api/elders` | `?status=` optional | `ElderListItem[]` (no address, no phone) |
| `GET /api/elders/{id}` | — | `ElderDetail` (address only if a case for this elder is assigned) |
| `POST /api/elders` | `RegisterElder` | `ElderDetail`, 201 |
| `GET /api/cases` | `?state=open,assigned` | `CaseListItem[]` |
| `GET /api/cases/{id}` | — | `CaseDetail` (checkins, events, recording proxy URLs) |
| `POST /api/cases/{id}/accept` | `{volunteer_token}` | `CaseDetail`, or 409 `{"error":"already_accepted"}` |
| `POST /api/cases/{id}/resolve` | `{volunteer_token, resolution, note?}` | `CaseDetail` |
| `GET /api/volunteer/me` | `?token=` | volunteer + open cases for them (address revealed only for their assigned case) |
| `POST /api/sim/heat` | `{temp_c, humidity_pct, night_min_c}` | `Summary` (logs `sim_weather_set`) |
| `POST /api/sim/round` | `{round_no}` | `{created:int}` |
| `POST /api/sim/reset` | — | `{run_id}` (new run, reseed, clock reset) |
| `GET /api/stream` | — | SSE: `event: <EventKind>`, `data: <Event JSON>` |
| `GET /api/recordings/{checkin_id}` | — | audio proxied from Twilio with basic auth |
| `POST /voice/answer` | `?checkin_id=` | TwiML |
| `POST /voice/gather/{step}` | `?checkin_id=` + Twilio form | TwiML |
| `POST /voice/orientation` | `?checkin_id=` + Twilio form | TwiML |
| `POST /voice/status` | `?checkin_id=` + Twilio form | 204 |

Frontend types (`frontend/src/types.ts`) — the frontend can be built against these with mock JSON from hour 1:

```ts
export type Outcome = "GREEN" | "AMBER" | "RED" | "UNREACHED";
export type CaseState = "open" | "assigned" | "resolved";
export type Tier = "neighbour" | "volunteer" | "asha";

export interface Summary {
  run_id: string;
  scenario_now: string;                 // ISO
  demo_speed: number; max_attempts: number;
  weather: { temp_c: number; humidity_pct: number; heat_index_c: number; night_min_c: number;
             level: "normal" | "caution" | "severe_for_vulnerable"; simulated: true };
  round_no: number | null;
  counts: { registered: number; due_today: number; fine: number; follow_up: number;
            escalated: number; unreached_now: number; support: number };
}
export interface ElderListItem {
  id: number; name: string; age: number; language: string; lives_alone: boolean;
  roof_type: string; risk_score: number; lat: number; lng: number; is_simulated: boolean;
  latest: { outcome: Outcome | null; rule_id: string | null; reason: string | null;
            attempt: number | null; at_scenario: string | null; needs_support: boolean } ;
  open_case: { id: number; level: "red" | "support"; tier: Tier; state: CaseState;
               opened_scenario: string; overdue: boolean } | null;
}
export interface Event {
  id: number; kind: string; ts_scenario: string; actor: string; message: string;
  elder_id: number | null; case_id: number | null; checkin_id: number | null;
  data: Record<string, unknown>; simulated: boolean;
}
export interface CaseDetail {
  id: number; level: "red" | "support"; state: CaseState; tier: Tier; overdue: boolean;
  rule_id: string; reason: string; opened_scenario: string; resolution: string | null;
  elder: ElderListItem & { address: string | null; risk_breakdown: [string, number][] };
  checkins: { id: number; round_no: number; attempt: number; call_status: string | null;
              answers: Record<string, string>; transcript: string | null;
              recording_url: string | null; outcome: Outcome | null; rule_id: string | null }[];
  events: Event[];
}
```

---

## 7. Core logic (exact values)

### 7.1 Risk engine (`risk.py`)

Heat index: NOAA Rothfusz regression (convert °C→°F, apply the regression with its standard low-humidity/high-humidity adjustments, and the simple formula when HI < 80 °F; convert back to °C, round to 1 dp).

Vulnerability score (cap at 100), breakdown labels shown verbatim in the UI:

| Factor | Points | Label |
|---|---|---|
| age 60–69 / 70–79 / 80+ | 10 / 20 / 30 | `Age 74` (actual age) |
| lives_alone | 20 | `Lives alone` |
| roof_type sheet | 15 | `Sheet roof` |
| roof_type top_floor | 8 | `Top floor` |
| heat_sensitive_meds | 15 | `Heat-sensitive medicines` |
| not has_fan | 10 | `No fan` |
| cognitive_flag | 10 | `Memory difficulty` |
| hearing_difficulty | 5 | `Hearing difficulty` |

Personal threshold: `40.0 - round(score / 10)`, minus `1.0` if `night_min_c >= 26`. (Score 0 → 40 °C; score 100 → 30 °C.) Label in UI: *"Thresholds are starting values to be calibrated in a pilot."*

`calls_due`: `0` if heat_index < threshold; `1` if threshold ≤ HI < threshold + 3 (call at 11:00 scenario time); `2` if HI ≥ threshold + 3 (11:00 and 15:00). Elders with `cognitive_flag` are not called directly in the MVP: they appear with a "Caregiver route" tag and count as due (production: call the caregiver).

Weather `level`: `severe_for_vulnerable` if HI ≥ 37, `caution` if HI ≥ 33, else `normal`.

### 7.2 Rule engine (`rules.py`) — first matching rule wins

`needs_support` is computed independently of the outcome: **S1** — `room_hot == "yes" and fan_working == "no"`.

| ID | Condition | Outcome | Reason (UI copy) |
|---|---|---|---|
| R0 | all four keypad answers are `none` | UNREACHED | No valid answer on the call |
| R1 | `self_report == "help"` | RED | Asked for help |
| R2 | `symptoms == "yes"` and `orientation in ("wrong","uncertain")` | RED | Symptoms with possible confusion |
| R3 | `symptoms == "yes"` and `water == "no"` | RED | Symptoms and no water |
| R4 | `symptoms == "yes"` | AMBER | Reported dizziness, weakness or confusion |
| R5 | `orientation == "wrong"` | AMBER | Did not know the day |
| R6 | `water == "no"` | AMBER | No water in the last hour |
| R7 | `orientation in ("uncertain","none")` | AMBER | Orientation answer unclear |
| R8 | two or more of the four keypad answers are `none` | AMBER | Several questions unanswered |
| R9 | otherwise | GREEN | All checks fine |

`self_report == "ok"` never overrides anything.

**Escalation rules** (`escalation.py`, `calls.py`):
- **E1** UNREACHED: schedule retry after `RETRY_GAP_MIN` until `MAX_ATTEMPTS`; after the last failed attempt → open RED case, reason "No answer ×N".
- **E2** RED → open case (level red) at the first available tier: neighbour if `neighbour_phone` else volunteer (log `tier_skipped` "No neighbour on file").
- **E3** AMBER → notify family (simulated channel) + schedule a recall after `AMBER_RECALL_MIN`. If the recall is AMBER or UNREACHED-after-retries → RED case, reason "Second concerning check-in".
- **E4** `needs_support` → open case (level support) at volunteer tier; support cases do not auto-advance to ASHA, they stay in the volunteer queue.
- **E5** Red case not accepted within `ACK_TIMEOUT_MIN` at a tier → advance (neighbour → volunteer → asha). At asha with no acceptance → `overdue = true`, log `tier_overdue` "Ward officer action needed". **Never call 108.**
- **E6** Resolution `not_found_escalate` → reopen at the next tier (or overdue if at asha).
- Family is notified (simulated) on every RED case and every resolution.

### 7.3 Call flow (TwiML) and audio

All prompts are pre-recorded MP3s (mono, normalised, each under ~6 s) at `static/audio/kn/`, served from `PUBLIC_BASE_URL/audio/kn/...`. **A native Kannada speaker writes and records the Kannada lines; do not machine-translate without native review.** English meaning:

| File | Meaning |
|---|---|
| `greet.mp3` | "Namaskara. This is Neralu, the heat care service from your ward office." |
| `name_kamala.mp3` | "Kamala avare," (record names for demo personas only; skip name clip if absent) |
| `code_intro.mp3` + `code_<word>.mp3` | "Your family's code word is: …" |
| `safety.mp3` | "Neralu will never ask for money, OTP, Aadhaar or bank details." |
| `q_water.mp3` | "Have you had water in the last hour? Press 1 for yes, 2 for no." |
| `q_symptoms.mp3` | "Do you feel dizzy, weak or confused? Press 1 for yes, 2 for no." |
| `q_room.mp3` | "Is your room very hot right now? Press 1 for yes, 2 for no." |
| `q_fan.mp3` | "Is your fan or cooler working? Press 1 for yes, 2 for no." |
| `q_orientation.mp3` | "Please tell me, what day is it today?" |
| `q_help.mp3` | "If you need help now, press 2. If you are okay, press 1." |
| `reprompt.mp3` | "Sorry, I didn't catch that. Press 1 for yes, 2 for no." |
| `advice.mp3` | "Please drink a glass of water now and stay in the coolest part of your home." |
| `close_ok.mp3` | "Thank you. We will check on you again later today." |
| `close_help.mp3` | "Thank you. Someone from your area is being informed now." |

Flow:
1. `place_call(to, checkin_id)` → `calls.create(to, from_, url=/voice/answer?checkin_id=, status_callback=/voice/status?checkin_id=, status_callback_event=["initiated","ringing","answered","completed"], timeout=RING_TIMEOUT_S)`.
2. `/voice/answer` → `<Play>` greet, name (if present), code_intro, code_<word>, safety → `<Gather input="dtmf" numDigits="1" timeout="8" action="/voice/gather/water?checkin_id=">` with `<Play>q_water</Play>`; after the Gather, `<Redirect>` to `/voice/gather/water?checkin_id=&timeout=1`.
3. `/voice/gather/{step}` for `water → symptoms → room → fan`: store `1→"yes"`, `2→"no"`, anything else/timeout → one reprompt, then `"none"` and continue. Log `answer_recorded` (data: `{"step", "value", "via": "keypad"}`).
4. After `fan` → `<Play>q_orientation</Play><Record maxLength="5" timeout="3" playBeep="false" action="/voice/orientation?checkin_id=">`.
5. `/voice/orientation` → store `RecordingUrl`, kick off transcription as a background task (`transcribe` → `score_orientation`; failure/timeout → `"uncertain"`), then `<Gather>` with `q_help` → `/voice/gather/help`.
6. `/voice/gather/help` → `1→"ok"`, `2→"help"`, else `"none"`. If water was "no", play `advice.mp3`. Play `close_help.mp3` if help, else `close_ok.mp3`. `<Hangup/>`.
7. `/voice/status` on terminal status (`completed|busy|no-answer|failed|canceled`) → `handle_call_ended(checkin_id, status)`: if not completed → UNREACHED attempt; if completed → wait (max STT_TIMEOUT_S) for orientation scoring, build `Signals`, `classify`, persist, apply E1–E4. Must be **idempotent** (`processed` flag; Twilio can repeat callbacks).

Every webhook: validate Twilio signature (when enabled), ignore if the check-in's `run_id` ≠ current run.

### 7.4 Orientation parsing (`orientation.py`)

Deterministic dictionary first; the LLM fallback is optional and only maps a transcript to `{"weekday": 0-6 | null}`.

| Day | Kannada | Hindi | English / transliterations |
|---|---|---|---|
| Mon | ಸೋಮವಾರ | सोमवार | monday, somavara, somvar |
| Tue | ಮಂಗಳವಾರ | मंगलवार | tuesday, mangalavara, mangalvar |
| Wed | ಬುಧವಾರ | बुधवार | wednesday, budhavara, budhvar |
| Thu | ಗುರುವಾರ | गुरुवार, बृहस्पतिवार | thursday, guruvara, guruvar |
| Fri | ಶುಕ್ರವಾರ | शुक्रवार | friday, shukravara, shukravar |
| Sat | ಶನಿವಾರ | शनिवार | saturday, shanivara, shanivar |
| Sun | ಭಾನುವಾರ | रविवार, इतवार | sunday, bhanuvara, ravivar, itvar |

`score_orientation`: `None`/empty transcript → `"none"`; no weekday found → `"uncertain"`; weekday == scenario today → `"correct"`; else `"wrong"`. If more than one distinct weekday is found → `"uncertain"`.

### 7.5 Seed data (`seed/seed.py`, deterministic with `random.seed(47)`)

- Ward label: **"Ward 47 · demo ward"** (fictional). Coordinates scattered within a ~2 km box of a residential area of Bengaluru.
- 400 simulated elders (`is_simulated=True`, `phone=None`): ages 60–92 skewed to 65–80; ~25 % live alone; languages kn 55 %, ta 15 %, te 10 %, ur 10 %, hi 10 %; roofs sheet 25 %, tile 20 %, concrete 45 %, top_floor 10 %; ~85 % have a fan; ~35 % heat-sensitive meds; ~8 % hearing difficulty; ~4 % cognitive flag; ~40 % have a neighbour on file. Plausible names from per-language given-name pools plus an initial ("Lakshmi N.", "Abdul S."). No real people's names or phone numbers.
- Demo persona **Kamala R.**, 74, lives alone, sheet roof, heat-sensitive meds, has fan, Kannada, code word `mallige`, **no neighbour on file**, `phone=KAMALA_PHONE`, `is_simulated=False`.
- 6 volunteers (5 simulated + "Priya", token `VOLUNTEER_DEMO_TOKEN`, role volunteer) and 2 ASHA workers.

`SimulatedCaller` (for `is_simulated` elders in a round): resolves each check-in over ~40 scenario minutes with outcome mix ≈ GREEN 86 %, AMBER 6 %, needs_support 3 %, UNREACHED-then-answers 4 %, RED 1 %. All its events carry `simulated=True` and `actor="sim"`. Simulated RED/support cases are auto-accepted by a simulated volunteer after a random 3–12 scenario minutes (so the board looks alive) — **but never the demo persona's case**.

---

## 8. Design rules (this is what makes it not look like AI slop)

**Feel:** a calm, dense civic operations console — like an airport departures board. Not a startup landing page.

**Tokens (`styles/tokens.css`), light mode only** (projectors wash out dark themes):
```
--paper:#FAFAF7; --surface:#FFFFFF; --line:#E4E2DC; --ink:#1C1C1A; --muted:#6B6A64;
--ok:#2E7D4F;     --ok-bg:#E8F3EC;
--watch:#A8640F;  --watch-bg:#FBF0DD;      (AMBER)
--support:#2B6CB0;--support-bg:#E6F0FA;
--alert:#B83A26;  --alert-bg:#FBE9E5;      (RED)
--heat:#C2410C;   (weather/heat indicators only)
--radius:6px;
```
- **Type:** Public Sans (UI) + IBM Plex Mono (all timestamps, timers, counts, rule IDs). Two weights only (400, 500/600). Sentence case everywhere.
- **Colour only carries meaning.** Green/amber/blue/red are statuses. Everything else is ink on paper. No gradients, shadows, glassmorphism, glow, emoji, or decorative illustrations.
- **Layout target:** 1280×800 projector. No horizontal scroll.
- **Provenance everywhere:** timestamps on every row; "via keypad" / "via voice"; "Rule R3 · Symptoms and no water"; "Escalated by E1 · No answer ×2"; play button for the call recording; audit timeline per case.
- **Designed states:** loading skeletons (not spinners everywhere), empty states ("No one needs attention right now"), errors ("Call failed · number unreachable", "Transcription unclear → AMBER", "Volunteer hasn't accepted · 11 min").
- **Honesty badges:** `Demo time ×60 · 2 attempts (production: 3)` and a small `simulated` tag on simulated residents and simulated notifications.
- **Copy:** plain, verb-first, no exclamation marks, no "AI-powered", no "revolutionising". Never promise response times.

### Screens

**Dashboard (`/`)** — top to bottom:
1. Top bar: `Neralu` wordmark · `Ward 47 · demo ward` · WeatherBlock (temp, humidity, heat index, night min, level chip "Severe for vulnerable") · scenario clock · DemoClockBadge · current round.
2. CountCards: Registered · Due today · Fine · Follow-up · Escalated · Unreached now (mono numbers, update live).
3. Two columns: **AttentionList** (left, ~60 %) sorted RED by waiting time desc → overdue first → AMBER → support; each row: name, age, one-line why (risk factors), status pill, `WaitingTimer` in scenario minutes, tier. **WardMap** (right) with dots coloured by latest status; clicking a dot or row opens the drawer.
4. **CaseDrawer** (right-side panel): profile, RiskBreakdown ("Why Neralu called today": factor list + threshold vs today's heat index), call attempts with statuses and timestamps, AnswerTable, transcript + RecordingPlayer, the rule that fired, EventTimeline (live), resolution.
5. **DemoControls** (collapsible, bottom-right, small): heat presets ("Normal day 31 °C / 45 %", "Heatwave 38 °C / 40 %, night 27 °C"), "Start round 1", "Start round 2", "Reset run". Visually quiet; labelled "Demo controls".

**Volunteer (`/volunteer?token=`)** — mobile 390 px:
- First screen: "Go on duty" button (unlocks audio + vibration via a user gesture).
- New case card: level pill, `RED · waiting 3 min`, name, age, why ("No answer ×2", risk factors), approximate distance. **Address hidden.** Buttons: `Accept` / `Can't go`.
- After accept (409 → "Someone else accepted this case"): full address, `Call Kamala` (`tel:` link), `Open in Maps`, then resolution buttons: `Safe — confirmed in person`, `Needs support — delivered water/ORS`, `Called 108`, `Couldn't reach — escalate`, optional note.
- New case → `navigator.vibrate` + short sound.

**Register (`/register`)** — mobile family form: elder name, age, phone, language, lives alone, roof type, fan, heat-sensitive medicines, hearing difficulty, memory difficulty, neighbour phone (optional), family name + phone, code word (choose from the 10, with a play button for each), plain-language consent checkbox ("I have their permission. Neralu stores only what is needed to check on them and never shares it."). On submit → elder appears on the dashboard live (`elder_registered`). No fake OTP screen.

---

## 9. Build order

Times assume ~16 working hours. **The critical path is Tasks 1–6. Frontend (Task 8) starts in parallel at hour 1 against mock JSON matching §6.3.**

### Task 0 — Scaffold (0:00–0:45)
Files: `backend/pyproject.toml`, `app/main.py`, `app/config.py`, `app/db.py`, `.env.example`, `frontend/` via Vite (React + TS + Tailwind), `CLAUDE.md`.
Done when: `uvicorn app.main:app` serves `GET /health → {"ok": true}`; `pytest` runs (0 tests); ngrok URL reaches `/health`; frontend dev server shows a blank page with tokens loaded.

### Task 1 — Rules engine, TDD (0:45–1:30) *(pure, no I/O)*
Files: `app/rules.py`, `tests/test_rules.py`.
Tests (one per rule, plus):
- `test_r0_all_none_is_unreached` → `UNREACHED`, `R0`
- `test_help_overrides_everything` → `Signals(water="yes", symptoms="no", room_hot="no", fan_working="yes", orientation="correct", self_report="help")` → `RED`, `R1`
- `test_symptoms_and_confusion_is_red` → `R2`; `test_symptoms_and_no_water_is_red` → `R3`
- `test_self_report_ok_does_not_override_symptoms` → symptoms yes, self_report ok → `AMBER`, `R4`
- `test_hot_room_broken_fan_sets_support_independently` → all fine + room_hot yes + fan no → `GREEN`, `needs_support=True`
- `test_orientation_none_is_amber` → `R7`; `test_two_missing_is_amber` → `R8`
Done when: all pass.

### Task 2 — Risk engine + orientation, TDD (1:30–2:15) *(pure)*
Files: `app/risk.py`, `app/orientation.py`, tests.
Tests: heat index matches a known reference pair within ±0.5 °C (e.g. 35 °C / 50 % → ≈ 41.7 °C, i.e. 95 °F → ≈ 107 °F; confirm against the NOAA heat index calculator before asserting); Kamala's score is **70** with breakdown `[("Age 74",20),("Lives alone",20),("Sheet roof",15),("Heat-sensitive medicines",15)]` (she has a fan, so no fan points); threshold 33.0 at night_min 24, 32.0 at night_min 27; `calls_due` returns 0/1/2 at boundaries; `parse_weekday("ಇವತ್ತು ಗುರುವಾರ")==3`; `score_orientation("today is monday and tuesday", d)=="uncertain"`; empty → `"none"`.
Done when: all pass.

### Task 3 — Models, events, SSE, clock (2:15–3:15)
Files: `app/models.py`, `app/events.py`, `app/clock.py`, `routes/stream.py`, `routes/summary.py`.
Tests: `DemoClock(speed=60).real_seconds(15) == 15.0`; `log_event` persists and is published to a subscriber; events from a stale `run_id` are not returned by queries.
Done when: `curl -N /api/stream` prints an event when a test endpoint logs one.

### Task 4 — **Milestone: the phone rings** (3:15–4:45)
Files: `app/telephony.py`, `routes/voice.py` (answer + one gather + status only), `calls.py` (`start_round` for real-phone elders only), minimal seed with Kamala, `static/audio/kn/` (temporary English recordings are fine until the Kannada ones arrive).
Done when: `POST /api/sim/round {"round_no":1}` rings `KAMALA_PHONE`, greeting + code word + safety line play, pressing 2 on the water question stores `"no"`, status callback marks the call ended, events stream for each step.

### Task 5 — Full call flow + classification (4:45–6:45)
Files: complete `routes/voice.py`, `app/transcribe.py`, `routes/recordings.py`, `calls.handle_call_ended`.
Tests (`test_voice_flow.py`, Twilio form posts simulated with the TestClient, signature validation disabled in tests): full happy path → GREEN; timeout on every gather → R0 UNREACHED; answered then hung up after greeting → UNREACHED; duplicate `completed` callback processed once; STT timeout → orientation `"uncertain"` → AMBER (R7); webhook for an old `run_id` ignored.
Done when: from a real phone you can produce GREEN, AMBER, RED and UNREACHED, and the recording plays through `/api/recordings/{id}`.

### Task 6 — Escalation engine + scheduler (6:45–8:00)
Files: `app/escalation.py`, `app/notify.py`, scheduler loop started in `main.py` (asyncio task, `tick()` every 1 s real), retries in `calls.py`.
Tests (`test_escalation.py`, inject a fake clock): E1 unanswered ×MAX_ATTEMPTS → RED case at volunteer tier with `tier_skipped` when no neighbour; E3 AMBER then AMBER → RED; E5 no acceptance → volunteer → asha → overdue, and **no event ever mentions calling 108 by the system**; concurrent `accept_case` → exactly one succeeds, the other raises `AlreadyAccepted`; `not_found_escalate` reopens at next tier.
Done when: Kamala ignoring two calls produces a RED case on the volunteer tier with a live waiting timer, without anyone touching the backend.

### Task 7 — Simulation, seed, reset (8:00–8:45)
Files: `seed/seed.py`, `seed/names.py`, `app/sim_caller.py`, `routes/sim.py`, `routes/elders.py`, `routes/cases.py`.
Done when: `POST /api/sim/reset` → 401 elders + volunteers; `POST /api/sim/heat` (heatwave preset) → due counts update; `POST /api/sim/round` → counts tick up over ~40 s real at ×60; Kamala's real call runs alongside; reset during a live call leaves no orphaned updates.

### Task 8 — Dashboard (parallel from 1:00 on mocks; integrate 8:45–10:30)
Files: all dashboard components in §4.
Done when: with the backend running, a judge can watch Kamala's case go from "Calling · attempt 1" → "No answer ×2" → RED at volunteer tier with a waiting timer, purely via SSE; the drawer shows risk breakdown, answers, recording, rule and timeline; SSE reconnects after a network drop and refetches state.

### Task 9 — Volunteer page (10:30–11:15)
Done when: on a real phone, Priya goes on duty, receives Kamala's case with vibration, accepts (address appears only now), resolves "Safe — confirmed in person", and the dashboard shows the case resolved with the full timeline. A second device accepting the same case sees "Someone else accepted this case".

### Task 10 — Register page (11:15–11:45)
Done when: registering an elder from a phone shows them on the dashboard within a second with their risk score and a `elder_registered` event.

### ── FEATURE FREEZE (≈ 11:45) ── nothing new after this line

### Task 11 — Polish pass (11:45–13:30)
Checklist: every state in §8 designed; no "TODO", "test", lorem or console errors; numbers in mono; projector check at 1280×800; copy pass against §8; simulated tags visible; favicon and page title "Neralu · Ward 47".

### Task 12 — Rehearsal (13:30–16:00)
Run the full demo five times on the demo laptop, demo phones and hotspot. Record a 40-second backup video of a clean run. Prepare the reset script. Two clean consecutive runs under 8 minutes.

### Cut order if time runs out
1. WardMap → list only. 2. Orientation transcription → replace with a keypad question ("Press the number for today: 1 for Monday…") and keep scoring. 3. Register page → pre-register. 4. Simulated residents' animation.
**Never cut:** the real call, the escalation, the volunteer accepting live.

---

## 10. Review focus (failure modes most likely to bite during the demo)

1. **A picked-up call with no input** (operator message, accidental answer) must be UNREACHED, never GREEN → covered in Task 5 tests.
2. **Duplicate or out-of-order Twilio callbacks** must not double-classify or double-open cases → idempotency test in Task 5.
3. **Two volunteers accepting at once** → atomic update, 409 for the loser → Task 6 test.
4. **Reset during a live call** → stale `run_id` webhooks ignored → Task 5 and Task 7.
5. **STT slow or down** → orientation `"uncertain"` within `STT_TIMEOUT_S`, never blocks the call or the classification → Task 5 test.
6. SSE drop on hall Wi-Fi → client auto-reconnects and refetches `/api/summary`, `/api/elders`, `/api/cases` → Task 8.

---

## 11. Demo script (what the build must support)

1. **Open on the dashboard**, normal day. "Bengaluru, Thursday, 10:55."
2. Demo controls → **Heatwave preset**. Weather block turns "Severe for vulnerable"; "Due today" jumps; open Kamala's drawer → "Why Neralu called today" (score 70, threshold 32 °C because tonight stays at 27 °C, vs today's heat index ≈ 43 °C).
3. **Start round 1.** Counts start ticking (simulated residents). Hand the team phone to a judge: *"You're Kamala. You're 74, you live alone, and today crossed your heat-risk threshold."*
4. Phone rings → Kannada greeting, code word, safety line. **Judge doesn't answer** (or answers and stays silent).
5. Dashboard: attempt 1 failed → retry → attempt 2 failed → **RED · No answer ×2** → "No neighbour on file → skipped" → volunteer tier alerted, waiting timer running.
6. Teammate's phone (Priya) vibrates → **Accept** → address revealed → **Safe — confirmed in person**. Dashboard: resolved, full audit timeline.
7. Optional: second run where the judge answers and presses "dizzy" + "no water" → R3 RED in seconds.
8. Close on the event timeline and the line: *"We don't just warn vulnerable people. We make sure someone knows they're safe."*

## 12. Demo-day checklist

- [ ] Twilio account upgraded; test call to every demo phone the night before
- [ ] Kannada audio recorded by a native speaker and played to an elderly listener once
- [ ] Both demo phones charged, ringer on, not on silent / DND
- [ ] Backend awake (warm up 5 min before); phone hotspot tested; not relying on hall Wi-Fi
- [ ] `POST /api/sim/reset` before each run
- [ ] Backup video saved offline on the laptop desktop
- [ ] Prepared answer for "what's simulated?" (§2)

---

## 13. Out of scope for this build (mention as roadmap, do not implement)

1600-series government caller ID (needs a municipal partner) · WhatsApp/SMS notifications (Indian SMS needs DLT registration) · OTP verification and real auth · caregiver-route calls for cognitively impaired elders · Bhashini TTS for dynamic names · multi-ward/multi-city · floods, cold waves and air-quality triggers · paid family tier · DPDP-compliant data deletion workflows beyond a delete endpoint.

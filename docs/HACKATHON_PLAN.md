# Neralu · Hack4SDG finale plan (24–25 Oct 2026)

Judged on: **originality · SDG impact · feasibility · execution · responsible technology · presentation.**
Rounds: R1 judging 4–7 PM (idea and approach) · R2 overnight build 8:30 PM–5 AM · R3 final 7:30–8:30 AM.

Rules for the next 24 hours:
1. **Never break the call flow.** Every feature ships behind the existing flow, with tests, one at a time.
2. **Commit and push after each feature.** `git pull` before starting anything.
3. **Feature freeze at 4:00 AM.** After that: fixes, rehearsal, backup video only.
4. **Honest labels stay.** Anything simulated is marked simulated; no invented statistics.
5. **Credit everything** (guidebook p.5): libraries, APIs, AI tools, pre-existing code.

---

## Part 1 · What is already done

### Works end to end, verified with real phones
- **Risk engine:** personal vulnerability score and personal heat threshold per resident (not city-wide).
- **Real phone calls** (Twilio) to any phone: a language menu (1 Kannada, 2 Hindi, 3 English), a family
  code word, the safety line, four keypad questions, a day check (keypad or spoken), and a help question.
- **Voices:** Kannada, Hindi and Indian English prompts (Sarvam), each ~25 clips. *Kannada needs native review.*
- **Fixed rules decide, not AI:** GREEN / AMBER / RED / UNREACHED, plus "needs support". A picked-up call
  with no answers is never "fine". Plain-English explanation for every rule.
- **Escalation:** retries; neighbour → volunteer → ASHA worker → ward officer, with timers; follow-up
  calls for AMBER. Never calls 108 automatically.
- **Volunteer page:** alert with vibration, accept (address revealed only then), call or map, record
  the outcome, family told. Nearest responders alerted first.
- **Ward console:** live updates, live call spotlight, closed-loop tracker, resident story, 3D ward
  and street map, heat chart, round progress, activity feed, light/dark mode.
- **Family registration:** five steps, live heat-risk preview, consent, registration number.
- **Story page:** interactive heat explorer, 3D ward, published rule table.
- **Also working:** browser-phone fallback (no telecom), live Bengaluru forecast (Open-Meteo),
  optional real family SMS, right to erasure, round summaries API, preflight check script,
  one-command start, SETUP.md, 139 backend tests.

### Known weaknesses (what judges can poke at)
| Weakness | Hurts |
|---|---|
| Runs only on one laptop through ngrok (B1 makes it one command + live checks; a cloud host would remove it) | feasibility |
| Everything is a demo run: ×60 clock, resets, no "real day" mode | feasibility |
| No impact pathway on screen (what changes, for whom, how measured) | SDG impact |
| Families hear nothing back after registering | impact, responsible tech |
| Erasure protected only by a guessable number | responsible tech |
| Downsides and safeguards not written anywhere | responsible tech |
| No credits / pre-existing-work section; no pitch deck or script | presentation, rules |
| Twilio trial: trial notice on calls, verified numbers only, recording unavailable | execution |

---

## Part 2 · Build order

Each item: **why** (criterion) · **what** · **done when** · estimate · risk and fallback.
The order is by value to judges divided by risk. Stop wherever time runs out; everything above
the line still stands on its own.

### Before Round 1 (now → 3:30 PM): no new features, make what exists bulletproof

**B1 · Stage-proof setup** · execution · 45 min · **DONE** (`scripts/stage.ps1`, console status strip)
- One script on the demo laptop: builds the site, starts the server **and ngrok**, prints every link
  (console, Priya's page via the ngrok address so it works on any network), runs preflight.
- A **System status** strip on the console: Twilio, ngrok, Sarvam, audio, scheduler: green or red.
- *Done when:* a cold laptop reaches "all green" with one command and Priya's link works on hotspot.
- *Fallback:* browser-phone mode (`TELEPHONY_MODE=browser`) if Twilio or the network fails on stage.

**B2 · Credits and honest disclosure** · presentation, rules · 30 min
- README: team, SDG, problem, solution, tech stack, how to run, **credits** (libraries, APIs, AI tools
  including Claude Code and Sarvam voices, map tiles), and **what existed before the finale**.
- *Done when:* README covers every item on guidebook p.10 and p.5.

**B3 · Round 1 pitch and demo script** · presentation · 60 min
- A 30-second hook, 3-minute and 7-minute versions (time limit announced at the venue), the live
  demo path, and answers to the hard questions ("what is simulated", "why not an app", "cost",
  "what if the AI is wrong", "privacy").
- *Done when:* two timed run-throughs without notes.

### Round 2 (overnight, 8:30 PM → 4:00 AM freeze), in this order

**R2-1 · Pilot mode: Neralu runs a real day by itself** · feasibility (biggest gap) · 2 h · **done**
- A switch from "demo run" to **pilot mode**: real clock (no ×60), today's real forecast fetched each
  morning, calls scheduled automatically at 11:00 and 15:00 for everyone over their threshold,
  data kept across restarts (no reset).
- *Why it matters:* answers "does it work outside the demo?" with "it is running right now."
- *Done when:* with pilot mode on, the scheduler places the day's calls without anyone pressing a button.
- *Risk:* low; it reuses the same rounds and rules. Demo mode stays the default for the stage.
- *Built:* `RUN_MODE=pilot` (or `scripts\stage.ps1 -Pilot`). Automatic rounds only on today's real
  forecast (retried every 15 min), none after 18:00, a late start runs only the latest due round,
  a restart resumes the day, each new day carries over registered people. Top bar and status strip
  show the schedule. Tests: `backend/tests/test_pilot.py`.

**R2-2 · What-if simulator with volunteer workload (the wow moment)** · originality, feasibility · 2.5 h · **done**
- On the console: drag temperature, humidity and night minimum (or load tomorrow's real forecast) and
  watch, using the same risk rules as live calls: residents over their threshold, calls in each round,
  expected follow-ups and escalations, **volunteer workload and shortfall**
  ("At 41 °C: 214 calls, ~9 cases needing a person, 6 volunteers on duty → 3 short between 11:00 and 16:00").
- Baseline vs scenario side by side. Every simulated input and output is labelled simulated.
- *Why it matters:* turns a heat forecast into a ward work plan before the heat arrives.
- *Done when:* moving the slider updates the numbers instantly and matches what a real round then does.
- *Built:* console top bar → **Plan ahead**. Sliders for temperature, humidity, night minimum and
  responders on duty, or tomorrow's real forecast; now against scenario; responders per round with the
  shortfall. Who is called comes from the same function a real round uses (a test checks they match);
  outcomes are the simulated answer mix through the same rules, labelled simulated. `GET /api/whatif`,
  `backend/app/whatif.py`, tests in `backend/tests/test_whatif.py`.

**R2-3 · Volunteer availability and live reassignment** · execution, feasibility · 2 h · **done**
- Volunteers toggle **available / not available**. "Can't go" now tells the system: the case is offered
  at once to the next nearest available volunteer, and the console shows who holds each case and each
  volunteer's current load.
- *Demo moment:* Priya taps "Can't go", and within seconds Ravi's phone buzzes with the case.
- *Done when:* tests cover decline → next nearest, and no case is ever left with nobody alerted.
- *Built:* "Go on duty" / "Go off duty" and "Can't go" now reach the server. A decline goes at once to
  the next nearest free responder ("Priya can't go · now asking Ravi K., 0.5 km away"); going off duty
  hands pending alerts on; if nobody is left at a tier the case moves up, then to the ward officer.
  The declined case stays at the bottom of the volunteer's list with **I can go after all**.
  Free responders are asked before busy ones. Console top bar → **Responders**: who is on duty, on a
  visit, being asked, or said can't go. Simulated volunteers now finish visits (20–45 min) instead of
  holding cases forever. Tests: `backend/tests/test_reassign.py` (including a randomized check that
  an open case always has someone asked or is with the officer).

**R2-4 · Impact panel: broadcast vs Neralu** · SDG impact, presentation · 1.5 h · **done**
- Same heatwave, two columns. Broadcast: "401 alerted · 0 confirmed safe · unknown who needs help".
  Neralu, for example from one demo round: "387 called · 374 confirmed safe · 7 needed a person ·
  median 8 min to a volunteer accepting". Always computed from the round's data, never typed in.
- Pilot metrics we would measure: % confirmed safe by noon, time from RED to a person at the door,
  repeat-risk residents, volunteer load.
- *Done when:* the panel updates live during a round and every number traces to the event log.
- *Built:* console top bar → **Impact**. Broadcast vs Neralu (reached, confirmed safe, known to need a
  person, reached at the door), where everyone called stands now, median minutes to accept and to a
  recorded visit, and the four pilot measures. "How each number is counted" lists the rule for every
  figure. A heatwave demo round ends near: 387 called · 386 confirmed safe · 28 needed a person ·
  27 reached at the door · 96 % confirmed safe by 12:00. `GET /api/impact`, `backend/app/impact.py`,
  tests in `backend/tests/test_impact.py`.

**R2-5 · Family status link** · impact, responsible tech · 1.5 h · **done**
- Registration gives the family a private link: "**Amma answered at 11:02 · all fine**" / "a
  volunteer is on the way" / "checked in person at 11:40". Optional real SMS (already built, off by default).
- *Done when:* the family link updates live through a call and an escalation; it shows no data about
  anyone else.
- *Built:* two versions were built in parallel; the merged one is Gourab's (PR #19): a random link
  (`/family#…`, shown once at registration, only its hash stored, the secret sent in a header so it
  stays out of logs), replace or turn off from the page, and Demo controls open Kamala's family view.
  Kept from the other version: erasure with the erasure code from the family page.
  One plain status line plus today's timeline, polled every 5 s for this person only (never the
  ward's live stream); no address, code word or phone numbers; the link dies with an erasure. With
  FAMILY_SMS=twilio the family's SMS carries the link. Tests: `backend/tests/test_family.py`.

**R2-6 · Responsible-tech hardening** · responsible tech · 1.5 h · **done**
- Erasure with a random secret shown once to the family (replaces the guessable number).
- Call recordings deleted automatically after 7 days; transcripts kept only as the day word.
- A **Responsible by design** page: what we store, who sees what, consent, DPDP Act alignment,
  accessibility (any phone, keypad, three languages, slow pace), known risks (false reassurance,
  digital exclusion, scam impersonation, volunteer safety) and the mitigation for each.
- *Done when:* tests cover the secret and the retention job; the page is linked from the console and story.
- *Built:* erasure code (XXXX-XXXX, unambiguous letters, stored only as a hash) shown once at
  registration; delete from the confirmation screen or the family status link. Hourly retention sweep
  deletes recordings older than `RECORDING_RETENTION_DAYS` (7) in every run, plus stray files; the
  spoken day is stored only as the weekday word. `/responsible` page linked from the console top bar,
  the story page (nav and footer), registration consent and the family page. Tests:
  `backend/tests/test_erase.py`, `backend/tests/test_retention.py`.

**R2-7 · Command-center polish** · execution, presentation · 1 h
- Filters on the attention list: risk level, call status, assigned volunteer; an "assigned to" column.
- Each risk factor shows its **data source** (family registration vs simulated resident).
- A **case record** the ward office can print or save: trigger, calls, answers, rule, escalation,
  acceptance, closure, family told.
- *Built:* filters for heat risk, call status and assignee (with "Nobody yet"), and the accepting
  volunteer's name on each row and in the case drawer. Each risk factor is tagged family form / demo
  persona / simulated, with the heat source under it. `GET /api/cases/{id}/record` and the
  `/ward/record/<id>` page (always light, prints cleanly, linked from the drawer for open and closed
  cases); messages are labelled by recipient (family or neighbour) and by channel (SMS or simulated).
  Tests: `backend/tests/test_record.py`.

**Stretch, only if everything above is solid**
- **Missed-call check-in** · originality · 1.5 h: an elder or family gives a missed call to the Neralu
  number and Neralu calls back at once. Familiar in India, costs nothing. Twilio trial inbound carries the
  trial notice: test early, drop if it misbehaves.
- **Public deployment** *(parallel, needs a hosting account from the team)* · feasibility · 1–2 h: one
  server on a cloud host with a fixed address, no laptop or ngrok. The laptop setup stays as the fallback.

### Considered and not building (and why)
| Idea | Decision |
|---|---|
| Cooling-centre / water-point map | No verified local data; invented locations would break our honesty rule |
| AI incident briefing for officers | Optional only: needs an API key, and the rule-based attention list already answers "what needs action"; an LLM must never decide outcomes |
| Adaptive voice checks | Already built: three languages, language menu, one repeat on silence, keypad fallback, unclear answers escalate |
| Heatwave digital twin | Merged into R2-2 (same idea, honest name: a what-if simulator) |
| New command center / escalation engine | Already built and verified with real phones; only R2-7 polish needed |

### Round 3 (4:00 AM → 7:30 AM): freeze and rehearse
- 4:00 freeze · 4:00–5:00 fix anything red on the status strip · two full rehearsals on the demo
  laptop, hotspot and both phones · record the 40-second backup video · update README and deck with
  what was built overnight.

---

## Part 3 · Ownership (fill in)

| Track | Owner |
|---|---|
| Backend: pilot mode, simulator engine, reassignment, hardening, deployment (with Claude Code) | Priyanshu |
| Console UI: simulator, impact panel, filters, case record; family status page | Gourab |
| Pitch, deck, demo script, Q&A, credits | |
| Testing on real phones, rehearsal, backup video | |

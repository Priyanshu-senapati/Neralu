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
| Runs only on one laptop through ngrok; servers die when memory is low | execution, feasibility |
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

**B1 · Stage-proof setup** · execution · 45 min
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

**R2-1 · Pilot mode: Neralu runs a real day by itself** · feasibility (biggest gap) · 2 h
- A switch from "demo run" to **pilot mode**: real clock (no ×60), today's real forecast fetched each
  morning, calls scheduled automatically at 11:00 and 15:00 for everyone over their threshold,
  data kept across restarts (no reset).
- *Why it matters:* answers "does it work outside the demo?" with "it is running right now."
- *Done when:* with pilot mode on, the scheduler places the day's calls without anyone pressing a button.
- *Risk:* low; it reuses the same rounds and rules. Demo mode stays the default for the stage.

**R2-2 · Tomorrow's outlook and staffing** · originality, feasibility · 1.5 h
- From tomorrow's forecast: "**214 residents cross their own threshold tomorrow; 31 are high risk
  with no neighbour. Put at least 6 volunteers on duty between 11:00 and 16:00.**"
- *Why it matters:* turns a heat alert into a ward work plan. No broadcast system does this.
- *Done when:* the console shows tomorrow's numbers from the real forecast, with the simulated-residents label.

**R2-3 · Impact panel: broadcast vs Neralu** · SDG impact, presentation · 2 h
- Same heatwave, two columns. Broadcast: "401 alerted · 0 confirmed safe · unknown who needs help".
  Neralu, for example from one demo round: "387 called · 374 confirmed safe · 7 needed a person ·
  median 8 min to a volunteer accepting". Always computed from the round's data, never typed in.
- Pilot metrics we would measure: % confirmed safe by noon, time from RED to a person at the door,
  repeat-risk residents, volunteer load.
- *Done when:* the panel updates live during a round and every number traces to the event log.

**R2-4 · Family status link** · impact, responsible tech · 1.5 h
- Registration gives the family a private link: "**Amma answered at 11:02 · all fine**" / "a
  volunteer is on the way" / "checked in person at 11:40". Optional real SMS (already built, off by default).
- *Done when:* the family link updates live through a call and an escalation; it shows no data about
  anyone else.

**R2-5 · Responsible-tech hardening** · responsible tech · 1.5 h
- Erasure with a random secret shown once to the family (replaces the guessable number).
- Call recordings deleted automatically after 7 days; transcripts kept only as the day word.
- A **Responsible by design** page: what we store, who sees what, consent, DPDP Act alignment,
  accessibility (any phone, keypad, three languages, slow pace), known risks (false reassurance,
  digital exclusion, scam impersonation, volunteer safety) and the mitigation for each.
- *Done when:* tests cover the secret and the retention job; the page is linked from the console and story.

**R2-6 · Missed-call check-in** *(stretch)* · originality · 1.5 h
- An elder or family can **give a missed call** to the Neralu number: Neralu calls back at once and runs
  the check. Pressing 2 for help on any call escalates immediately. Familiar in India, costs the elder nothing.
- *Risk:* Twilio trial inbound calls carry the trial notice; test early, drop if it misbehaves.

**R2-7 · Public deployment** *(parallel, needs a hosting account from the team)* · feasibility, execution · 1–2 h
- Host the single server on a cloud service with a fixed public address: no laptop, no ngrok, judges
  can open it themselves. The laptop setup stays as the fallback.
- *Needs:* someone creates the hosting account (we cannot create accounts for you).

### Round 3 (4:00 AM → 7:30 AM): freeze and rehearse
- 4:00 freeze · 4:00–5:00 fix anything red on the status strip · two full rehearsals on the demo
  laptop, hotspot and both phones · record the 40-second backup video · update README and deck with
  what was built overnight.

---

## Part 3 · Ownership (fill in)

| Track | Owner |
|---|---|
| Backend, pilot mode, outlook, reliability, deployment (with Claude Code) | Priyanshu |
| Console UI for impact panel, outlook, status strip; family status page | Gourab |
| Pitch, deck, demo script, Q&A, credits | |
| Testing on real phones, rehearsal, backup video | |

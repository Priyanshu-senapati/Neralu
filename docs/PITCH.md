# Neralu · pitch and demo script (Hack4SDG finale)

The organisers announce the time limit at the venue, so there are three cuts: a 30-second hook, a
3-minute pitch and a 7-minute pitch with the live demo. Speak the **bold** lines; the rest is guidance.
Every number here is either from a cited source (end of this file) or produced live by Neralu.

Roles: **Presenter** (speaks, drives the console) · **Kamala** (a judge holds the demo phone) ·
**Priya** (a teammate with the volunteer page open on a second phone).

---

## 1. The 30-second hook (say it word for word)

> **"In the 2024 summer India recorded over forty thousand suspected heatstroke cases. The people most
> at risk are older people who live alone, and a heat alert only *tells* them. Nobody *checks*.
> Neralu does. When the heat crosses one person's own threshold, Neralu phones them on whatever phone
> they have, in their language, asks five keypad questions and what day it is, and if anything is
> wrong, or nobody answers, a person nearby is sent to their door. Heat warnings tell a city what's
> coming. Neralu checks who's safe."**

---

## 2. The 3-minute pitch (Round 1: idea and approach)

**0:00 – 0:30 · Problem.** The hook above.

**0:30 – 1:15 · Why it's different (originality).**
> **"Three things no heat alert does. One: risk is personal. Kamala is 74, lives alone under a sheet roof
> and takes medicines that make heat harder, so her threshold is 32 degrees, not the city's. Two: we don't send
> an app, we call. Any phone, Kannada, Hindi or English, keypad answers, and a code word her family
> chose so she knows it isn't a scam call. Three: the call isn't the end. A fixed rule decides, and if
> it's red, a neighbour, then the nearest volunteer, then an ASHA worker is asked to go, each with a timer."**

**1:15 – 2:00 · Show it (one screen).** Ward console: heatwave preset, Kamala's profile ("why Neralu
calls Kamala"), then the closed loop on a finished case.
> **"Here is the whole loop: Neralu called, the rules decided, a volunteer accepted, she was checked in
> person, her son was told. Every step is recorded."**

**2:00 – 2:30 · Responsible by design.**
> **"AI never decides who is safe. Published rules do, and anything unclear is followed up, never
> assumed fine. A picked-up call with no answers counts as not reached. Addresses are hidden until a
> volunteer accepts. Neralu never calls an ambulance; a human decides that. And we label everything
> simulated in this demo."**

**2:30 – 3:00 · Impact and ask.**
> **"SDG 11.5, fewer disaster deaths among the vulnerable; 3.d early warning; 13.1 resilience. The method,
> call, check, escalate, already works abroad, in Seoul and in Australia's Red Cross heat check-ins.
> Neralu adapts it for India: basic phones, Indian languages, a scam-wary phone culture, and the
> registries that already exist, ASHA lists, RWAs, families. Our ask is one ward, one summer, measured by
> how many vulnerable residents are confirmed safe by noon and how fast a person reaches a red case."**

---

## 3. The 7-minute version (with the live call)

Same story, with the live demo between 1:15 and 5:30.

**Before you start (2 minutes before your slot):**
1. `powershell -ExecutionPolicy Bypass -File scripts\stage.ps1 -SkipBuild` → it must say **READY**.
2. Console open at http://localhost:8000/ward, light mode if the projector is weak, other tabs closed.
3. Demo controls → **Reset run** → Confirm. Weather stays "Normal day".
4. Priya's phone: the ngrok volunteer link (printed by the script) → Visit Site → **Go on duty**.
5. Kamala's phone: ringer on, not silent, not Do Not Disturb, charged.

**1:15 · Normal day.** Point at the heat index (31.7 °C) and "1 of 401 residents over their own threshold".
> **"On a normal day almost nobody needs a call."**

**1:45 · The heatwave.** Demo controls → **Heatwave 38 °C**.
> **"Heat index 43. Severe for vulnerable residents. Now everyone in this ward has crossed their own
> threshold."** Open Kamala's profile: score 70, threshold 32 °C, the four reasons.

**2:15 · Plan ahead (optional, 30 s).** Top bar → **Plan ahead**. Drag to 38 °C, 40 %, night 27 °C
(heat index 43), then responders on duty down to 5:
> **"Before the heat arrives, Neralu turns the forecast into a work plan: 774 calls, about 40 people
> needing a visit, and with five responders we're three short from eleven to one. The officer calls in
> help the day before."**
Close it.

**2:30 · The call.** Demo controls → **Start round 1**. Hand the phone to a judge:
> **"You're Kamala. You're 74 and you live alone."**
The live call spotlight opens. The judge answers, presses any key after the trial notice, then:
- **Path A, the answered call (default):** press **1** for Kannada (or 3 for English), then answer
  freely. Narrate the spotlight: each key press appears as it lands; the decision and the rule appear the
  moment the call ends. Suggest **2 (no water)** and **1 (dizzy)** to show a RED (Rule R3).
- **Path B, nobody answers:** the judge **declines twice**. "No answer ×2 → RED → escalated by E1."

**4:00 · The human handoff.** Priya's phone buzzes.
> **"Priya is a volunteer 400 metres away. She sees why, but not the address, until she accepts."**
Priya taps **Accept · I'll go**, shows the address, then **Safe, confirmed in person**.
*Optional, 20 s, before accepting:* Priya taps **Can't go**. The console's activity shows
"Priya can't go · now asking …, 0.4 km away"; open **Responders** to show who is free and who is on a visit.
> **"Volunteers have lives. If Priya can't go, the next nearest free person is asked within a second;
> if nobody can, it climbs to the ASHA worker and then the ward officer. A case is never left alone."**
Then Priya taps **I can go after all** (the case stays at the bottom of her list) and the demo carries on.

**4:45 · The loop closes.** Console: the spotlight shows every step ticked. Open the profile:
"What happened to Kamala today", the plain-English record.
> **"From heat alert to a person at her door, and her son told, with every step on record."**

**5:30 · Impact (20 s).** Top bar → **Impact**.
> **"Same heatwave, two columns. A broadcast told 401 people and confirmed no one. Neralu called 387,
> confirmed [read the number] safe, found [n] who needed a person and got someone to [n] of their doors.
> None of these numbers is typed in: each is counted from the log, and the panel says how."**

**5:50 – 7:00 · Responsible design, impact, ask.** As in the 3-minute pitch, then:
> **"What you saw was real: a real call, real keypad answers, real rules, a real volunteer on a real
> phone. What's simulated, the ward's other 400 residents and the weather, is labelled on screen."**

---

## 4. One line per judging criterion (have these ready)

| Criterion | The line |
|---|---|
| Originality | Personal heat thresholds plus a phone call that ends with a person at the door, adapted for basic phones, Indian languages and scam-wary users. |
| SDG relevance and impact | SDG 11.5 / 3.d / 13.1. Pilot measure: % of vulnerable residents confirmed safe by noon, time from RED to a person at the door. |
| Feasibility | Runs today on Twilio and a laptop; needs no app, no smartphone, no new hardware; plugs into ASHA lists, RWAs and family registration. |
| Execution | Every step you saw is live; 207 automated tests; one command starts it and checks itself. |
| Responsible technology | Rules not AI; unclear means follow-up; consent; addresses hidden; never auto-calls 108; right to erasure; everything simulated labelled. |
| Presentation | "Heat warnings tell a city what's coming. Neralu checks who's safe." |

---

## 5. Hard questions, honest answers

**"What's simulated?"** The weather presets (a live Bengaluru forecast is available), the ×60 clock, the
other ~400 residents and their answers, and family notifications. The call, the answers, the rules,
the escalation and the volunteer are real.

**"Isn't this just Seoul's AI welfare calls?"** The method is proven abroad, and we say so. What's new is
the adaptation: personal heat thresholds, keypad phones, three Indian languages with a language menu,
a family code word against scam calls, and escalation through India's existing people: neighbours,
RWA volunteers, ASHA workers.

**"What if the AI gets it wrong?"** AI never decides. It only turns a spoken day into a word, and even then
an unclear answer is treated as a warning sign. The decision is a published rule table with tests.

**"Why a phone call and not an app or WhatsApp?"** The people most at risk often have a basic keypad phone
and may not read. A call works on any phone and needs nothing from them.

**"What does it cost?"** One check is a call of about one minute. At scale this runs on an Indian
telephony provider and the government's Bhashini voice services; we would measure the real per-check
cost in the pilot rather than quote a number we haven't tested.

**"Privacy?"** Families register with consent. We store only what the check needs. The address is shown
only to the volunteer who accepts that case. Families can delete a registration. Recordings would be
kept for days, not months.

**"What if the volunteer doesn't go?"** Every tier has a timer: neighbour, then volunteer, then ASHA
worker, then the ward officer. A case never just sits.

**"Why does the call start with a Twilio message?"** It's a trial account; production would use an
Indian number, ideally the ward office's own.

**"Did you build this here?"** We built it before the finale and say so in the README; the git tag
`pre-finale` marks exactly where finale work begins.

---

## 6. If something goes wrong on stage

| Problem | Do this |
|---|---|
| Status strip is red | Read the fix it shows. "Public link": restart ngrok. Otherwise rerun `scripts\stage.ps1 -SkipBuild`. |
| The phone doesn't ring within 15 s | Switch to the browser phone: `scripts\stage.ps1 -SkipBuild -Browser`, open the printed /phone link. Same rules, same flow. |
| The judge doesn't press anything | That's fine: it becomes "not reached" and shows the escalation path. |
| Priya's page won't load | Use the console's case drawer instead; the loop still shows. |
| Everything fails | Play the backup video, then walk through the closed loop on the console. |

---

## Sources

- Over 40,000 suspected heatstroke cases and at least 110 confirmed deaths, 1 March – 18 June 2024,
  health ministry figures: [The Tribune](https://www.tribuneindia.com/news/india/india-reports-110-deaths-40-000-heatstroke-cases-this-summer-632500).
  Official counts undercount heat deaths outside hospitals: [Business Today](https://www.businesstoday.in/india/story/56-confirmed-deaths-due-to-heat-stroke-recorded-in-india-in-last-3-months-ncdc-report-431792-2024-06-01).
- About 5.7 % of Indians aged 60+ live alone (LASI Wave-1, 2017–18): [Down To Earth](https://www.downtoearth.org.in/health/how-is-india-s-population-ageing-evidence-from-lasi-81770).
  Check against the LASI report before quoting on a slide.
- Welfare-call programmes abroad (Seoul, Australian Red Cross TeleRedi): see docs/NERALU_PLAN.md §1;
  find the primary links before putting them on a slide.

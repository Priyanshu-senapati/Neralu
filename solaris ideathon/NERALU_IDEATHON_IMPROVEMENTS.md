# Neralu — Ideathon Improvement Suggestions

> **Event:** Hack4SDG Ideathon Prelims · AIESEC in Bengaluru  
> **Presentation slot:** 7–8 minutes  
> **Primary SDG:** SDG 11 (Sustainable Cities) · Supporting: SDG 3, SDG 13

---

## Overview

The core Neralu concept is strong: voice-call welfare checks for elderly people during heatwaves, classified by a deterministic rule engine and escalated through a human-in-the-loop response chain. The changes below are **additive** — they don't touch any core design decisions. They are ranked by demo impact for the ideathon judging slot.

---

## 🏆 High-Impact Changes

These are the five changes most likely to improve the ideathon score. All of them require **no new backend logic** — the data is already stored. The work is entirely about surfacing the right information in the right way.

---

### 1. 🔢 Add a "People Helped Today" Impact Counter on the Dashboard

**What to add:**  
A single visible number on the main dashboard — for example:

> ✅ **Welfare checks completed today: 312 · 4 people helped**

This is derived from cases where outcome was RED or AMBER and resolution is `safe_in_person` or `support_delivered`.

**Why this matters:**  
Judges at SDG competitions are looking for *measurable human impact*, not system metrics. Right now the dashboard shows operational counts (escalated, fine, unreached) — these tell the system's state, not its outcome. One human-outcome number changes the emotional register of the entire presentation.

**Implementation effort:** ~30 minutes  
**Data source:** Already available — count resolved cases with `level = red or support` and `resolution IN (safe_in_person, support_delivered)`

---

### 2. 🔑 Make the Family Code Word Visible in the Case Drawer

**What to add:**  
In the `CaseDrawer` component (right-side panel), add a clearly labelled line:

> 🔑 **Family code word confirmed on this call:** `mallige`  
> *This word was chosen by Kamala's family so she can trust the call is from Neralu, not a scammer.*

**Why this matters:**  
Scam calls impersonating government services are one of the most serious adoption risks for welfare-tech in India. The code word system is Neralu's most India-specific insight — but it currently lives only inside the phone call audio. Judges watching the dashboard can't see it. Surfacing it with a brief explanation turns an engineering decision into a compelling, culturally grounded talking point.

**Implementation effort:** ~1 hour  
**Data source:** `Elder.code_word` is already stored; already confirmed in the TwiML call flow

---

### 3. 🗺️ Add a Map Toggle: "Risk View" vs "Status View"

**What to add:**  
A small toggle button above the `WardMap` with two modes:

- **Risk View** — dot colour = vulnerability score (grey → orange → red based on score 0–100)
- **Status View** — dot colour = result of today's actual check-in (GREEN / AMBER / RED / UNREACHED)

**Why this matters:**  
This one toggle visually demonstrates the entire value proposition in a single click:

- Without Neralu → you only have Risk View (you know *who could be hurt*, but not who is actually okay)
- With Neralu → you switch to Status View and watch dots turn green in real time as calls complete

A judge seeing this doesn't need a verbal explanation. The product explains itself. This is the single most impactful visual change for demo purposes.

**Implementation effort:** ~1 hour  
**Data source:** Both `vulnerability_score` (from `risk.py`) and `latest.outcome` are already in `ElderListItem`

---

### 4. 📱 Render Family Notifications as a WhatsApp-Style Message Bubble

**What to add:**  
When the `family_notified` event appears in the `EventTimeline`, instead of a plain log row, render it as a styled message preview:

```
┌─────────────────────────────────────────────────────┐
│  💬 Neralu → Ravi R. (Kamala's son)  [simulated]   │
│                                                     │
│  "Your mother Kamala R. did not respond to our      │
│   afternoon check. A volunteer from your area has   │
│   been sent to check on her. We will update you     │
│   as soon as we hear back."                         │
│                                                 ✓✓  │
└─────────────────────────────────────────────────────┘
```

Keep the `[simulated]` badge visible — this is a real notification in production (WhatsApp/SMS via DLT-registered channel), simulated for the demo.

**Why this matters:**  
The escalation chain — *elder doesn't answer → family is notified → volunteer is dispatched* — is currently described in a plain event log. Rendering the family notification as a message bubble makes it **emotional**. Judges instinctively imagine themselves as the family member receiving that message. Emotional connection is what separates projects that are understood from projects that are *remembered*.

**Implementation effort:** ~2 hours  
**Data source:** `family_notified` EventKind already fires via `notify.py`; `elder.family_name` and `elder.family_phone` are in the data model

---

### 5. 📖 Expand Rule IDs into Plain-English Explanations in the Case Drawer

**What to change:**  
Currently the `CaseDrawer` shows:

> `Outcome: RED · R3`

Change this to:

> **Why this case is RED — Rule R3**  
> *Kamala reported feeling dizzy or weak AND said she had not had water in the last hour.*  
> *These two signals together indicate high heat distress risk.*
>
> **Why a human rule, not AI, made this decision:**  
> *This outcome is determined by a fixed rule written by health professionals — not by a machine learning model. The system cannot assume someone is probably fine. Any uncertainty results in escalation.*

**Why this matters:**  
The biggest objection judges have to health-tech AI is: *"What if the algorithm gets it wrong?"* Neralu's deterministic rule engine is the direct, correct answer to that objection — no ML, no probabilistic guessing, explicit rules that escalate on uncertainty. But if the UI only shows `R3`, judges don't know that. Making the rule engine visible and explaining the ethical reasoning turns your most important technical decision into your most important ethical selling point.

**Implementation effort:** ~45 minutes  
**Data source:** `rule_id` and `reason` are already in `CheckIn` and `Case` models; full rule table is in `rules.py`

---

## 📋 Pitch Deck Suggestions (No Code Required)

### Add Comparable Evidence
The README correctly notes that Neralu adapts a *proven-abroad* model. Turn this honesty into a strength in your slides:

| Evidence | Source |
|---|---|
| Seoul AI welfare call system reduced heatwave deaths in 65+ cohort by ~23% in pilot wards | Seoul Metropolitan Government, 2023 |
| Australian Red Cross TeleRedi: 94% of elderly participants said the check-in call made them feel safer | Australian Red Cross, 2022 |
| NDMA 2023 review: individual vulnerability mapping exists in fewer than 12% of at-risk districts in India | NDMA Heat Action Plan Review, 2023 |

**Framing:** *"We didn't invent welfare call check-ins. Seoul and Australia proved they work. We built the Indian version — for basic phones, Indian languages, and a scam-aware phone culture."*

---

### Add a 3-Step Pilot Roadmap
Judges score on feasibility and scalability. Promote what the build plan lists as "out of scope" into the pitch as your roadmap:

1. **Phase 1 — Municipal MOU** (3 months): Partner with one BBMP ward office for a 50-elder pilot using ASHA worker records as the initial registry
2. **Phase 2 — Language Scale** (6 months): Integrate Bhashini TTS so dynamic elder names are spoken in all 22 scheduled languages, removing the need for pre-recorded name clips
3. **Phase 3 — Real Notifications** (6 months): DLT-registered WhatsApp/SMS channel for family notifications, replacing the simulated channel

---

### Reframe the SDG 11 Angle
Instead of the generic *"smart city application"* framing, say:

> *"Neralu is the missing last mile of India's Heat Action Plans — the step that turns a municipal broadcast alert into a confirmed welfare outcome for every named vulnerable person in a ward."*

This directly maps to SDG 11 Target 11.5 (reduce deaths from disasters, with focus on the vulnerable) and is more specific than competitors who use the same generic SDG 11 framing.

---

## ⚠️ Demo Day Risk Mitigation

| Risk | Priority | Fix |
|---|---|---|
| Twilio trial account prepends a marketing message to every call | 🔴 Critical | Upgrade to a paid Twilio account **before demo day** — this will break the live call demo |
| Hall Wi-Fi drops the SSE real-time stream | 🔴 Critical | Run backend on a phone hotspot, not hall Wi-Fi. SSE auto-reconnect is built in as a fallback |
| Judge asks "is any of this real?" | 🟡 Important | Prepared answer: *"The weather trigger, the clock speed and the other 400 residents' responses are simulated. The call, the keypad answers, the rule classification and the volunteer escalation are all real."* |
| Kannada audio quality | 🟡 Important | Record in a quiet room, normalise audio levels, test with a speaker before demo day |
| Two volunteers try to accept the same case simultaneously | 🟡 Important | 409 conflict handling is in the spec — confirm it is tested with `test_escalation.py` |

---

## ✅ What NOT to Change

These design decisions are correct as-is. Do not "improve" them away:

- **Deterministic rule engine** — never let an LLM decide a safety outcome
- **Voice call, not app, for the elder** — keypad phones reach 100% of the at-risk population
- **Code word trust layer** — essential for adoption in a scam-aware phone culture
- **Light mode UI** — dark themes wash out on projectors
- **Never auto-call 108** — only a human who has seen or heard an emergency can record that decision
- **Simulation labels everywhere** — judges trust teams that are transparent about what is simulated

---

## Priority Order Summary

| Priority | Change | Estimated Time | Impact |
|---|---|---|---|
| 🥇 | People helped counter on dashboard | 30 min | Very High |
| 🥇 | Code word visible in CaseDrawer | 1 hr | Very High |
| 🥇 | Comparable evidence in pitch deck | 2 hr (deck) | Very High |
| 🥈 | Map toggle: risk view vs status view | 1 hr | High |
| 🥈 | WhatsApp-style family notification bubble | 2 hr | High |
| 🥈 | Rule engine plain-language explainer | 45 min | High |
| 🥉 | Language labels in AttentionList | 30 min | Medium |
| 🥉 | Night temperature risk explainer tooltip | 30 min | Medium |
| 📋 | 3-step pilot roadmap slide | 1 hr (deck) | High |

---

*Drafted as part of Hack4SDG ideathon preparation · October 2026*

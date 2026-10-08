import type { NeraluEvent } from './types'

/*
 * The closed loop for one resident, derived from their events: call → decision → a person is
 * asked → accepted → resolved → family told. Used by the case drawer, the call spotlight and
 * the volunteer page so they all tell the same story.
 */

export type StepState = 'done' | 'current' | 'pending' | 'skipped'

export interface LoopStep {
  key: 'call' | 'decision' | 'escalation' | 'accepted' | 'resolved' | 'family'
  label: string
  detail: string
  at: string | null
  state: StepState
  tone?: 'ok' | 'watch' | 'alert'
}

export interface StoryLine {
  id: number
  at: string
  text: string
  tone?: 'ok' | 'watch' | 'alert' | 'muted'
  simulated: boolean
}

const ANSWER: Record<string, Record<string, string>> = {
  water: { yes: 'has had water in the last hour', no: 'has had no water in the last hour' },
  symptoms: { yes: 'feels dizzy, weak or confused', no: 'does not feel dizzy or weak' },
  room_hot: { yes: 'says the room is very hot', no: 'says the room is not too hot' },
  fan_working: { yes: 'has a working fan or cooler', no: 'has no working fan or cooler' },
  orientation: { correct: 'knew what day it is', wrong: 'named the wrong day', uncertain: 'gave an unclear day', none: 'did not say what day it is' },
  self_report: { ok: 'said they are okay', help: 'pressed for help', none: 'did not answer the last question' },
}
const CONCERN: Record<string, string[]> = {
  water: ['no'], symptoms: ['yes'], room_hot: ['yes'], fan_working: ['no'],
  orientation: ['wrong', 'uncertain'], self_report: ['help'],
}
const OUTCOME_TONE: Record<string, LoopStep['tone']> = { GREEN: 'ok', AMBER: 'watch', RED: 'alert', UNREACHED: 'alert' }
const OUTCOME_WORD: Record<string, string> = {
  GREEN: 'Safe', AMBER: 'Follow-up', RED: 'Needs a person now', UNREACHED: 'Not reached',
}

/** What a call found, as plain phrases, worrying answers first. */
export function callFindings(answers: Record<string, string>): { text: string; concern: boolean }[] {
  const out: { text: string; concern: boolean }[] = []
  for (const [step, phrases] of Object.entries(ANSWER)) {
    const v = answers[step]
    if (v && phrases[v]) out.push({ text: phrases[v], concern: CONCERN[step]?.includes(v) ?? false })
  }
  return out.sort((a, b) => Number(b.concern) - Number(a.concern))
}

/** "6 volunteers on duty alerted · no neighbour on file" */
function alertedText(alerted: NeraluEvent, ev: NeraluEvent[]): string {
  const onDuty = alerted.message.match(/(\d+) on duty/)?.[1]
  const who = alerted.data.tier === 'asha' ? 'ASHA workers' : alerted.data.tier === 'neighbour' ? 'neighbour' : 'volunteers'
  if (who === 'neighbour') return 'Neighbour asked to check'
  const skipped = ev.some((e) => e.kind === 'tier_skipped' && e.case_id === alerted.case_id)
  return `${onDuty ? `${onDuty} ${who} on duty alerted` : `${who[0].toUpperCase()}${who.slice(1)} alerted`}${skipped ? ' · no neighbour on file' : ''}`
}

/** "Retry scheduled · attempt 2 at 12:04" → "12:04" */
function atTime(message: string): string {
  return message.match(/at (\d{2}:\d{2})/)?.[1] ?? 'later'
}

/** Events of the current episode: from the latest first call of a round onwards. */
export function episode(events: NeraluEvent[]): NeraluEvent[] {
  let start = -1
  events.forEach((e, i) => {
    if (e.kind === 'call_placed' && Number(e.data.attempt) === 1 && !String(e.message).startsWith('Recall')) start = i
  })
  return start < 0 ? events : events.slice(start)
}

export function closedLoop(all: NeraluEvent[]): LoopStep[] {
  const ev = episode(all)
  const of = (kind: string) => ev.filter((e) => e.kind === kind)
  const last = (kind: string) => of(kind).at(-1) ?? null

  const placed = of('call_placed')
  const ended = of('call_ended')
  const failed = of('attempt_failed')
  const answered = last('call_answered')
  const classified = last('checkin_classified')
  const outcome = classified ? String(classified.data.outcome ?? '') : ''
  const redOpen = of('case_opened').filter((e) => e.data.level === 'red').at(-1) ?? null
  const caseEv = (kind: string) => (redOpen ? ev.filter((e) => e.kind === kind && e.case_id === redOpen.case_id).at(-1) ?? null : null)
  const alerted = caseEv('tier_alerted')
  const overdue = caseEv('tier_overdue')
  const accepted = caseEv('case_accepted')
  const resolvedAll = redOpen ? ev.filter((e) => e.kind === 'case_resolved' && e.case_id === redOpen.case_id) : []
  const resolved = resolvedAll.filter((e) => e.data.resolution !== 'not_found_escalate').at(-1) ?? null
  const recall = last('recall_scheduled')
  const familyAfter = (after: NeraluEvent | null) =>
    after ? ev.filter((e) => e.kind === 'family_notified' && e.id > after.id).at(-1) ?? null : null

  const steps: LoopStep[] = []

  // 1. The call
  const live = placed.length > ended.length
  steps.push({
    key: 'call', label: 'Neralu calls',
    at: placed[0]?.ts_scenario ?? null,
    state: placed.length === 0 ? 'pending' : live ? 'current' : 'done',
    detail: placed.length === 0 ? 'Not called yet'
      : live ? `Attempt ${placed.length} · ${answered && answered.id > placed.at(-1)!.id ? 'on the call' : 'ringing'}`
        : answered ? 'Answered' : `No answer ×${failed.length}`,
  })

  // 2. The rule decides
  steps.push({
    key: 'decision', label: 'Rules decide',
    at: classified?.ts_scenario ?? null,
    state: classified ? 'done' : live ? 'pending' : placed.length ? 'current' : 'pending',
    detail: classified
      ? redOpen && outcome === 'UNREACHED'
        ? `Not reached · ${String(redOpen.data.rule_id)}`
        : `${OUTCOME_WORD[outcome] ?? outcome} · Rule ${String(classified.data.rule_id)}`
      : 'Waiting for the call',
    tone: redOpen ? 'alert' : OUTCOME_TONE[outcome],
  })

  // 3. A person is asked to go
  const noPerson = classified && !redOpen
  steps.push({
    key: 'escalation', label: 'A person is asked',
    at: redOpen?.ts_scenario ?? recall?.ts_scenario ?? null,
    state: redOpen ? 'done' : noPerson ? 'skipped' : 'pending',
    detail: redOpen
      ? overdue ? 'Nobody accepted · ward officer alerted' : alerted ? alertedText(alerted, ev) : 'Case opened'
      : noPerson ? (outcome === 'AMBER' && recall ? `Not yet · follow-up call at ${atTime(recall.message)}` : 'Not needed')
        : '—',
    tone: overdue ? 'alert' : undefined,
  })

  // 4. Someone accepts
  steps.push({
    key: 'accepted', label: 'Someone accepts',
    at: accepted?.ts_scenario ?? null,
    state: accepted ? 'done' : redOpen ? 'current' : noPerson ? 'skipped' : 'pending',
    detail: accepted ? accepted.message : redOpen ? 'Waiting for a volunteer' : noPerson ? 'Not needed' : '—',
  })

  // 5. Checked in person
  steps.push({
    key: 'resolved', label: 'Checked in person',
    at: resolved?.ts_scenario ?? null,
    state: resolved ? 'done' : accepted ? 'current' : noPerson ? 'skipped' : 'pending',
    detail: resolved ? resolved.message.replace(/^[^:]+: /, '') : accepted ? 'On the way' : noPerson ? 'Not needed' : '—',
    tone: resolved ? (resolved.data.resolution === 'called_108' ? 'alert' : 'ok') : undefined,
  })

  // 6. Family told
  const told = familyAfter(resolved) ?? familyAfter(redOpen) ?? familyAfter(classified)
  steps.push({
    key: 'family', label: 'Family told',
    at: told?.ts_scenario ?? null,
    state: told ? 'done' : outcome === 'GREEN' && !redOpen ? 'skipped' : 'pending',
    detail: told ? `${told.message.split(' notified')[0]} · simulated channel` : outcome === 'GREEN' && !redOpen ? 'Nothing to report' : '—',
  })
  return steps
}

/** A plain-English account of what happened to this person, oldest first. */
export function story(all: NeraluEvent[], firstName: string): StoryLine[] {
  const lines: StoryLine[] = []
  const add = (e: NeraluEvent, text: string, tone?: StoryLine['tone']) =>
    lines.push({ id: e.id, at: e.ts_scenario, text, tone, simulated: e.simulated })
  for (const e of episode(all)) {
    const d = e.data
    switch (e.kind) {
      case 'call_placed':
        add(e, String(e.message).startsWith('Recall')
          ? `Neralu made a follow-up call to ${firstName}.`
          : String(e.message).startsWith('Call failed')
            ? `The call to ${firstName} could not be placed.`
            : `Neralu called ${firstName}${Number(d.attempt) > 1 ? ` again (attempt ${d.attempt})` : ''}.`)
        break
      case 'call_answered':
        add(e, `${firstName} picked up and heard the family code word.`)
        break
      case 'answer_recorded': {
        const text = ANSWER[String(d.step)]?.[String(d.value)]
        if (text) add(e, `${firstName} ${text}.`, CONCERN[String(d.step)]?.includes(String(d.value)) ? 'alert' : undefined)
        break
      }
      case 'attempt_failed':
        add(e, `No answer${Number(d.attempt) ? ` on attempt ${d.attempt}` : ''}.`, 'watch')
        break
      case 'retry_scheduled':
        add(e, `Neralu will try again at ${atTime(e.message)}.`, 'muted')
        break
      case 'checkin_classified':
        if (d.outcome === 'UNREACHED') break // "No answer on attempt N" already says it
        add(e, `Rule ${d.rule_id} decided: ${OUTCOME_WORD[String(d.outcome)] ?? d.outcome}. ${String(d.reason)}.`,
          d.outcome === 'GREEN' ? 'ok' : d.outcome === 'AMBER' ? 'watch' : 'alert')
        break
      case 'recall_scheduled':
        add(e, `Family told. A follow-up call is booked for ${atTime(e.message)}.`, 'watch')
        break
      case 'case_opened':
        add(e, d.level === 'red'
          ? `A person is needed: ${String(d.reason).toLowerCase()}.`
          : `Support needed: ${String(d.reason).toLowerCase()}.`, d.level === 'red' ? 'alert' : undefined)
        break
      case 'tier_skipped':
        add(e, 'No neighbour on file, so volunteers were asked directly.', 'muted')
        break
      case 'tier_alerted': {
        const onDuty = e.message.match(/(\d+) on duty/)?.[1]
        const who = d.tier === 'asha' ? 'ASHA workers' : d.tier === 'neighbour' ? 'The neighbour' : 'volunteers'
        const why = e.message.includes('not accepted') ? ' because nobody had accepted yet' : ''
        add(e, d.tier === 'neighbour'
          ? 'The neighbour on file was asked to check.'
          : `${onDuty ? `${onDuty} ${who} on duty in Ward 47` : who[0].toUpperCase() + who.slice(1)} were alerted${why}.`)
        break
      }
      case 'tier_overdue':
        add(e, 'Nobody accepted in time. The ward officer was alerted.', 'alert')
        break
      case 'case_accepted':
        add(e, `${e.message.replace(' · waited', ' after waiting')}.`, 'ok')
        break
      case 'case_resolved':
        add(e, `${e.message}.`, d.resolution === 'not_found_escalate' ? 'watch' : 'ok')
        break
      case 'family_notified':
        add(e, `${e.message.split(' notified')[0]} was told.`, 'muted')
        break
      case 'elder_registered':
        add(e, `${e.message}.`, 'muted')
        break
    }
  }
  return lines
}

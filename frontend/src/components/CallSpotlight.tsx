import { FlowButton } from '@/components/ui/flow-button'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { closedLoop, episode } from '../loop'
import { useRuleBook } from '../rules'
import { fmtTime } from '../time'
import type { CheckInOut, ElderDetail, ElderListItem, NeraluEvent } from '../types'
import { ClosedLoop } from './ClosedLoop'

/*
 * The live call, large enough for a room to follow: who is being called and why, the call
 * script line by line, each key press as it lands, then the rule's decision and the loop.
 * Opens on its own when a real resident's call starts; the presenter can minimise or close it.
 */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const LANG: Record<string, string> = { kn: 'Kannada', ta: 'Tamil', te: 'Telugu', ur: 'Urdu', hi: 'Hindi', en: 'English' }

interface ScriptLine {
  key: string
  caption: string
  answer?: (c: CheckInOut, ev: NeraluEvent[]) => { text: string; concern: boolean } | null
}

const yesNo = (field: string, concernOn: 'yes' | 'no') => (c: CheckInOut) => {
  const v = c.answers[field]
  if (!v) return null
  if (v === 'none') return { text: 'No key pressed', concern: false }
  return { text: `Pressed ${v === 'yes' ? 1 : 2} · ${v === 'yes' ? 'Yes' : 'No'}`, concern: v === concernOn }
}

const SCRIPT: ScriptLine[] = [
  { key: 'greet', caption: 'Namaskara. This is Neralu, the heat care service from your ward office.' },
  { key: 'code', caption: 'Your family\'s code word is: …' },
  { key: 'safety', caption: 'Neralu will never ask for money, OTP, Aadhaar or bank details.' },
  { key: 'water', caption: 'Have you had water in the last hour?', answer: yesNo('water', 'no') },
  { key: 'symptoms', caption: 'Do you feel dizzy, weak or confused?', answer: yesNo('symptoms', 'yes') },
  { key: 'room_hot', caption: 'Is your room very hot right now?', answer: yesNo('room_hot', 'yes') },
  { key: 'fan_working', caption: 'Is your fan or cooler working?', answer: yesNo('fan_working', 'no') },
  {
    key: 'orientation', caption: 'What day is it today?',
    answer: (c, ev) => {
      const v = c.answers.orientation
      if (!v) return null
      const rec = ev.filter((e) => e.kind === 'answer_recorded' && e.checkin_id === c.id && e.data.step === 'orientation').at(-1)
      const pressed = rec?.data.weekday_pressed
      if (typeof pressed === 'number') {
        return { text: `Pressed ${pressed + 1} · ${DAYS[pressed]}${v === 'correct' ? ' · correct' : ' · wrong day'}`, concern: v !== 'correct' }
      }
      if (c.transcript) return { text: `Named ${c.transcript} · ${v === 'correct' ? 'correct' : v === 'wrong' ? 'wrong day' : 'unclear'}`, concern: v !== 'correct' }
      return { text: v === 'none' ? 'No answer' : v === 'correct' ? 'Correct' : v === 'wrong' ? 'Wrong day' : 'Unclear', concern: v !== 'correct' }
    },
  },
  {
    key: 'self_report', caption: 'If you need help now, press 2. If you are okay, press 1.',
    answer: (c) => {
      const v = c.answers.self_report
      if (!v) return null
      return v === 'none' ? { text: 'No key pressed', concern: false }
        : { text: `Pressed ${v === 'help' ? 2 : 1} · ${v === 'help' ? 'Needs help' : 'Okay'}`, concern: v === 'help' }
    },
  },
]

/** A caregiver call about a person with memory difficulty: same opening, questions about them, no day question. */
const CAREGIVER_SCRIPT: ScriptLine[] = [
  SCRIPT[0],
  { key: 'cg_intro', caption: 'We are calling about the person in your care who is registered with Neralu.' },
  SCRIPT[1],
  SCRIPT[2],
  { key: 'seen', caption: 'Are you with them now, or have you seen them in the last hour?', answer: yesNo('seen', 'no') },
  { key: 'water', caption: 'Have they had water in the last hour?', answer: yesNo('water', 'no') },
  { key: 'unwell', caption: 'Do they seem more confused, drowsy or unwell than usual?', answer: yesNo('unwell', 'yes') },
  { key: 'room_no_cooling', caption: 'Is their room very hot, with no fan or cooler working?', answer: yesNo('room_no_cooling', 'yes') },
  { ...SCRIPT[SCRIPT.length - 1], caption: 'If they need help now, press 2. If they are okay, press 1.' },
]
const questionKeys = (script: ScriptLine[]) => script.filter((s) => s.answer).map((s) => s.key)

/** Shown first when the call began with the language menu (1 Kannada, 2 Hindi, 3 English). */
const LANG_LINE: ScriptLine = {
  key: 'language', caption: 'Language: 1 Kannada · 2 Hindi · 3 English',
  answer: (c, ev) => {
    if (!c.language) return null
    const chosen = ev.filter((e) => e.kind === 'language_chosen' && e.checkin_id === c.id).at(-1)
    const pressed = chosen?.data.pressed
    return { text: `${pressed ? `Pressed ${pressed}` : 'No key'} · ${LANG[c.language] ?? c.language}`, concern: false }
  },
}

type Phase = 'ringing' | 'connected' | 'between' | 'done'

interface Props {
  elders: ElderListItem[]
  mode: 'twilio' | 'browser'
  speed: number
  now: Date | null
  refreshKey: number
  onOpenProfile: (id: number) => void
}

export function CallSpotlight({ elders, mode, speed, now, refreshKey, onOpenProfile }: Props) {
  const book = useRuleBook()
  // With several real residents due, follow the one actually on the line, else the first calling.
  const calling = elders.filter((e) => !e.is_simulated && e.current_call)
  const active = calling.find((e) => e.current_call!.call_status === 'in-progress') ?? calling[0]
  const [focusId, setFocusId] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [minimised, setMinimised] = useState(false)
  const [d, setD] = useState<ElderDetail | null>(null)

  const activeKey = active ? `${active.id}-${active.current_call!.round_no}` : null
  useEffect(() => {
    if (active && activeKey !== dismissed) {
      setFocusId(active.id)
    }
  }, [active, activeKey, dismissed])

  useEffect(() => {
    if (focusId === null) return
    let live = true
    api.elder(focusId).then((x) => live && setD(x)).catch(() => {})
    return () => {
      live = false
    }
  }, [focusId, refreshKey])

  const resident = elders.find((e) => e.id === focusId) ?? null
  const detail = d && resident && d.id === resident.id ? d : null
  const call = useMemo(() => (detail ? [...detail.checkins].reverse().find((c) => c.call_status) ?? null : null), [detail])

  if (!resident || focusId === null) return null
  const cur = resident.current_call
  const phase: Phase = cur?.started
    ? cur.call_status === 'in-progress' ? 'connected' : 'ringing'
    : cur ? 'between' : 'done'

  const close = () => {
    setDismissed(activeKey ?? `${resident.id}-done`)
    setFocusId(null)
    setMinimised(false)
  }
  const placed = detail?.events.filter((e) => e.kind === 'call_placed' && (!call || e.checkin_id === call.id)).at(-1)
  const elapsed = placed && now ? Math.max(0, Math.round((now.getTime() - new Date(placed.ts_scenario).getTime()) / speed / 1000)) : 0
  const first = resident.name.split(' ')[0]
  const caregiver = (cur?.callee ?? call?.callee) === 'caregiver'
  const who = caregiver ? (detail?.family_name ?? 'Their caregiver') : first

  if (minimised) {
    return (
      <button
        onClick={() => setMinimised(false)}
        className="press fixed bottom-3 left-3 z-[850] flex items-center gap-2 rounded-ui border border-line-strong bg-surface px-3 py-2 text-sm shadow-sm"
      >
        <LiveDot phase={phase} />
        <span className="font-semibold">{phaseLabel(phase)} · {resident.name}</span>
        {(phase === 'ringing' || phase === 'connected') && <span className="num text-muted">{clock(elapsed)}</span>}
        <span className="text-muted">Show</span>
      </button>
    )
  }

  // The language line appears once the caller has chosen (or the menu timed out).
  const script = caregiver ? CAREGIVER_SCRIPT : SCRIPT
  const lines = call?.language ? [LANG_LINE, ...script] : script
  const firstQuestion = lines.findIndex((l) => l.answer && l.key !== 'language')
  const answeredCount = call ? questionKeys(script).filter((k) => call.answers[k]).length : 0
  const currentIdx = phase === 'connected' ? firstQuestion + answeredCount : -1
  const spoken = LANG[call?.language ?? resident.language] ?? resident.language
  const verdict = phase === 'done' && call?.classified ? call : null
  const nextAt = cur && !cur.started ? cur.scheduled_scenario : null
  const nextIn = nextAt && now ? Math.max(0, Math.round((new Date(nextAt).getTime() - now.getTime()) / speed / 1000)) : null

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] z-[800] flex items-start justify-center overflow-y-auto bg-ink/25 p-4 lg:items-center" role="dialog" aria-modal="false" aria-label={`Live call to ${resident.name}`}>
      <section className="drawer-enter grid w-full max-w-[1040px] overflow-hidden rounded-ui border border-line-strong bg-surface shadow-[0_24px_60px_-20px_rgba(27,29,26,0.35)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Who and why */}
        <div className="border-b border-line p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-[3px] bg-ink px-2 py-1 text-xs font-semibold tracking-wide text-paper">
              <LiveDot phase={phase} light /> {mode === 'twilio' ? 'REAL PHONE CALL · NOT SIMULATED' : 'LIVE CALL · BROWSER PHONE'}
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setMinimised(true)} className="press rounded-ui border border-line px-2 py-1 text-xs text-muted hover:text-ink">Minimise</button>
              <button onClick={close} className="press rounded-ui border border-line px-2 py-1 text-xs text-muted hover:text-ink">Close</button>
            </div>
          </div>

          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em]">{resident.name}</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="num">{resident.age}</span> · {resident.lives_alone ? 'lives alone' : 'lives with family'} · {LANG[resident.language] ?? resident.language} · {mode === 'twilio' ? 'their own phone, any handset' : 'browser phone, no telecom'}
          </p>
          {caregiver && (
            <p className="mt-2 text-sm">
              <span className="font-semibold">Caregiver call · {who}.</span>{' '}
              <span className="text-muted">{first} has memory difficulty, so "what day is it?" cannot tell heat confusion apart; the caregiver answers about {first} instead.</span>
            </p>
          )}

          {detail && (
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-ui border border-line bg-line text-sm">
              <div className="bg-surface px-3 py-2">
                <div className="text-xs text-muted">Personal heat threshold</div>
                <div className="num text-lg">{detail.threshold_c.toFixed(1)} °C</div>
              </div>
              <div className="bg-alert-bg px-3 py-2">
                <div className="text-xs text-muted">Today's heat index</div>
                <div className="num text-lg text-heat">{detail.heat_index_c.toFixed(1)} °C</div>
              </div>
              <div className="col-span-2 bg-surface px-3 py-2 text-xs text-muted">
                Why called: {resident.risk_factors.join(' · ')}
              </div>
            </div>
          )}

          <div className="mt-5 rounded-ui border border-line px-4 py-3" role="status" aria-live="polite">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-2 text-lg font-semibold">
                <LiveDot phase={phase} /> {phaseLabel(phase)}
              </span>
              {(phase === 'ringing' || phase === 'connected') && <span className="num text-2xl tabular-nums">{clock(elapsed)}</span>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {phase === 'ringing' && `${cur?.requested ? `Calling back after a missed call` : `Attempt ${cur?.attempt ?? 1}${cur?.is_recall ? ' · follow-up call' : ''}`} · ${who}'s phone is ringing.`}
              {phase === 'connected' && `${who} picked up. Neralu asks each question; ${who} answers on the keypad.`}
              {phase === 'between' && (
                <>{cur?.is_recall && cur.attempt === 1 ? 'Follow-up call booked' : `No answer on attempt ${(cur?.attempt ?? 2) - 1}. Calling again`} at <span className="num">{fmtTime(nextAt)}</span>
                  {nextIn !== null && <> · in <span className="num">{clock(nextIn)}</span></>}.</>
              )}
              {phase === 'done' && (verdict ? 'The call has ended and the rules have decided.' : 'Call ended.')}
            </p>
          </div>

          {verdict && (() => {
            // An escalation rule (E1 no answer twice, E3 second concerning call) is what sent a
            // person, so it is the decision to show, not the last call's own rule.
            const escalated = detail ? escalationOf(detail.events) : null
            const outcome = escalated ? 'RED' : verdict.outcome
            const rule = escalated?.rule ?? verdict.rule_id ?? ''
            return (
              <div className={`mt-4 rounded-ui px-4 py-3 ${tint(outcome)}`}>
                <div className="text-xs font-semibold tracking-wide">DECISION</div>
                <div className="mt-0.5 text-xl font-semibold">
                  {outcome} · <span className="num">{escalated ? `Escalated by ${rule}` : `Rule ${rule}`}</span>
                  {escalated && <span className="font-normal"> · {escalated.reason}</span>}
                </div>
                <p className="mt-1 text-sm text-ink">{book?.explain[rule] ?? verdict.reason}</p>
                <p className="mt-1.5 text-xs text-muted">{book?.decided_by}</p>
              </div>
            )
          })()}
        </div>

        {/* What is said, what she pressed, what happens next */}
        <div className="p-6">
          {phase === 'done' && detail ? (
            <>
              <h3 className="text-sm font-semibold">What happens next</h3>
              <div className="mt-3">
                <ClosedLoop steps={closedLoop(detail.events)} />
              </div>
              <FlowButton variant="secondary" size="sm" className="mt-5" onClick={() => { onOpenProfile(resident.id); close() }}>
                Open {first}'s full profile
              </FlowButton>
            </>
          ) : (
            <>
              <h3 className="flex items-baseline justify-between text-sm font-semibold">
                On the call
                <span className="text-xs font-normal text-muted">Recorded prompts · {spoken}</span>
              </h3>
              <ol className="mt-3 divide-y divide-line border-y border-line">
                {lines.map((line, i) => {
                  const ans = call && line.answer ? line.answer(call, detail?.events ?? []) : null
                  const played = phase === 'connected' && (i < currentIdx || (line.answer && ans))
                  const isNow = i === currentIdx && !ans
                  const caption = line.key === 'code' && detail ? `Your family's code word is: ${cap(detail.code_word)}` : line.caption
                  return (
                    <li key={line.key} className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-2 transition-colors ${isNow ? 'bg-brand-tint -mx-3 px-3' : ''}`}>
                      <span className={`text-[15px] ${isNow ? 'font-semibold' : played || ans ? '' : 'text-muted'}`}>
                        {caption}
                      </span>
                      <span className={`num shrink-0 text-sm ${ans?.concern ? 'font-semibold text-alert' : ans ? 'text-ok' : 'text-muted'}`}>
                        {ans ? ans.text : isNow ? 'Asking now…' : played ? 'Played' : ''}
                      </span>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-3 text-xs text-muted">
                Captions show the English meaning. A picked-up call with no key presses counts as not reached, never as fine.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/** The escalation-rule case (E1, E3) opened in this episode, if any. */
function escalationOf(events: NeraluEvent[]): { rule: string; reason: string } | null {
  const opened = episode(events).filter((e) => e.kind === 'case_opened' && e.data.level === 'red').at(-1)
  const rule = opened ? String(opened.data.rule_id ?? '') : ''
  return opened && rule.startsWith('E') ? { rule, reason: String(opened.data.reason ?? '') } : null
}

function phaseLabel(p: Phase) {
  return p === 'ringing' ? 'Ringing' : p === 'connected' ? 'Connected' : p === 'between' ? 'Will call again' : 'Call ended'
}

function LiveDot({ phase, light = false }: { phase: Phase; light?: boolean }) {
  const on = phase === 'ringing' || phase === 'connected'
  const color = phase === 'connected' ? 'bg-ok' : phase === 'ringing' ? (light ? 'bg-paper' : 'bg-alert') : 'bg-muted'
  return (
    <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
      {on && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60 motion-reduce:hidden`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  )
}

function tint(o: string | null) {
  return o === 'GREEN' ? 'bg-ok-bg' : o === 'AMBER' ? 'bg-watch-bg' : 'bg-alert-bg'
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const cap = (w: string) => w[0].toUpperCase() + w.slice(1)

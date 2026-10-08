import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { TIER_LABEL } from '../status'
import { fmtTime } from '../time'
import type { CheckInOut, ElderDetail, ElderListItem, Outcome } from '../types'
import { RuleExplanation } from './RuleExplanation'

const QUESTIONS: { key: string; label: string; concern: string[] }[] = [
  { key: 'water', label: 'Water in the last hour', concern: ['no'] },
  { key: 'symptoms', label: 'Dizzy, weak or confused', concern: ['yes'] },
  { key: 'room_hot', label: 'Room very hot', concern: ['yes'] },
  { key: 'fan_working', label: 'Fan or cooler working', concern: ['no'] },
  { key: 'orientation', label: 'Knew what day it is', concern: ['wrong', 'uncertain'] },
  { key: 'self_report', label: 'Okay, or needs help', concern: ['help'] },
]
const VALUE: Record<string, string> = {
  yes: 'Yes', no: 'No', none: 'No answer', correct: 'Yes', wrong: 'Wrong day', uncertain: 'Unclear',
  ok: 'Okay', help: 'Needs help',
}
const OUTCOME: Record<Outcome, { label: string; cls: string }> = {
  GREEN: { label: 'Safe', cls: 'bg-ok-bg text-ok' },
  AMBER: { label: 'Follow-up', cls: 'bg-watch-bg text-watch' },
  RED: { label: 'Escalated to a person', cls: 'bg-alert-bg text-alert' },
  UNREACHED: { label: 'Not reached', cls: 'bg-sunken text-ink' },
}
const LINE: Record<string, string> = {
  queued: 'Calling', initiated: 'Calling', ringing: 'Ringing', 'in-progress': 'Connected',
}

/** The real resident whose call matters right now: one in progress, else the latest real call. */
function pickResident(elders: ElderListItem[]): ElderListItem | null {
  const real = elders.filter((e) => !e.is_simulated)
  const active = real.find((e) => e.current_call?.started)
  if (active) return active
  return real
    .filter((e) => e.latest.at_scenario)
    .sort((a, b) => (b.latest.at_scenario ?? '').localeCompare(a.latest.at_scenario ?? ''))[0] ?? null
}

interface Props {
  elders: ElderListItem[]
  refreshKey: number
  onOpen: (id: number) => void
}

export function LiveCall({ elders, refreshKey, onOpen }: Props) {
  const resident = useMemo(() => pickResident(elders), [elders])
  const [d, setD] = useState<ElderDetail | null>(null)
  const id = resident?.id

  useEffect(() => {
    if (id === undefined) return
    let live = true
    api.elder(id).then((x) => live && setD(x)).catch(() => {})
    return () => {
      live = false
    }
  }, [id, refreshKey])

  if (!resident) return null
  const detail = d && d.id === resident.id ? d : null
  const call = detail ? [...detail.checkins].reverse().find((c) => c.call_status || c.classified) ?? null : null
  const active = !!resident.current_call?.started
  const line = active ? LINE[resident.current_call?.call_status ?? 'queued'] ?? 'Calling' : null

  return (
    <section aria-label="Call in progress" className="border-b border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <h2 className="text-sm font-semibold">{active ? 'Live call' : 'Latest real call'}</h2>
        {call?.at_scenario && <span className="num text-xs text-muted">{fmtTime(call.at_scenario)}</span>}
      </div>
      <button onClick={() => onOpen(resident.id)} className="mt-1 block px-4 text-left">
        <span className="text-lg font-semibold">{resident.name}</span>{' '}
        <span className="num text-sm text-muted">{resident.age}</span>
        <span className="block text-xs text-muted">
          {call ? `${call.is_recall ? 'Follow-up call' : `Attempt ${call.attempt}`} · ` : ''}
          {resident.risk_factors.slice(0, 3).join(', ')}
        </span>
      </button>

      {active && (
        <div className="mx-4 mt-2.5 flex items-center gap-2 text-sm" role="status">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
          </span>
          <span className="font-semibold">{line}</span>
          {line === 'Connected' && call && <span className="text-muted">· question {Math.min(answered(call) + 1, 6)} of 6</span>}
        </div>
      )}

      {call && (call.call_status === 'in-progress' || call.classified) && call.call_status !== 'no-answer' && (
        <ol className="mx-4 mt-2.5 divide-y divide-line border-y border-line text-sm">
          {QUESTIONS.map((q, i) => {
            const v = call.answers[q.key]
            const current = active && !v && i === answered(call)
            const concern = v && q.concern.includes(v)
            return (
              <li key={q.key} className={`flex items-baseline justify-between gap-3 py-1.5 ${current ? 'font-semibold' : ''}`}>
                <span className={v || current ? '' : 'text-muted'}>
                  <span className="num mr-2 text-xs text-muted">{i + 1}</span>
                  {q.label}
                </span>
                <span className={`shrink-0 ${concern ? 'font-semibold text-alert' : v === 'none' ? 'text-muted' : ''}`}>
                  {v ? VALUE[v] ?? v : current ? 'Asking…' : ''}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <div className="px-4 pb-3.5 pt-3">
        {call?.classified && call.outcome ? <Verdict call={call} resident={resident} /> : null}
        {!active && !call?.classified && <p className="text-sm text-muted">Waiting for the next call.</p>}
      </div>
    </section>
  )
}

function answered(c: CheckInOut) {
  return QUESTIONS.filter((q) => c.answers[q.key]).length
}

function Verdict({ call, resident }: { call: CheckInOut; resident: ElderListItem }) {
  const o = OUTCOME[call.outcome!]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`rounded-[3px] px-1.5 py-0.5 text-sm font-semibold ${o.cls}`}>
          {call.outcome} · {o.label}
        </span>
      </div>
      {call.rule_id && <RuleExplanation ruleId={call.rule_id} reason={call.reason} />}
      <p className="text-sm">
        <span className="font-semibold">Next: </span>
        {nextAction(call, resident)}
      </p>
    </div>
  )
}

function nextAction(call: CheckInOut, e: ElderListItem): string {
  const c = e.open_case
  if (c) {
    if (c.state === 'assigned') return `${TIER_LABEL[c.tier]} accepted and is on the way.`
    if (c.overdue) return 'No one has accepted. The ward officer needs to act.'
    return `${TIER_LABEL[c.tier]}s nearby are alerted. Waiting for someone to accept.`
  }
  if (e.last_resolution) return 'Closed by a person who checked in person.'
  if (e.current_call && !e.current_call.started) {
    return e.current_call.is_recall
      ? `Follow-up call at ${fmtTime(e.current_call.scheduled_scenario)}.`
      : `Calling again at ${fmtTime(e.current_call.scheduled_scenario)} (attempt ${e.current_call.attempt}).`
  }
  if (call.outcome === 'GREEN') return 'Nothing now. Neralu calls again if the heat stays above their threshold.'
  if (call.outcome === 'AMBER') return 'Family informed. A follow-up call is scheduled.'
  return 'No further calls today.'
}

import { useEffect, useState } from 'react'
import { api } from '../api'
import { elderStatus, TIER_LABEL } from '../status'
import { fmtTime } from '../time'
import type { CheckInOut, ElderDetail } from '../types'
import { AnswerTable } from './AnswerTable'
import { EventTimeline } from './EventTimeline'
import { RecordingPlayer } from './RecordingPlayer'
import { RiskBreakdown } from './RiskBreakdown'
import { RuleExplanation } from './RuleExplanation'
import { SimTag, StatusPill } from './StatusPill'
import { WaitingTimer } from './WaitingTimer'

const ROOF: Record<string, string> = { sheet: 'Sheet roof', tile: 'Tile roof', concrete: 'Concrete roof', top_floor: 'Top floor' }
const LANG: Record<string, string> = { kn: 'Kannada', ta: 'Tamil', te: 'Telugu', ur: 'Urdu', hi: 'Hindi' }
const CALL_STATUS: Record<string, string> = {
  queued: 'Calling', ringing: 'Ringing', 'in-progress': 'On the call', completed: 'Answered',
  busy: 'Busy', 'no-answer': 'No answer', failed: 'Call failed · number unreachable', canceled: 'Canceled',
}

interface Props {
  elderId: number
  refreshKey: number
  now: Date | null
  onClose: () => void
}

export function CaseDrawer({ elderId, refreshKey, now, onClose }: Props) {
  const [d, setD] = useState<ElderDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    api.elder(elderId).then((x) => live && (setD(x), setError(false))).catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [elderId, refreshKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const loaded = d && d.id === elderId
  return (
    <aside className="fixed inset-y-0 right-0 z-[1000] flex w-[480px] max-w-full flex-col border-l border-line bg-surface">
      <div className="flex items-start justify-between border-b border-line px-5 py-3">
        {loaded ? <Header d={d} /> : <div className="h-10 w-48 animate-pulse rounded-ui bg-line" />}
        <button onClick={onClose} className="rounded-ui border border-line px-2 py-1 text-sm text-muted hover:text-ink">
          Close
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {error && <p className="text-sm text-alert">Could not load this resident. Retrying on the next update.</p>}
        {!loaded && !error && <DrawerSkeleton />}
        {loaded && <Body d={d} now={now} />}
      </div>
    </aside>
  )
}

function Header({ d }: { d: ElderDetail }) {
  const s = elderStatus(d)
  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{d.name}</h2>
        <span className="font-mono text-sm text-muted">{d.age}</span>
        {d.is_simulated && <SimTag />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <StatusPill tone={s.tone} label={s.label} />
        <span>{LANG[d.language] ?? d.language}</span>
        <span>· {d.lives_alone ? 'Lives alone' : 'Lives with others'}</span>
        <span>· {ROOF[d.roof_type] ?? d.roof_type}</span>
        {d.caregiver_route && <span className="rounded-ui border border-line px-1">Caregiver route</span>}
      </div>
    </div>
  )
}

function Body({ d, now }: { d: ElderDetail; now: Date | null }) {
  const c = d.open_case
  const shown = [...d.checkins].reverse().find((x) => Object.keys(x.answers).length > 0) ?? null
  return (
    <>
      {c && (
        <div className={`rounded-ui px-3 py-2.5 ${c.level === 'red' ? 'bg-alert-bg' : 'bg-support-bg'}`}>
          <div className={`text-sm font-semibold ${c.level === 'red' ? 'text-alert' : 'text-support'}`}>
            {c.rule_id.startsWith('E') ? `Escalated by ${c.rule_id}` : `Rule ${c.rule_id}`} · {c.reason}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            <span>Waiting <WaitingTimer since={c.opened_scenario} now={now} /></span>
            <span>{TIER_LABEL[c.tier]} tier</span>
            <span>{c.state === 'assigned' ? 'Accepted' : c.overdue ? 'Ward officer action needed' : <>not accepted · <WaitingTimer since={c.tier_started_scenario} now={now} /></>}</span>
          </div>
          {!d.has_neighbour && c.level === 'red' && <div className="mt-1 text-xs text-muted">No neighbour on file</div>}
          <div className="mt-2 border-t border-ink/10 pt-2">
            <RuleExplanation ruleId={c.rule_id} heading={false} />
          </div>
        </div>
      )}
      {d.address && (
        <div className="text-sm">
          <span className="text-muted">Address (case accepted): </span>
          {d.address}
        </div>
      )}
      <div className="rounded-ui border border-line px-3 py-2 text-sm">
        <div>
          Family code word, played at the start of every call:{' '}
          <span className="font-semibold">{d.code_word[0].toUpperCase() + d.code_word.slice(1)}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Chosen by {d.family_name ?? 'their family'} so {d.name.split(' ')[0]} knows the call is really from Neralu and not a
          scam. Every call also says Neralu never asks for money, OTP, Aadhaar or bank details.
        </p>
      </div>
      <RiskBreakdown r={d} score={d.risk_score} />
      <section>
        <h3 className="mb-2 text-sm font-semibold">Call attempts</h3>
        {d.checkins.length === 0 ? (
          <p className="text-sm text-muted">{d.caregiver_route ? 'Caregiver route · not called directly' : 'Not called yet'}</p>
        ) : (
          <ul className="divide-y divide-line rounded-ui border border-line text-sm">
            {d.checkins.map((x) => <AttemptRow key={x.id} x={x} />)}
          </ul>
        )}
      </section>
      {shown && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">
            Answers · round {shown.round_no}, {shown.is_recall ? 'recall' : 'attempt'} {shown.attempt}
          </h3>
          <AnswerTable c={shown} />
          {shown.recording_url && (
            <div className="mt-3">
              <RecordingPlayer src={shown.recording_url} transcript={shown.transcript} />
            </div>
          )}
          {shown.rule_id && (
            <div className="mt-2 space-y-2">
              <RuleExplanation ruleId={shown.rule_id} reason={shown.reason} note={!c} />
              {shown.needs_support && <RuleExplanation ruleId="S1" reason="Needs support" note={false} />}
            </div>
          )}
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
        <EventTimeline events={d.events} />
      </section>
    </>
  )
}

function AttemptRow({ x }: { x: CheckInOut }) {
  const label = x.call_status ? CALL_STATUS[x.call_status] ?? x.call_status : 'Scheduled'
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span>
        <span className="font-mono text-xs text-muted">{fmtTime(x.at_scenario)}</span>{' '}
        R{x.round_no} · {x.is_recall ? 'recall' : 'attempt'} {x.attempt}
        {x.is_simulated && <> <SimTag /></>}
      </span>
      <span className="text-right text-xs">
        {label}
        {x.outcome && <> · <span className="font-semibold">{x.outcome}</span> <span className="font-mono">{x.rule_id}</span></>}
      </span>
    </li>
  )
}

function DrawerSkeleton() {
  return (
    <div className="space-y-3">
      {[60, 90, 40, 75].map((w) => (
        <div key={w} className="h-4 animate-pulse rounded-ui bg-line" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

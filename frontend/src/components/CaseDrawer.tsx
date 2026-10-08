import { useEffect, useRef, useState } from 'react'
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
  busy: 'Busy or declined', 'no-answer': 'No answer', failed: 'Call could not be placed', canceled: 'No answer',
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
  const closeRef = useRef<HTMLButtonElement>(null)

  // Move keyboard focus into the drawer when it opens so Escape and Tab work from there.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [elderId])

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
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="case-drawer-title"
      className="drawer-enter fixed inset-y-0 right-0 z-[1000] flex w-[500px] max-w-full flex-col border-l border-line-strong bg-surface"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        {loaded ? <Header d={d} /> : <div className="h-10 w-48 animate-pulse rounded-ui bg-line" />}
        <button ref={closeRef} onClick={onClose} className="press rounded-ui border border-line px-2 py-1 text-sm text-muted hover:text-ink">
          Close
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {error && <p className="text-sm text-alert">Could not load this resident. Retrying on the next update.</p>}
        {!loaded && !error && <DrawerSkeleton />}
        {loaded && <Body key={d.id} d={d} now={now} />}
      </div>
    </aside>
  )
}

function riskBand(score: number) {
  return score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low'
}

function Header({ d }: { d: ElderDetail }) {
  const s = elderStatus(d)
  const band = riskBand(d.risk_score)
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="case-drawer-title" className="text-xl font-semibold tracking-[-0.01em]">{d.name}</h2>
        <span className="text-sm text-muted">
          <span className="num">{d.age}</span> years · Ward 47
        </span>
        {d.is_simulated && <SimTag />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <StatusPill tone={s.tone} label={s.label} />
        <span className={band === 'High' ? 'font-semibold text-heat' : ''}>
          {band} heat risk <span className="num text-xs text-muted">({d.risk_score})</span>
        </span>
        <span className="text-muted">
          · {LANG[d.language] ?? d.language} · {d.lives_alone ? 'lives alone' : 'lives with others'} · {(ROOF[d.roof_type] ?? d.roof_type).toLowerCase()}
        </span>
        {d.caregiver_route && <span className="rounded-[3px] border border-line px-1 text-xs">Caregiver route</span>}
      </div>
    </div>
  )
}

function Body({ d, now }: { d: ElderDetail; now: Date | null }) {
  const c = d.open_case
  const first = d.name.split(' ')[0]
  const shown = [...d.checkins].reverse().find((x) => Object.keys(x.answers).length > 0) ?? null
  return (
    <>
      {c && (
        <section className={`-mx-5 -mt-4 px-5 py-3 ${c.level === 'red' ? 'bg-alert-bg' : 'bg-support-bg'}`}>
          <h3 className={`text-base font-semibold ${c.level === 'red' ? 'text-alert' : 'text-support'}`}>
            {c.state === 'assigned'
              ? `${TIER_LABEL[c.tier]} accepted · on the way`
              : c.overdue
                ? 'Nobody has accepted · ward officer action needed'
                : `Waiting for a ${TIER_LABEL[c.tier].toLowerCase()} to accept`}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm">
            <span>
              Open <WaitingTimer since={c.opened_scenario} now={now} />
            </span>
            {c.state !== 'assigned' && !c.overdue && (
              <span>
                at this tier <WaitingTimer since={c.tier_started_scenario} now={now} />
              </span>
            )}
            {!d.has_neighbour && c.level === 'red' && <span className="text-muted">No neighbour on file</span>}
          </div>
          <div className="mt-2 border-t border-ink/10 pt-2">
            <RuleExplanation ruleId={c.rule_id} reason={c.reason} />
          </div>
        </section>
      )}
      {d.address && (
        <p className="text-sm">
          <span className="text-muted">Address, shown because a volunteer accepted: </span>
          {d.address}
        </p>
      )}

      {shown && (
        <section>
          <h3 className="mb-2 flex items-baseline justify-between text-sm font-semibold">
            Latest welfare check
            <span className="num text-xs font-normal text-muted">
              {fmtTime(shown.at_scenario)} · {shown.is_recall ? 'follow-up call' : `attempt ${shown.attempt}`}
            </span>
          </h3>
          <AnswerTable c={shown} />
          {shown.recording_url && (
            <div className="mt-3">
              <RecordingPlayer src={shown.recording_url} transcript={shown.transcript} />
            </div>
          )}
          {shown.rule_id && !c && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <RuleExplanation ruleId={shown.rule_id} reason={shown.reason} />
              {shown.needs_support && <RuleExplanation ruleId="S1" reason="Needs support" note={false} />}
            </div>
          )}
        </section>
      )}

      <RiskBreakdown r={d} score={d.risk_score} title={`Why Neralu calls ${first}`} />

      <section className="text-sm">
        <h3 className="mb-1 font-semibold">How {first} knows the call is real</h3>
        <p>
          Every call starts with the family code word{' '}
          <span className="font-semibold">{d.code_word[0].toUpperCase() + d.code_word.slice(1)}</span>, chosen by{' '}
          {d.family_name ?? 'their family'}, and says Neralu never asks for money, OTP, Aadhaar or bank details.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Call attempts</h3>
        {d.checkins.length === 0 ? (
          <p className="text-sm text-muted">{d.caregiver_route ? 'Caregiver route · not called directly' : 'Not called yet'}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {d.checkins.map((x) => <AttemptRow key={x.id} x={x} />)}
          </ul>
        )}
      </section>
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
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span>
        <span className="num text-xs text-muted">{fmtTime(x.at_scenario)}</span>{' '}
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

import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Impact } from '../types'
import { fmtTime } from '../time'

/*
 * Same heat day, two columns: what a broadcast heat alert can know, and what Neralu knows. Every number
 * is counted live from today's calls, cases and events; "How each number is counted" says exactly how.
 */
interface Props {
  refreshKey: number
  onClose: () => void
}

export function ImpactPanel({ refreshKey, onClose }: Props) {
  const [d, setD] = useState<Impact | null>(null)
  const [failed, setFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.impact().then((x) => { setD(x); setFailed(false) }).catch(() => setFailed(true))
  }, [refreshKey])

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="impact-title"
      className="drawer-enter fixed inset-y-0 right-0 z-[1000] flex w-[640px] max-w-full flex-col border-l border-line-strong bg-surface text-ink"
    >
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="impact-title" className="text-lg font-medium">Impact: a heat alert against Neralu</h2>
          <p className="mt-0.5 text-sm text-muted">
            {d
              ? `As of ${fmtTime(d.as_of_scenario)} · heat index ${d.weather.heat_index_c.toFixed(1)} °C · counted live from today's calls and visits`
              : failed ? 'Cannot reach the backend.' : 'Loading…'}
          </p>
        </div>
        <button ref={closeRef} onClick={onClose} className="press shrink-0 rounded-ui border border-line px-2 py-1 text-sm text-muted hover:text-ink">
          Close
        </button>
      </header>
      {d && <Body d={d} />}
    </aside>
  )
}

function Body({ d }: { d: Impact }) {
  const n = d.neralu
  const b = d.broadcast
  const p = d.pilot
  const rows: { label: string; key: string; broadcast: string; neralu: string; strong?: boolean }[] = [
    { label: 'Residents reached', key: 'called', broadcast: `${b.alerted} told`, neralu: `${n.called} called${n.called_real ? ` (${n.called_real} real)` : ''}` },
    { label: 'Confirmed safe', key: 'confirmed_safe', broadcast: '0', neralu: String(n.confirmed_safe), strong: true },
    { label: 'Known to need a person', key: 'needed_person', broadcast: 'unknown', neralu: String(n.needed_person), strong: true },
    { label: 'Reached at the door', key: 'reached_in_person', broadcast: '0', neralu: String(n.reached_in_person), strong: true },
  ]
  const pct = p.safe_by_noon.of ? Math.round((100 * p.safe_by_noon.n) / p.safe_by_noon.of) : 0
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {!d.round_started && (
        <p className="mb-4 rounded-ui bg-paper px-3 py-2 text-sm text-muted">
          No call round yet today, so Neralu knows no more than a broadcast does. Start a round to watch this fill in.
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">A broadcast heat alert compared with Neralu, for the same day</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="py-1.5 font-normal" />
            <th scope="col" className="py-1.5 pr-4 text-right font-normal">Broadcast heat alert</th>
            <th scope="col" className="py-1.5 text-right font-normal">Neralu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line">
              <th scope="row" className="py-2.5 pr-3 text-left font-normal" title={d.trace[r.key]}>{r.label}</th>
              <td className="num py-2.5 pr-4 text-right text-muted">{r.broadcast}</td>
              <td className={`num py-2.5 text-right ${r.strong ? 'text-lg font-medium' : ''}`}>{r.neralu}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 text-sm font-medium">Where everyone Neralu called stands now</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        <Stat label="Confirmed safe" value={n.confirmed_safe} tone="text-ok" />
        <Stat label="Follow-up call due" value={n.follow_up} tone="text-watch" />
        <Stat label="Not reached yet, retrying" value={n.not_reached} />
        <Stat label="Waiting for a person" value={n.waiting_for_person} tone={n.waiting_for_person ? 'text-alert' : ''} />
        <Stat label="Call in progress" value={n.in_progress} />
        <Stat label="Checked via caregiver" value={n.caregiver_route} />
      </dl>
      <p className="mt-2 text-xs text-muted">
        Case opened to a volunteer accepting: {mins(n.accept_median_min)} median · to a visit recorded: {mins(n.door_median_min)} median
        (scenario minutes)
      </p>

      <h3 className="mt-6 text-sm font-medium">What a pilot would measure</h3>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <Measure label="Confirmed safe by 12:00" value={`${p.safe_by_noon.n} of ${p.safe_by_noon.of}`} sub={`${pct} % of people due a call`} />
        <Measure label="RED case to a person at the door" value={mins(p.red_to_door_median_min)} sub="median, scenario minutes" />
        <Measure label="Repeat-risk residents" value={String(p.repeat_risk)} sub="two or more concerning results today" />
        <Measure
          label="Volunteer load"
          value={`${p.volunteer_load.visits} visits`}
          sub={p.volunteer_load.responders ? `by ${p.volunteer_load.responders} responders · at most ${p.volunteer_load.max} each` : 'none yet'}
        />
      </dl>

      <details className="mt-6 border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer font-medium">How each number is counted</summary>
        <dl className="mt-2 space-y-1.5 text-muted">
          {Object.entries(d.trace).map(([k, v]) => (
            <div key={k}>
              <dt className="inline font-mono text-xs text-ink">{k}</dt> <dd className="inline">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          A broadcast tells everyone and confirms nothing, so its column is what a one-way alert can know. {d.simulated_note}
        </p>
      </details>
    </div>
  )
}

function mins(x: number | null) {
  return x === null ? 'none yet' : `${Math.round(x)} min`
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line py-1">
      <dt className="text-muted">{label}</dt>
      <dd className={`num font-medium ${tone}`}>{value}</dd>
    </div>
  )
}

function Measure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-ui border border-line px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5 text-xl font-medium">{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </div>
  )
}

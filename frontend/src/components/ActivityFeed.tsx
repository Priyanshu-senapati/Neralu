import { useState } from 'react'
import { fmtTime } from '../time'
import type { NeraluEvent } from '../types'

const TONE: Record<string, string> = {
  case_opened: 'text-alert', tier_overdue: 'text-alert', case_resolved: 'text-ok', checkin_classified: '',
}

const ACTOR: Record<string, string> = {
  system: 'System', rules: 'Rules', twilio: 'Call', volunteer: 'Volunteer', family: 'Family',
  officer: 'Officer', sim: 'Simulation',
}

/** Worth a judge's attention even when it comes from a simulated resident. */
function escalation(e: NeraluEvent) {
  return (e.kind === 'case_opened' && e.data.level === 'red') || e.kind === 'tier_overdue'
}

/** What happened in the ward, newest first. Real residents and escalations by default. */
export function ActivityFeed({ events, onSelect }: { events: NeraluEvent[]; onSelect: (elderId: number) => void }) {
  const [all, setAll] = useState(false)
  const shown = (all ? events : events.filter((e) => !e.simulated || escalation(e))).slice(0, 40)
  const hidden = events.length - events.filter((e) => !e.simulated || escalation(e)).length
  return (
    <section aria-label="Ward activity" className="flex min-h-0 flex-col border-t border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-2">
        <h2 className="text-sm font-semibold">Ward activity</h2>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-[var(--brand)]" />
          Include simulated residents{!all && hidden > 0 && <span className="num"> ({hidden} hidden)</span>}
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          {events.length === 0
            ? 'Nothing yet. Set the weather and start a call round from the demo controls.'
            : 'No real-resident activity yet. Simulated residents are being called in the background.'}
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((e) => (
            <li key={e.id} className="border-b border-line/70 last:border-0">
              <button
                onClick={() => e.elder_id !== null && onSelect(e.elder_id)}
                disabled={e.elder_id === null}
                className="grid w-full grid-cols-[3.25rem_5.5rem_minmax(0,1fr)] items-baseline gap-x-3 px-5 py-1.5 text-left text-sm enabled:hover:bg-paper"
              >
                <span className="num text-xs text-muted">{fmtTime(e.ts_scenario)}</span>
                <span className="truncate text-xs text-muted">
                  {ACTOR[e.actor] ?? e.actor}
                  {e.simulated && ' · sim'}
                </span>
                <span className={`truncate ${TONE[e.kind] ?? ''}`}>{e.message}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

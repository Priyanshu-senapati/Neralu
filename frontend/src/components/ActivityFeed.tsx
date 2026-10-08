import { fmtTime } from '../time'
import type { NeraluEvent } from '../types'

const TONE: Record<string, string> = {
  case_opened: 'text-alert', tier_overdue: 'text-alert', case_resolved: 'text-ok', checkin_classified: '',
}

const ACTOR: Record<string, string> = {
  system: 'System', rules: 'Rules', twilio: 'Call', volunteer: 'Volunteer', family: 'Family',
  officer: 'Officer', sim: 'Simulation',
}

/** What happened in the ward, newest first: real calls, cases, escalations, officer actions. */
export function ActivityFeed({ events, onSelect }: { events: NeraluEvent[]; onSelect: (elderId: number) => void }) {
  return (
    <section aria-label="Ward activity" className="flex min-h-0 flex-col border-t border-line bg-surface">
      <h2 className="border-b border-line px-5 py-2 text-sm font-semibold">Ward activity</h2>
      {events.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nothing yet. Set the weather and start a call round from the demo controls.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {events.map((e) => (
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

import { useLayoutEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../motion'
import { fmtTime } from '../time'
import type { NeraluEvent } from '../types'
import { SimTag } from './StatusPill'

const ACTOR: Record<string, string> = {
  system: 'System', rules: 'Rules', twilio: 'Call', volunteer: 'Volunteer', family: 'Family',
  officer: 'Officer', sim: 'Simulation',
}

const EMPHASIS: Record<string, string> = {
  case_opened: 'text-alert', tier_overdue: 'text-alert', case_resolved: 'text-ok', case_accepted: 'text-ink',
}

export function EventTimeline({ events }: { events: NeraluEvent[] }) {
  const list = useRef<HTMLOListElement>(null)
  const seen = useRef<Set<number> | null>(null)

  // Events that arrive while the drawer is open slide in at the top; the history does not replay.
  useLayoutEffect(() => {
    const ids = new Set(events.map((e) => e.id))
    const fresh = seen.current ? events.filter((e) => !seen.current!.has(e.id)) : []
    seen.current = ids
    if (!fresh.length || reducedMotion() || !list.current) return
    const els = fresh.map((e) => list.current!.querySelector(`[data-event="${e.id}"]`)).filter(Boolean)
    gsap.from(els, { opacity: 0, y: -8, duration: 0.4, stagger: 0.05 })
  }, [events])

  if (events.length === 0) return <p className="text-sm text-muted">No events yet</p>
  return (
    <ol ref={list} className="relative border-l border-line pl-4">
      {[...events].reverse().map((e) => (
        <li key={e.id} data-event={e.id} className="mb-2.5 last:mb-0">
          <span className="absolute -left-[3.5px] mt-1.5 h-1.5 w-1.5 rounded-full bg-muted" />
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-mono tabular-nums">{fmtTime(e.ts_scenario)}</span>
            <span>{ACTOR[e.actor] ?? e.actor}</span>
            {e.simulated && <SimTag />}
          </div>
          <div className={`text-sm ${EMPHASIS[e.kind] ?? ''}`}>{e.message}</div>
        </li>
      ))}
    </ol>
  )
}

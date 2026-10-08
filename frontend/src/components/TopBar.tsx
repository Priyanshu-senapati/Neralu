import { Link } from 'react-router-dom'
import type { Summary } from '../types'
import { fmtDay, fmtTime } from '../time'
import type { StreamStatus } from '../useEventStream'
import { Wordmark } from './Brand'

export function TopBar({ summary, now, stream }: { summary: Summary; now: Date | null; stream: StreamStatus }) {
  const live = stream === 'live'
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-paper px-5 py-2.5">
      <div className="flex items-center gap-4">
        <Link to="/" className="rounded-[3px]" aria-label="About Neralu">
          <Wordmark size="sm" />
        </Link>
        <span className="hidden h-4 w-px bg-line-strong sm:block" aria-hidden="true" />
        <span className="text-sm">
          Ward 47 <span className="text-muted">· demo ward, Bengaluru</span>
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-right leading-tight">
          <span className="block text-xs text-muted">{now ? fmtDay(now) : '—'}</span>
          <span className="num text-base">{now ? fmtTime(now.toISOString()) : '—'}</span>
        </span>
        <span className="hidden rounded-[3px] border border-line px-2 py-1 text-xs text-muted md:inline" title="Timers run faster than real time so a whole day fits in the demo">
          Demo · time ×{summary.demo_speed} · {summary.max_attempts} call attempts (production 3)
        </span>
        <span className={`inline-flex items-center gap-1.5 text-xs ${live ? 'text-ok' : 'text-watch'}`} role="status">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-ok' : 'bg-watch'}`} aria-hidden="true" />
          {live ? 'Live' : 'Reconnecting'}
        </span>
      </div>
    </header>
  )
}

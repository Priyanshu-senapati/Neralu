import { Link } from 'react-router-dom'
import type { Summary } from '../types'
import { fmtDay, fmtTime } from '../time'
import type { StreamStatus } from '../useEventStream'
import { setTheme, useTheme } from '../theme'
import { Wordmark } from './Brand'

/** The console's identity bar: brand, where we are, what time it is in the scenario, and honesty. */
export function TopBar({ summary, now, stream }: { summary: Summary; now: Date | null; stream: StreamStatus }) {
  const live = stream === 'live'
  const theme = useTheme()
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-5 py-2.5 text-ink">
      <div className="flex items-center gap-4">
        <Link to="/" className="rounded-[3px]" aria-label="About Neralu">
          <Wordmark size="sm" />
        </Link>
        <span className="hidden h-4 w-px bg-line-strong sm:block" aria-hidden="true" />
        <span className="text-sm">
          Ward 47 <span className="text-muted">· demo ward, Bengaluru · Heat welfare console</span>
        </span>
      </div>
      <div className="flex items-center gap-5 text-sm">
        <span
          className="hidden rounded-[3px] border border-line-strong px-2 py-0.5 text-xs text-muted md:inline"
          title="Timers run faster than real time so a whole day fits in the demo"
        >
          Demo · time ×{summary.demo_speed} · {summary.max_attempts} call attempts (production 3)
        </span>
        <span className="flex items-baseline gap-2 leading-none">
          <span className="text-xs text-muted">{now ? fmtDay(now) : '—'}</span>
          <span className="num text-lg font-medium">{now ? fmtTime(now.toISOString()) : '—'}</span>
        </span>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-[3px] border border-line-strong px-2 py-0.5 text-xs text-muted hover:text-ink"
          title="Use the light theme if the projector washes out the dark one"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs" role="status">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-ok' : 'bg-watch'}`} />
          </span>
          {live ? 'Live' : 'Reconnecting'}
        </span>
      </div>
    </header>
  )
}

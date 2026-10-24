import { Link } from 'react-router-dom'
import type { Summary } from '../types'
import { fmtDay, fmtTime } from '../time'
import type { StreamStatus } from '../useEventStream'
import { setTheme, useTheme } from '../theme'
import { Wordmark } from './Brand'

/** Demo or pilot, said plainly: how time runs and when calls happen. */
function ModeBadge({ summary }: { summary: Summary }) {
  const p = summary.pilot
  if (summary.run_mode === 'pilot' && p) {
    const rounds = p.round_times.join(' and ')
    const next = !p.forecast_loaded
      ? "waiting for today's forecast"
      : p.next_round ? `next ${p.next_round}` : 'no more rounds today'
    return (
      <span
        className="hidden rounded-[3px] border border-line-strong px-2 py-0.5 text-xs text-muted md:inline"
        title={`Pilot mode: real time. Rounds start by themselves at ${rounds} on today's real forecast; no automatic calls after ${p.calls_until}.`}
      >
        Pilot · real time · rounds {rounds} · {next}
      </span>
    )
  }
  return (
    <span
      className="hidden rounded-[3px] border border-line-strong px-2 py-0.5 text-xs text-muted md:inline"
      title="Timers run faster than real time so a whole day fits in the demo"
    >
      Demo · time ×{summary.demo_speed} · {summary.max_attempts} call attempts (production 3)
    </span>
  )
}

/** The console's identity bar: brand, where we are, what time it is in the scenario, and honesty. */
interface Props {
  summary: Summary
  now: Date | null
  stream: StreamStatus
  onPlan: () => void
  onResponders: () => void
}

export function TopBar({ summary, now, stream, onPlan, onResponders }: Props) {
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
        <ModeBadge summary={summary} />
        <span className="flex items-baseline gap-2 leading-none">
          <span className="text-xs text-muted">{now ? fmtDay(now) : '—'}</span>
          <span className="num text-lg font-medium">{now ? fmtTime(now.toISOString()) : '—'}</span>
        </span>
        <button
          onClick={onPlan}
          className="press rounded-[3px] border border-line-strong px-2 py-0.5 text-xs hover:bg-paper"
          title="Turn a heat forecast into the ward's work plan: calls, cases and responders needed"
        >
          Plan ahead
        </button>
        <button
          onClick={onResponders}
          className="press rounded-[3px] border border-line-strong px-2 py-0.5 text-xs hover:bg-paper"
          title="Volunteers and ASHA workers: who is on duty, on a visit, or being asked"
        >
          Responders
        </button>
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

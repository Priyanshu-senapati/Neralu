import type { Summary } from '../types'
import { fmtDay, fmtTime } from '../time'
import type { StreamStatus } from '../useEventStream'
import { DemoClockBadge } from './DemoClockBadge'
import { WeatherBlock } from './WeatherBlock'

export function TopBar({ summary, now, stream }: { summary: Summary; now: Date | null; stream: StreamStatus }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-5 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-semibold tracking-tight">Neralu</span>
        <span className="text-sm text-muted">Ward 47 · demo ward</span>
      </div>
      <WeatherBlock w={summary.weather} />
      <div className="flex items-center gap-3 text-sm">
        <div className="text-right leading-tight">
          <div className="text-[11px] text-muted">{now ? fmtDay(now) : '—'}</div>
          <div className="font-mono text-base tabular-nums">{now ? fmtTime(now.toISOString()) : '—'}</div>
        </div>
        <div className="leading-tight">
          <div className="text-[11px] text-muted">Round</div>
          <div className="font-mono tabular-nums">{summary.round_no ?? '—'}</div>
        </div>
        <DemoClockBadge speed={summary.demo_speed} maxAttempts={summary.max_attempts} />
        <span
          className={`h-2 w-2 rounded-full ${stream === 'live' ? 'bg-ok' : 'bg-watch'}`}
          title={stream === 'live' ? 'Live updates connected' : 'Reconnecting to live updates'}
        />
      </div>
    </header>
  )
}

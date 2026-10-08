import { fmtTime } from '../time'
import type { LoopStep, StoryLine } from '../loop'
import { SimTag } from './StatusPill'

const TONE_TEXT = { ok: 'text-ok', watch: 'text-watch', alert: 'text-alert' } as const

/** Call → rules → a person → accepted → checked in person → family told. */
export function ClosedLoop({ steps, compact = false }: { steps: LoopStep[]; compact?: boolean }) {
  return (
    <ol aria-label="What happens, step by step" className={compact ? 'space-y-0' : 'space-y-0'}>
      {steps.map((s, i) => (
        <li key={s.key} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-2.5 pb-3 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-[0.6875rem] top-6 bottom-0 w-px ${s.state === 'done' ? 'bg-ink/50' : 'bg-line'}`}
            />
          )}
          <Marker state={s.state} tone={s.tone} />
          <div className="min-w-0">
            <div className={`text-sm ${s.state === 'pending' || s.state === 'skipped' ? 'text-muted' : 'font-semibold'}`}>
              {s.label}
            </div>
            {!compact || s.state !== 'pending' ? (
              <div className={`text-sm ${s.tone && s.state === 'done' ? TONE_TEXT[s.tone] : s.state === 'current' ? '' : 'text-muted'}`}>
                {s.detail}
              </div>
            ) : null}
          </div>
          <span className="num pt-0.5 text-xs text-muted">{s.at ? fmtTime(s.at) : ''}</span>
          <span className="sr-only">{s.state}</span>
        </li>
      ))}
    </ol>
  )
}

function Marker({ state, tone }: { state: LoopStep['state']; tone?: LoopStep['tone'] }) {
  if (state === 'done') {
    const bg = tone === 'alert' ? 'bg-alert' : tone === 'watch' ? 'bg-watch' : tone === 'ok' ? 'bg-ok' : 'bg-ink'
    return (
      <span aria-hidden="true" className={`relative z-10 mt-0.5 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full ${bg}`}>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-surface" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2 5 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span aria-hidden="true" className="relative z-10 mt-0.5 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2 border-ink bg-surface">
        <span className="absolute h-full w-full animate-ping rounded-full border border-ink/40 motion-reduce:hidden" />
        <span className="h-2 w-2 rounded-full bg-ink" />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`relative z-10 mt-0.5 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border bg-surface ${state === 'skipped' ? 'border-dashed border-line-strong' : 'border-line-strong'}`}
    />
  )
}

const STORY_TONE = { ok: 'text-ok', watch: 'text-watch', alert: 'text-alert', muted: 'text-muted' } as const

/** What happened to this person, in plain sentences with times. */
export function ResidentStory({ lines, empty }: { lines: StoryLine[]; empty: string }) {
  if (lines.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ol className="space-y-1.5">
      {lines.map((l) => (
        <li key={l.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 text-sm">
          <span className="num pt-px text-xs text-muted">{fmtTime(l.at)}</span>
          <span className={l.tone ? STORY_TONE[l.tone] : ''}>
            {l.text} {l.simulated && <SimTag />}
          </span>
        </li>
      ))}
    </ol>
  )
}

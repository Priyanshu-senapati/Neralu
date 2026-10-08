import type { ElderListItem, RoundSummary, Summary, WeatherLevel } from '../types'
import { fmtTime } from '../time'
import { AnimatedNumber } from './Motion'

const LEVEL: Record<WeatherLevel, { label: string; cls: string }> = {
  normal: { label: 'Normal for most residents', cls: 'text-muted' },
  caution: { label: 'Caution for vulnerable residents', cls: 'font-semibold text-watch' },
  severe_for_vulnerable: { label: 'Severe for vulnerable residents', cls: 'font-semibold text-alert' },
}

interface Props {
  summary: Summary
  elders: ElderListItem[]
  round: RoundSummary | null
}

/*
 * The ward at a glance, left to right: today's heat against every resident's own threshold, what
 * the call round is doing, and how many people are waiting for a person.
 */
export function SituationBar({ summary, elders, round }: Props) {
  const n = summary.counts
  const open = elders.map((e) => e.open_case).filter((c) => c !== null)
  const waiting = open.filter((c) => c.state === 'open')
  const redWaiting = waiting.filter((c) => c.level === 'red').length
  const accepted = open.length - waiting.length

  return (
    <section aria-label="Ward situation" className="grid border-b border-line bg-surface lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.75fr)]">
      <HeatVsPeople summary={summary} elders={elders} />

      <div className="border-t border-line px-5 py-3.5 lg:border-l lg:border-t-0">
        <RoundProgress round={round} due={n.due_today} />
      </div>

      <div className={`flex flex-col justify-between border-t border-line px-5 py-3.5 transition-colors duration-500 lg:border-l lg:border-t-0 ${waiting.length ? 'bg-alert-bg' : ''}`}>
        <div className={`text-[0.8125rem] ${waiting.length ? 'font-semibold text-alert' : 'text-muted'}`}>Need a person now</div>
        <AnimatedNumber
          value={waiting.length}
          className={`num mt-1 block text-[2.9rem] font-medium leading-none tracking-[-0.03em] ${waiting.length ? 'text-alert' : ''}`}
        />
        <div className={`mt-1.5 text-xs leading-snug ${waiting.length ? 'text-alert/85' : 'text-muted'}`}>
          {waiting.length ? (
            <>
              {[redWaiting && `${redWaiting} RED`, waiting.length - redWaiting && `${waiting.length - redWaiting} needing support`]
                .filter(Boolean)
                .join(', ')}
              <br />
              Nobody has accepted yet.
            </>
          ) : accepted ? (
            `${accepted} accepted, someone is on the way`
          ) : (
            'Nobody is waiting'
          )}
        </div>
      </div>
    </section>
  )
}

/* ---------- Heat vs people ---------- */

const T_MIN = 29
const T_MAX = 40

function HeatVsPeople({ summary, elders }: { summary: Summary; elders: ElderListItem[] }) {
  const w = summary.weather
  const level = LEVEL[w.level]
  const hot = w.level !== 'normal'
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-6 px-5 py-3.5">
      <div>
        <div className="text-[0.8125rem] text-muted">
          Heat index <span className="text-[0.6875rem]">· simulated</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className={`num text-[2.9rem] font-medium leading-none tracking-[-0.04em] transition-colors duration-500 ${hot ? 'text-heat' : ''}`}>
            {w.heat_index_c.toFixed(1)}
          </span>
          <span className={`num text-lg ${hot ? 'text-heat' : 'text-muted'}`}>°C</span>
        </div>
        <div className={`mt-1.5 text-xs ${level.cls}`}>{level.label}</div>
        <div className="num text-[0.6875rem] text-muted">
          {w.temp_c.toFixed(0)}°C · {w.humidity_pct.toFixed(0)}% RH · night {w.night_min_c.toFixed(0)}°C
        </div>
      </div>
      <ThresholdChart elders={elders} heatIndex={w.heat_index_c} due={summary.counts.due_today} total={summary.counts.registered} />
    </div>
  )
}

/** Every resident's personal threshold as a distribution, with today's heat index drawn through it. */
function ThresholdChart({ elders, heatIndex, due, total }: { elders: ElderListItem[]; heatIndex: number; due: number; total: number }) {
  const buckets = Array.from({ length: T_MAX - T_MIN + 1 }, (_, i) => T_MIN + i)
  const counts = buckets.map((t) => elders.filter((e) => Math.round(e.threshold_c) === t).length)
  const peak = Math.max(1, ...counts)
  const W = 300
  const H = 58
  const bw = W / buckets.length
  const clamped = Math.min(Math.max(heatIndex, T_MIN - 0.5), T_MAX + 0.5)
  const x = ((clamped - (T_MIN - 0.5)) / buckets.length) * W
  const over = heatIndex > T_MAX + 0.5
  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 -14 ${W} ${H + 28}`}
        className="h-[84px] w-full overflow-visible"
        role="img"
        aria-label={`${due} of ${total} residents have a personal heat threshold at or below today's heat index of ${heatIndex.toFixed(1)} °C`}
      >
        {buckets.map((t, i) => {
          const h = (counts[i] / peak) * H
          const crossed = t <= heatIndex
          return (
            <rect
              key={t}
              x={i * bw + 1.5}
              y={H - h}
              width={bw - 3}
              height={Math.max(h, counts[i] ? 1.5 : 0)}
              rx={1.5}
              className="transition-[fill,y,height] duration-500"
              fill={crossed ? '#B63D0B' : '#D3CEC1'}
            />
          )
        })}
        <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} stroke="#C9C5B9" />
        {[T_MIN + 1, 33, 36, T_MAX - 1].map((t) => (
          <text key={t} x={(t - T_MIN + 0.5) * bw} y={H + 13} textAnchor="middle" className="fill-muted font-mono text-[0.5938rem]">
            {t}°
          </text>
        ))}
        <g className="transition-transform duration-500" style={{ transform: `translateX(${x}px)` }}>
          <line x1={0} x2={0} y1={-4} y2={H + 4} stroke="#1B1D1A" strokeWidth={1.5} />
          <text x={over ? -4 : 4} y={-5} textAnchor={over ? 'end' : 'start'} className="fill-ink font-mono text-[0.625rem] font-medium">
            today
          </text>
        </g>
      </svg>
      <figcaption className="-mt-1 text-xs text-muted">
        <span className="num font-semibold text-heat">
          <AnimatedNumber value={due} />
        </span>{' '}
        of <span className="num">{total}</span> residents are over their own threshold
      </figcaption>
    </figure>
  )
}

/* ---------- Call round ---------- */

const SEGMENTS: { key: 'GREEN' | 'AMBER' | 'RED' | 'UNREACHED' | 'pending'; label: string; fill: string; text: string }[] = [
  { key: 'GREEN', label: 'Fine', fill: 'bg-ok', text: 'text-ok' },
  { key: 'AMBER', label: 'Follow-up', fill: 'bg-watch', text: 'text-watch' },
  { key: 'RED', label: 'RED', fill: 'bg-alert', text: 'text-alert' },
  { key: 'UNREACHED', label: 'Not reached', fill: 'bg-ink/55', text: 'text-ink' },
  { key: 'pending', label: 'Still calling', fill: 'bg-line', text: 'text-muted' },
]

function RoundProgress({ round, due }: { round: RoundSummary | null; due: number }) {
  if (!round) {
    return (
      <div className="flex h-full flex-col justify-between">
        <div className="text-[0.8125rem] text-muted">Call round</div>
        <div className="mt-2 h-3 rounded-[2px] border border-dashed border-line-strong" />
        <p className="mt-2 text-sm">
          No calls yet. <span className="num font-semibold">{due}</span> {due === 1 ? 'person is' : 'people are'} due a call today.
        </p>
        <p className="text-xs text-muted">Start a round from the demo controls.</p>
      </div>
    )
  }
  const value = (k: (typeof SEGMENTS)[number]['key']) => (k === 'pending' ? round.in_progress : round.outcomes[k] ?? 0)
  const total = Math.max(1, round.called)
  const done = round.called - round.in_progress
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-baseline justify-between text-[0.8125rem] text-muted">
        <span>
          Call round {round.round_no} · started <span className="num">{fmtTime(round.started_scenario)}</span>
        </span>
        <span>
          <span className="num font-semibold text-ink">{done}</span> of <span className="num">{round.called}</span> calls finished
        </span>
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-[2px] bg-line" role="img" aria-label={SEGMENTS.map((s) => `${s.label} ${value(s.key)}`).join(', ')}>
        {SEGMENTS.map((s) => (
          <div
            key={s.key}
            className={`${s.fill} h-full transition-[width] duration-700 ease-out [&:not(:last-child)]:border-r [&:not(:last-child)]:border-surface`}
            style={{ width: `${(value(s.key) / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-2.5 grid grid-cols-5 gap-x-3">
        {SEGMENTS.map((s) => (
          <div key={s.key}>
            <dt className="flex items-center gap-1.5 text-[0.6875rem] text-muted">
              <span className={`h-2 w-2 shrink-0 rounded-[2px] ${s.fill}`} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className={`num text-[1.35rem] leading-tight ${value(s.key) && s.key !== 'pending' ? s.text : ''}`}>
              <AnimatedNumber value={value(s.key)} />
            </dd>
          </div>
        ))}
      </dl>
      {round.caregiver_route > 0 && (
        <p className="mt-1 text-[0.6875rem] text-muted">
          +<span className="num">{round.caregiver_route}</span> on the caregiver route, not called directly
        </p>
      )}
    </div>
  )
}

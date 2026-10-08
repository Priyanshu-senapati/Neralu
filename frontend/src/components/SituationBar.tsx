import type { ElderListItem, Summary, WeatherLevel } from '../types'
import { AnimatedNumber } from './Motion'

const LEVEL: Record<WeatherLevel, { label: string; cls: string }> = {
  normal: { label: 'Normal for most residents', cls: 'text-muted' },
  caution: { label: 'Caution for vulnerable residents', cls: 'text-watch' },
  severe_for_vulnerable: { label: 'Severe for vulnerable residents', cls: 'text-alert' },
}

/**
 * The ward at a glance, in the order an officer reads it: how hot it is, what the call round is
 * doing, and how many people need a person right now. The last one is the loudest thing on screen.
 */
export function SituationBar({ summary, elders }: { summary: Summary; elders: ElderListItem[] }) {
  const { weather: w, counts: n, impact } = summary
  const level = LEVEL[w.level]
  const hot = w.level !== 'normal'
  const open = elders.map((e) => e.open_case).filter((c) => c !== null)
  const waiting = open.filter((c) => c.state === 'open')
  const needPerson = waiting.length
  const redWaiting = waiting.filter((c) => c.level === 'red').length
  const accepted = open.length - waiting.length
  return (
    <section aria-label="Ward situation" className="grid border-b border-line bg-surface lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.6fr)_minmax(0,0.95fr)]">
      {/* Heat */}
      <div className="px-5 py-3.5">
        <div className="flex items-baseline gap-2 text-sm text-muted">
          Heat index
          <span className="rounded-[3px] border border-line px-1 font-mono text-[10px] uppercase tracking-wide">simulated</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-3">
          <span className={`num text-[2.15rem] font-medium leading-none tracking-[-0.02em] transition-colors duration-500 ${hot ? 'text-heat' : ''}`}>
            {w.heat_index_c.toFixed(1)}°C
          </span>
          <span className={`text-sm font-semibold ${level.cls}`}>{level.label}</span>
        </div>
        <div className="num mt-1.5 text-xs text-muted">
          {w.temp_c.toFixed(0)}°C air · {w.humidity_pct.toFixed(0)}% humidity · night stays {w.night_min_c.toFixed(0)}°C
        </div>
      </div>

      {/* Calls */}
      <div className="border-t border-line px-5 py-3.5 lg:border-l lg:border-t-0">
        <p className="text-sm">
          Personal heat threshold crossed for{' '}
          <strong className="num font-semibold"><AnimatedNumber value={n.due_today} /></strong> of{' '}
          <span className="num">{n.registered}</span> registered residents
          {summary.round_no ? <span className="text-muted"> · call round {summary.round_no}</span> : <span className="text-muted"> · no calls yet</span>}
        </p>
        <dl className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
          <Stat label="Being called" value={n.calls_active} />
          <Stat label="Answered" value={impact.checks_completed} />
          <Stat label="Not reached" value={n.unreached_now} />
          <Stat label="Follow-up" value={n.follow_up} tone={n.follow_up ? 'text-watch' : ''} />
          <Stat label="Helped in person" value={impact.people_helped} tone={impact.people_helped ? 'text-ok' : ''} />
        </dl>
      </div>

      {/* Action */}
      <div className={`border-t border-line px-5 py-3.5 transition-colors duration-500 lg:border-l lg:border-t-0 ${needPerson ? 'bg-alert-bg' : ''}`}>
        <div className={`text-sm font-semibold ${needPerson ? 'text-alert' : 'text-muted'}`}>Need a person now</div>
        <div className="mt-0.5 flex items-baseline gap-3">
          <AnimatedNumber value={needPerson} className={`num text-[2.15rem] font-medium leading-none ${needPerson ? 'text-alert' : 'text-ink'}`} />
          <span className="text-xs leading-snug text-muted">
            {needPerson ? (
              <>
                Waiting for someone to accept: <span className="num">{redWaiting}</span> RED,{' '}
                <span className="num">{needPerson - redWaiting}</span> support
              </>
            ) : (
              'Nobody is waiting'
            )}
            {accepted > 0 && (
              <span className="block">
                <span className="num">{accepted}</span> accepted, someone is on the way
              </span>
            )}
          </span>
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>
        <AnimatedNumber value={value} className={`num text-lg leading-tight ${tone}`} />
      </dd>
    </div>
  )
}

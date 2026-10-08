import type { ElderListItem, Summary, WeatherLevel } from '../types'
import { AnimatedNumber } from './Motion'

const LEVEL: Record<WeatherLevel, { label: string; cls: string }> = {
  normal: { label: 'Normal for most residents', cls: 'text-muted' },
  caution: { label: 'Caution for vulnerable residents', cls: 'font-semibold text-watch' },
  severe_for_vulnerable: { label: 'Severe for vulnerable residents', cls: 'font-semibold text-alert' },
}

/*
 * The ward at a glance, read left to right: how hot it is, what the call round is doing, and how
 * many people are waiting for a person. Every zone uses the same three rows (label, value,
 * detail) so labels, numbers and details line up across the whole band.
 */
const ZONE = 'grid grid-rows-[1.25rem_2.6rem_1.1rem] content-center gap-y-1 px-5 py-3.5'
const LABEL = 'self-end text-[13px] leading-none text-muted'
const DETAIL = 'self-start truncate text-xs leading-tight text-muted'

export function SituationBar({ summary, elders }: { summary: Summary; elders: ElderListItem[] }) {
  const { weather: w, counts: n, impact } = summary
  const level = LEVEL[w.level]
  const hot = w.level !== 'normal'
  const open = elders.map((e) => e.open_case).filter((c) => c !== null)
  const waiting = open.filter((c) => c.state === 'open')
  const redWaiting = waiting.filter((c) => c.level === 'red').length
  const accepted = open.length - waiting.length

  return (
    <section aria-label="Ward situation" className="grid border-b border-line bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,0.9fr)]">
      <div className={ZONE}>
        <div className={LABEL}>
          Heat index <span className="text-[11px]">· simulated</span>
        </div>
        <div className="flex items-baseline gap-2 self-end">
          <span className={`num text-[2.4rem] font-medium leading-none tracking-[-0.03em] transition-colors duration-500 ${hot ? 'text-heat' : ''}`}>
            {w.heat_index_c.toFixed(1)}
          </span>
          <span className={`num text-lg leading-none ${hot ? 'text-heat' : 'text-muted'}`}>°C</span>
        </div>
        <div className={DETAIL}>
          <span className={level.cls}>{level.label}</span>
          <span className="num"> · {w.temp_c.toFixed(0)}°C, {w.humidity_pct.toFixed(0)}% RH, night {w.night_min_c.toFixed(0)}°C</span>
        </div>
      </div>

      <div className={`${ZONE} border-t border-line lg:border-l lg:border-t-0`}>
        <div className={`${LABEL} grid grid-cols-5 gap-x-4`}>
          <span>Due today</span>
          <span>Being called</span>
          <span>Answered</span>
          <span>Not reached</span>
          <span>Follow-up</span>
        </div>
        <div className="grid grid-cols-5 items-baseline gap-x-4 self-end">
          <Big value={n.due_today} />
          <Big value={n.calls_active} />
          <Big value={impact.checks_completed} />
          <Big value={n.unreached_now} />
          <Big value={n.follow_up} tone={n.follow_up ? 'text-watch' : ''} />
        </div>
        <div className={DETAIL}>
          Personal heat threshold crossed for <span className="num">{n.due_today}</span> of{' '}
          <span className="num">{n.registered}</span> registered residents
          {summary.round_no ? ` · call round ${summary.round_no}` : ' · no calls yet'}
          {impact.people_helped > 0 && (
            <span className="text-ok"> · <span className="num">{impact.people_helped}</span> helped in person</span>
          )}
        </div>
      </div>

      <div className={`${ZONE} border-t border-line transition-colors duration-500 lg:border-l lg:border-t-0 ${waiting.length ? 'bg-alert-bg' : ''}`}>
        <div className={`${LABEL} ${waiting.length ? 'font-semibold text-alert' : ''}`}>Need a person now</div>
        <AnimatedNumber
          value={waiting.length}
          className={`num self-end text-[2.4rem] font-medium leading-none tracking-[-0.03em] ${waiting.length ? 'text-alert' : ''}`}
        />
        <div className={`${DETAIL} ${waiting.length ? 'text-alert/80' : ''}`}>
          {waiting.length
            ? `${redWaiting} RED, ${waiting.length - redWaiting} support · nobody has accepted yet`
            : accepted
              ? `${accepted} accepted, someone is on the way`
              : 'Nobody is waiting'}
        </div>
      </div>
    </section>
  )
}

function Big({ value, tone = '' }: { value: number; tone?: string }) {
  return <AnimatedNumber value={value} className={`num text-[1.75rem] leading-none tracking-[-0.02em] ${tone}`} />
}

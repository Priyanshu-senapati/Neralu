import { reducedMotion } from '../motion'
import type { DataSource, RiskDetail } from '../types'
import { AnimatedNumber } from './Motion'

/** Short per-factor tag: where this answer came from. */
const SOURCE_TAG: Record<DataSource, string> = { family: 'family form', demo: 'demo persona', simulated: 'simulated' }

interface Props {
  r: RiskDetail
  score: number
  title?: string
  /** where the person's details came from; shown on every factor */
  source?: DataSource
}

export function RiskBreakdown({ r, score, title = 'Why Neralu called today', source }: Props) {
  const over = r.heat_index_c >= r.threshold_c
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="divide-y divide-line border-y border-line text-sm">
        {r.risk_breakdown.map(([label, pts]) => (
          <li key={label} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0">{label}</span>
            <span className="flex items-baseline gap-3">
              {source && <span className={`text-xs text-muted ${source === 'simulated' ? 'font-mono' : ''}`}>{SOURCE_TAG[source]}</span>}
              <span className="font-mono tabular-nums text-muted">+{pts}</span>
            </span>
          </li>
        ))}
        <li className="flex justify-between py-1.5 font-semibold">
          <span>Vulnerability score</span>
          <AnimatedNumber value={score} from={reducedMotion() ? score : 0} className="font-mono tabular-nums" />
        </li>
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-ui border border-line px-3 py-2">
          <div className="text-xs text-muted">Personal threshold</div>
          <div className="font-mono tabular-nums">{r.threshold_c.toFixed(1)} °C</div>
          {r.night_min_c >= 26 && <div className="text-xs text-muted">−1 °C: night stays at {r.night_min_c} °C</div>}
        </div>
        <div className={`rounded-ui border px-3 py-2 ${over ? 'border-heat/40 bg-alert-bg' : 'border-line'}`}>
          <div className="text-xs text-muted">Today's heat index</div>
          <div className={`font-mono tabular-nums ${over ? 'text-heat' : ''}`}>{r.heat_index_c.toFixed(1)} °C</div>
          <div className="text-xs text-muted">{over ? 'Above threshold · call due' : 'Below threshold'}</div>
        </div>
      </div>
      {(r.risk_source || r.weather_source) && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {r.risk_source && (<><dt className="text-muted">Risk factors from</dt><dd>{r.risk_source}</dd></>)}
          {r.weather_source && (<><dt className="text-muted">Heat index from</dt><dd>{r.weather_source}</dd></>)}
        </dl>
      )}
      <p className="mt-1.5 text-xs text-muted">Thresholds are starting values to be calibrated in a pilot.</p>
    </div>
  )
}

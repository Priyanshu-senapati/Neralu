import { useLayoutEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../motion'
import type { RiskDetail } from '../types'
import { AnimatedNumber } from './Motion'

export function RiskBreakdown({ r, score }: { r: RiskDetail; score: number }) {
  const over = r.heat_index_c >= r.threshold_c
  const root = useRef<HTMLDivElement>(null)

  // Mounted once per resident: the factors add up line by line, then the verdict lands.
  useLayoutEffect(() => {
    if (reducedMotion() || !root.current) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline()
      tl.from('[data-factor]', { opacity: 0, x: -6, duration: 0.35, stagger: 0.06 })
        .from('[data-compare]', { opacity: 0, y: 6, duration: 0.4, stagger: 0.08 }, '-=0.1')
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root}>
      <h3 className="mb-2 text-sm font-semibold">Why Neralu called today</h3>
      <ul className="divide-y divide-line rounded-ui border border-line text-sm">
        {r.risk_breakdown.map(([label, pts]) => (
          <li key={label} data-factor className="flex justify-between px-3 py-1.5">
            <span>{label}</span>
            <span className="font-mono tabular-nums text-muted">+{pts}</span>
          </li>
        ))}
        <li data-factor className="flex justify-between px-3 py-1.5 font-semibold">
          <span>Vulnerability score</span>
          <AnimatedNumber value={score} from={reducedMotion() ? score : 0} className="font-mono tabular-nums" />
        </li>
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div data-compare className="rounded-ui border border-line px-3 py-2">
          <div className="text-xs text-muted">Personal threshold</div>
          <div className="font-mono tabular-nums">{r.threshold_c.toFixed(1)} °C</div>
          {r.night_min_c >= 26 && <div className="text-xs text-muted">−1 °C: night stays at {r.night_min_c} °C</div>}
        </div>
        <div data-compare className={`rounded-ui border px-3 py-2 ${over ? 'border-heat/40 bg-alert-bg' : 'border-line'}`}>
          <div className="text-xs text-muted">Today's heat index</div>
          <div className={`font-mono tabular-nums ${over ? 'text-heat' : ''}`}>{r.heat_index_c.toFixed(1)} °C</div>
          <div className="text-xs text-muted">{over ? 'Above threshold · call due' : 'Below threshold'}</div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">Thresholds are starting values to be calibrated in a pilot.</p>
    </div>
  )
}

import type { PlanRound, WardPlan, WhatIf } from '../types'

/** The planner's result: one plain sentence, now against the scenario, and each round's workload. */
export function PlanCompare({ data }: { data: WhatIf }) {
  const { baseline: now, scenario: s } = data
  return (
    <div className="space-y-6">
      <Headline plan={s} />
      <CompareTable now={now} s={s} />
      {s.rounds.some((r) => r.calls > 0) && (
        <section aria-labelledby="wi-rounds">
          <h3 id="wi-rounds" className="text-sm font-medium">Responders at the busiest time of each round</h3>
          <div className="mt-2 space-y-3">
            {s.rounds.filter((r) => r.calls > 0).map((r) => (
              <RoundWorkload key={r.round_no} r={r} onDuty={s.responders_on_duty} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="wi-how" className="border-t border-line pt-4">
        <h3 id="wi-how" className="text-sm font-medium">How these numbers are worked out</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
          {data.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>
    </div>
  )
}

function weatherLabel(p: WardPlan) {
  const w = p.weather
  if (w.source === 'open-meteo' && w.observed_at) {
    const d = new Date(`${w.observed_at}:00`)
    const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    return `Real forecast, Open-Meteo, ${day} ${w.observed_at.slice(-5)}`
  }
  return 'Simulated weather'
}

const approx = (x: number) => (x > 0 && x < 1 ? '<1' : `~${Math.round(x)}`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const span = (w: string) => w.replace('–', ' to ')

function Headline({ plan: s }: { plan: WardPlan }) {
  const hi = s.weather.heat_index_c.toFixed(1)
  const worst = [...s.rounds].sort((a, b) => b.short - a.short || b.responders_needed - a.responders_needed)[0]
  let text: string
  let tone = 'text-ink'
  if (s.calls === 0) {
    text = `At a heat index of ${hi} °C nobody in the ward crosses their own threshold: no calls needed.`
  } else {
    const lead = `At a heat index of ${hi} °C: ${plural(s.calls, 'call', 'calls')}, ${approx(s.cases)} ${s.cases > 0 && s.cases <= 1.5 ? 'case' : 'cases'} needing a person, ${plural(s.responders_on_duty, 'responder', 'responders')} on duty`
    if (s.short > 0) {
      text = `${lead} → ${s.short} short from ${span(worst.window)}.`
      tone = 'text-alert'
    } else {
      text = `${lead} → enough (${s.peak_needed} needed at the busiest time, ${span(worst.window)}).`
    }
  }
  return (
    <div>
      <p className="text-xs text-muted">{weatherLabel(s)} · outcomes simulated</p>
      <p className={`mt-1 text-[1.0625rem] font-medium leading-snug ${tone}`} aria-live="polite">{text}</p>
    </div>
  )
}

function CompareTable({ now, s }: { now: WardPlan; s: WardPlan }) {
  const rows: { label: string; a: number; b: number; fmt?: (x: number) => string; bad?: boolean }[] = [
    { label: 'Heat index (°C)', a: now.weather.heat_index_c, b: s.weather.heat_index_c, fmt: (x) => x.toFixed(1) },
    { label: 'Residents over their own threshold', a: now.over_threshold, b: s.over_threshold },
    ...s.rounds.map((r, i) => ({ label: `Calls in round ${r.round_no} (${r.at})`, a: now.rounds[i]?.calls ?? 0, b: r.calls })),
    {
      label: 'Expected follow-up calls',
      a: sum(now.rounds, (r) => r.expected.follow_up),
      b: sum(s.rounds, (r) => r.expected.follow_up),
      fmt: approx,
    },
    { label: 'Expected cases needing a person', a: now.cases, b: s.cases, fmt: approx },
    { label: 'Responders needed at the busiest time', a: now.peak_needed, b: s.peak_needed },
    { label: 'Responders short', a: now.short, b: s.short, bad: s.short > 0 },
  ]
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">The ward now compared with the scenario</caption>
      <thead>
        <tr className="border-b border-line text-left text-xs text-muted">
          <th scope="col" className="py-1.5 font-normal" />
          <th scope="col" className="py-1.5 text-right font-normal">Now</th>
          <th scope="col" className="py-1.5 text-right font-normal">Scenario</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const f = r.fmt ?? String
          return (
            <tr key={r.label} className="border-b border-line">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">{r.label}</th>
              <td className="num py-1.5 text-right text-muted">{f(r.a)}</td>
              <td className={`num py-1.5 text-right font-medium ${r.bad ? 'text-alert' : ''}`}>{f(r.b)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RoundWorkload({ r, onDuty }: { r: PlanRound; onDuty: number }) {
  const slots = Math.max(r.responders_needed, onDuty)
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-x-3 text-sm">
        <span>
          Round {r.round_no} · {plural(r.calls, 'call', 'calls')}{r.real_calls ? ` (${r.real_calls} real)` : ''}
          {r.caregiver_route ? ` · ${r.caregiver_route} to caregivers` : ''}
        </span>
        <span className="text-muted">cases arrive {r.window}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1" role="img"
        aria-label={`${r.responders_needed} responders needed, ${onDuty} on duty${r.short ? `, ${r.short} short` : ''}`}>
        {Array.from({ length: slots }, (_, i) => {
          const needed = i < r.responders_needed
          const covered = i < onDuty
          const cls = needed && !covered
            ? 'border-alert bg-alert-bg'
            : needed ? 'border-ink bg-ink' : 'border-line-strong'
          return <span key={i} className={`h-3.5 w-3.5 rounded-[2px] border ${cls}`} />
        })}
      </div>
      <p className="mt-1 text-xs text-muted">
        {r.responders_needed} needed · {onDuty} on duty
        {r.short ? <span className="font-medium text-alert"> · {r.short} short</span> : ''}
        {' '}· one square per responder (red: needed, not on duty)
      </p>
    </div>
  )
}

function sum(rounds: PlanRound[], f: (r: PlanRound) => number) {
  return rounds.reduce((t, r) => t + f(r), 0)
}

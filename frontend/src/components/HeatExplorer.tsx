import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Reveal } from './Reveal'
import { EXAMPLE_HEAT, personalThreshold } from '../heat'
import type { ElderListItem } from '../types'

/*
 * "Move the afternoon": every registered resident of the demo ward as one square, sorted by their
 * personal heat threshold. Drag the heat and the squares of the people Neralu would call turn hot.
 */
const threshold = personalThreshold

const MIN = 30
const MAX = 42

export function HeatExplorer() {
  const [elders, setElders] = useState<ElderListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [heat, setHeat] = useState(EXAMPLE_HEAT)
  const [warmNight, setWarmNight] = useState(false)

  useEffect(() => {
    api.elders().then(setElders).catch(() => setFailed(true))
  }, [])

  const people = useMemo(
    () =>
      (elders ?? [])
        .map((e) => ({ e, t: threshold(e.risk_score, warmNight) }))
        .sort((a, b) => a.t - b.t || b.e.risk_score - a.e.risk_score),
    [elders, warmNight],
  )
  const called = people.filter((p) => p.t <= heat).length
  const kamala = people.find((p) => !p.e.is_simulated)
  const kamalaCalled = kamala ? kamala.t <= heat : false

  return (
    <section aria-labelledby="explore-title" className="border-y border-line bg-sand">
      <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <Reveal>
          <h2 id="explore-title" className="display text-[2.4rem] font-medium leading-[1.05]">
            Heat warnings are city&#8209;wide. <span className="italic text-brand">Risk is personal.</span>
          </h2>
          </Reveal>
          <p className="mt-5 text-[1.0625rem] leading-relaxed text-ink/80">
            Every square is one resident of the demo ward, ordered by their own heat threshold, worked out from what
            their family told us: age, living alone, the roof, a fan, medicines that make heat harder. Move the
            afternoon and watch who Neralu would call.
          </p>

          <div className="mt-8">
            <label htmlFor="heat" className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Afternoon heat index</span>
              <span className="num oled text-[2.75rem] font-medium leading-none tracking-[-0.04em] text-heat">
                {heat.toFixed(1)}
                <span className="text-lg">°C</span>
              </span>
            </label>
            <input
              id="heat"
              type="range"
              min={MIN}
              max={MAX}
              step={0.1}
              value={heat}
              onChange={(e) => setHeat(Number(e.target.value))}
              aria-valuetext={`${heat.toFixed(1)} degrees, ${called} people would be called`}
              className="heat-range mt-3 w-full"
            />
            <div className="num mt-1 flex justify-between text-xs text-muted">
              <span>{MIN}°C</span>
              <span>{MAX}°C</span>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={warmNight} onChange={(e) => setWarmNight(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" />
              <span>
                The night stays above 26°C <span className="text-muted">(bodies cannot cool down, so thresholds drop 1°C)</span>
              </span>
            </label>
          </div>

          <div className="mt-8 border-t border-line pt-5">
            <p className="text-[1.0625rem]">
              <span className="num oled text-[1.75rem] font-medium text-heat">{elders ? called : '—'}</span>{' '}
              <span className="text-ink/80">of {elders?.length ?? '—'} residents would get a call today.</span>
            </p>
            {kamala && (
              <p className="mt-2 text-sm text-ink/80">
                <span className="mr-1.5 inline-block h-2.5 w-2.5 translate-y-[1px] rounded-[2px] outline outline-2 outline-offset-1 outline-ink" aria-hidden="true" />
                Kamala R., 74, threshold <span className="num">{kamala.t}°C</span>:{' '}
                <span className={kamalaCalled ? 'font-semibold text-heat' : ''}>{kamalaCalled ? 'Neralu calls her.' : 'not yet.'}</span>
              </p>
            )}
            <p className="mt-4 text-xs text-muted">
              Demo ward data. Thresholds use Neralu's risk rules and are starting values to be calibrated in a pilot.
            </p>
          </div>
        </div>

        <figure className="self-center">
          {failed && (
            <p className="text-sm text-muted">The demo ward is not reachable right now. Start the Neralu backend to explore it.</p>
          )}
          {!failed && (
            <div
              className="grid gap-[3px]"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14px, 1fr))' }}
              role="img"
              aria-label={`${called} of ${people.length} residents over their threshold at ${heat.toFixed(1)} degrees`}
            >
              {(elders ? people : Array.from({ length: 401 }, () => null)).map((p, i) => {
                const on = p ? p.t <= heat : false
                const isKamala = p && !p.e.is_simulated
                return (
                  <span
                    key={p ? p.e.id : i}
                    title={p ? `${p.e.name}, ${p.e.age} · threshold ${p.t}°C` : undefined}
                    className={`aspect-square rounded-[2px] transition-colors duration-300 ${
                      !p ? 'animate-pulse bg-line' : on ? (p.e.risk_score >= 60 ? 'bg-heat' : 'bg-[#E08A4F]') : 'bg-line-strong'
                    } ${isKamala ? 'outline outline-2 outline-offset-1 outline-ink' : ''}`}
                    style={{ transitionDelay: p ? `${Math.min(i, 400) * 0.6}ms` : undefined }}
                  />
                )
              })}
            </div>
          )}
          <figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-heat" />Called, high risk</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#E08A4F]" />Called</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-line-strong" />Below their threshold</span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

import { forwardRef } from 'react'
import { SimTag } from '../StatusPill'
import { isCalled, topFactors, type Household } from './orbitPhysics'

/**
 * The card for one household in the orbit hero: who they are, their own threshold, and whether
 * today's heat calls them. The canvas loop moves it with the dot (a transform on this element),
 * so React renders it only when the household or the heat label changes.
 */
export const OrbitTooltip = forwardRef<HTMLDivElement, { household: Household | null; H: number; announce: boolean }>(
  function OrbitTooltip({ household: h, H, announce }, ref) {
    const called = h ? isCalled(h.threshold, H) : false
    // Age is shown as a number, so the two factors are the heaviest of the rest.
    const factors = h ? topFactors(h.factors.filter((f) => !f.startsWith('Age'))) : []
    const example = h ? h.age === null : false
    return (
      <div
        ref={ref}
        role={announce ? 'status' : undefined}
        className="pointer-events-none absolute left-0 top-0 z-10 w-[15.5rem] rounded-[6px] border border-line-strong bg-surface px-3.5 py-3 text-sm text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] transition-opacity duration-150"
        style={{ opacity: h ? 1 : 0, visibility: h ? 'visible' : 'hidden' }}
      >
        {h && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{h.name}</span>
              {h.kamala ? (
                <span className="shrink-0 rounded-ui border border-line px-1 font-mono text-xs text-muted">demo persona</span>
              ) : example ? (
                <span className="shrink-0 rounded-ui border border-line px-1 font-mono text-xs text-muted">example</span>
              ) : (
                h.simulated && <SimTag />
              )}
            </div>
            {(h.age !== null || factors.length > 0) && (
              <div className="mt-0.5 text-muted">
                {h.age !== null && <span className="num">{h.age}</span>}
                {factors.map((f, i) => (h.age !== null || i > 0 ? ` · ${f}` : f))}
              </div>
            )}
            <div className="mt-2 border-t border-line pt-2">
              Own threshold <span className="num font-medium">{h.threshold.toFixed(0)} °C</span>
            </div>
            <div className={`mt-0.5 font-medium ${called ? 'text-heat' : 'text-muted'}`}>
              {called ? (
                <>Called today at <span className="num">{H.toFixed(1)} °C</span></>
              ) : (
                'Not called: below their threshold'
              )}
            </div>
            {h.kamala && <div className="mt-1.5 text-xs text-muted">Her call plays further down this page.</div>}
          </>
        )}
      </div>
    )
  },
)

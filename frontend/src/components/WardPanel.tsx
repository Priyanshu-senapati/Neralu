import { lazy, Suspense, useState } from 'react'
import { elderStatus } from '../status'
import { useTheme } from '../theme'
import type { ElderListItem } from '../types'
import { WardMap } from './WardMap'
import type { WardView } from './WardScene'

const WardScene = lazy(() => import('./WardScene'))

/*
 * The console's map area: a control bar (3D ward or street map; heat risk or today's checks), a
 * live counts strip that doubles as the legend, then the map itself. The 3D ward is the default
 * on the dark theme; the street map is the default on light, where real roads read well.
 */

type Mode = '3d' | 'street'
const MODE_KEY = 'neralu-ward-map'

const STATUS_KEYS = [
  { tone: 'ok', label: 'Fine', dot: 'bg-ok' },
  { tone: 'watch', label: 'Follow-up', dot: 'bg-watch' },
  { tone: 'alert', label: 'RED', dot: 'bg-alert' },
  { tone: 'support', label: 'Support', dot: 'bg-support' },
  { tone: 'neutral', label: 'No result yet', dot: 'bg-line-strong' },
] as const
const RISK_KEYS = [
  { label: 'High risk', min: 60, dot: 'bg-[#e8622e]' },
  { label: 'Medium', min: 35, dot: 'bg-[#ee9a45]' },
  { label: 'Lower', min: 0, dot: 'bg-[#59645e]' },
] as const

interface Props {
  elders: ElderListItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  calling: boolean
  now: Date | null
}

export function WardPanel({ elders, selectedId, onSelect, calling, now }: Props) {
  const theme = useTheme()
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY)
      if (saved === '3d' || saved === 'street') return saved
    } catch {
      /* ignore */
    }
    return document.documentElement.dataset.theme === 'light' ? 'street' : '3d'
  })
  const choose = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
  }

  // Risk before calls, today's checks once a round starts, until the officer picks.
  const [chosen, setChosen] = useState<WardView | null>(null)
  const view: WardView = chosen ?? (calling ? 'status' : 'risk')

  const tones = elders.map((e) => elderStatus(e).tone as string)
  const count = (t: string) => tones.filter((x) => x === t).length

  return (
    <section aria-label="Ward map" className="flex min-h-0 flex-1 flex-col bg-[var(--map-bg)]" data-theme-key={theme}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
        <Segmented
          label="Map"
          value={mode}
          options={[
            ['3d', '3D ward'],
            ['street', 'Street map'],
          ]}
          onChange={(v) => choose(v as Mode)}
        />
        <Segmented
          label="Shows"
          value={view}
          options={[
            ['risk', 'Heat risk'],
            ['status', "Today's checks"],
          ]}
          onChange={(v) => setChosen(v as WardView)}
        />
        <ul className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {view === 'status'
            ? STATUS_KEYS.map((k) => (
                <li key={k.tone} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-[2px] ${k.dot}`} aria-hidden="true" />
                  <span className="text-muted">{k.label}</span>
                  <span className="num font-semibold">{count(k.tone)}</span>
                </li>
              ))
            : RISK_KEYS.map((k, i) => (
                <li key={k.label} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-[2px] ${k.dot}`} aria-hidden="true" />
                  <span className="text-muted">{k.label}</span>
                  <span className="num font-semibold">
                    {elders.filter((e) => e.risk_score >= k.min && (i === 0 || e.risk_score < RISK_KEYS[i - 1].min)).length}
                  </span>
                </li>
              ))}
        </ul>
      </div>
      <div className="relative min-h-0 flex-1">
        {mode === '3d' ? (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted">Loading the 3D ward…</div>}>
            <WardScene elders={elders} selectedId={selectedId} onSelect={onSelect} view={view} now={now} className="h-full w-full" />
          </Suspense>
        ) : (
          <div className="flex h-full flex-col">
            <WardMap elders={elders} selectedId={selectedId} onSelect={onSelect} calling={calling} view={view} />
          </div>
        )}
      </div>
    </section>
  )
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[5px] border border-line-strong bg-surface p-0.5 text-sm">
      {options.map(([v, text]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-[3px] px-3 py-1 transition-colors ${value === v ? 'bg-ink font-semibold text-paper' : 'text-muted hover:text-ink'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

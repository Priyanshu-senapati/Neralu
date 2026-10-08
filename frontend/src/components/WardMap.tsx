import 'leaflet/dist/leaflet.css'
import { memo, useEffect, useState } from 'react'
import { AttributionControl, CircleMarker, MapContainer, Polygon, TileLayer, Tooltip } from 'react-leaflet'
import { elderStatus, toneHex } from '../status'
import { token, useTheme } from '../theme'
import type { ElderListItem } from '../types'


// Ward 47's demo boundary: the seeded residents' box (seed.py) with a small margin.
const WARD: [number, number][] = [
  [12.925 - 0.0102, 77.5838 - 0.0104],
  [12.925 + 0.0102, 77.5838 - 0.0104],
  [12.925 + 0.0102, 77.5838 + 0.0104],
  [12.925 - 0.0102, 77.5838 + 0.0104],
]
const WORLD: [number, number][] = [[-89, -179], [89, -179], [89, 179], [-89, 179]]

type View = 'risk' | 'status'

/** Heat-risk bands from the vulnerability score (same cut-offs as the resident profile). */
const RISK = [
  { min: 60, label: 'High risk', fill: '#B63D0B' },
  { min: 35, label: 'Medium risk', fill: '#E08A4F' },
  { min: 0, label: 'Lower risk', fill: '#8a8f86' },
]
const riskOf = (score: number) => RISK.find((r) => score >= r.min)!

interface Props {
  elders: ElderListItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  /** True once a call round has started; the map then defaults to today's checks. */
  calling: boolean
  /** When the parent controls the view (the ward panel), the map shows no toggle of its own. */
  view?: View
}

// Memoised: the dashboard re-renders every 500 ms for the scenario clock; the map only needs to
// redraw its ~400 markers when residents, the selection or the view change.
export const WardMap = memo(function WardMap({ elders, selectedId, onSelect, calling, view: forced }: Props) {
  // Re-read colours when the theme changes (Leaflet needs concrete colour strings).
  const theme = useTheme()
  const INK = token('--ink')
  const RING = token('--paper')
  const TONE_HEX = { ok: toneHex('ok'), watch: toneHex('watch'), support: toneHex('support'), alert: toneHex('alert'), neutral: toneHex('neutral') }
  const [own, setView] = useState<View>(calling ? 'status' : 'risk')
  const view = forced ?? own
  const [touched, setTouched] = useState(false)
  // Follow the round (risk before calls, checks during them) until the officer picks a view.
  useEffect(() => {
    if (!touched) setView(calling ? 'status' : 'risk')
  }, [calling, touched])

  const ordered = [...elders].sort((a, b) => rank(a, view) - rank(b, view))
  return (
    <section aria-label="Ward map" className="relative isolate min-h-0 flex-1 overflow-hidden bg-[var(--map-bg)]" data-theme-key={theme}>
      <MapContainer bounds={WARD} boundsOptions={{ padding: [6, 6] }} zoomSnap={0.25} zoomControl={false} className="h-full w-full" attributionControl={false}>
        <AttributionControl position="bottomleft" prefix={false} />
        {/* Esri Light Gray Canvas: no POI icons, faint labels. Muted further in CSS. */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          className="neralu-tiles"
          maxZoom={16}
        />
        {/* Everything outside the ward recedes; the ward boundary is drawn once, quietly. */}
        <Polygon positions={[WORLD, WARD]} interactive={false} pathOptions={{ stroke: false, fillColor: token('--paper'), fillOpacity: theme === 'dark' ? 0.55 : 0.62 }} />
        <Polygon positions={WARD} interactive={false} pathOptions={{ color: token('--brand'), weight: 1.5, dashArray: '5 4', fill: false }} />
        {ordered.map((e) => {
          const selected = e.id === selectedId
          const real = !e.is_simulated
          if (view === 'risk') {
            const r = riskOf(e.risk_score)
            return (
              <CircleMarker
                key={e.id}
                center={[e.lat, e.lng]}
                radius={selected ? 9 : real ? 7.5 : 2.5 + e.risk_score / 22}
                pathOptions={{
                  color: selected || real ? INK : RING,
                  weight: selected || real ? 2 : 0.8,
                  fillColor: r.fill,
                  fillOpacity: r.min === 0 ? 0.7 : 0.9,
                }}
                eventHandlers={{ click: () => onSelect(e.id) }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  {e.name} · {r.label} ({e.risk_score})
                </Tooltip>
              </CircleMarker>
            )
          }
          const s = elderStatus(e)
          return (
            <CircleMarker
              key={e.id}
              center={[e.lat, e.lng]}
              radius={selected ? 9 : real ? 8 : s.tone === 'neutral' || s.tone === 'ok' ? 4 : 6.5}
              pathOptions={{
                color: selected || real ? INK : RING,
                weight: selected || real ? 2 : 0.8,
                fillColor: TONE_HEX[s.tone],
                fillOpacity: s.tone === 'neutral' ? 0.55 : 0.92,
              }}
              eventHandlers={{ click: () => onSelect(e.id) }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                {e.name} · {s.label}
              </Tooltip>
            </CircleMarker>
          )
        })}
        {/* Unaccepted RED cases breathe: someone is waiting and nobody has said "I'm going" yet. */}
        {view === 'status' &&
          elders
            .filter((e) => e.open_case?.level === 'red' && e.open_case.state === 'open')
            .map((e) => (
              <CircleMarker
                key={`pulse-${e.id}`}
                center={[e.lat, e.lng]}
                radius={12}
                interactive={false}
                pathOptions={{ color: TONE_HEX.alert, weight: 2, fill: false, className: 'neralu-pulse' }}
              />
            ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex flex-wrap items-start justify-between gap-2">
        {forced === undefined ? (
        <div role="radiogroup" aria-label="Map shows" className="pointer-events-auto inline-flex rounded-[5px] border border-line-strong bg-surface p-0.5 text-sm shadow-[0_1px_2px_rgba(27,29,26,0.06)]">
          {(
            [
              ['risk', 'Heat risk'],
              ['status', "Today's checks"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              onClick={() => {
                setTouched(true)
                setView(v)
              }}
              className={`rounded-[3px] px-3 py-1 transition-colors ${view === v ? 'bg-ink font-semibold text-paper' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        ) : (
          <span />
        )}
        {forced === undefined && <Legend view={view} tones={TONE_HEX} />}
      </div>
    </section>
  )
})

function rank(e: ElderListItem, view: View) {
  if (!e.is_simulated) return 9
  if (view === 'risk') return e.risk_score
  const t = elderStatus(e).tone
  return t === 'neutral' ? 0 : t === 'ok' ? 1 : t === 'support' ? 2 : t === 'watch' ? 3 : 4
}

function Legend({ view, tones: TONE_HEX }: { view: View; tones: Record<string, string> }) {
  const items: [string, string][] =
    view === 'risk'
      ? RISK.map((r) => [r.fill, r.label])
      : [
          [TONE_HEX.ok, 'Fine'],
          [TONE_HEX.watch, 'Follow-up'],
          [TONE_HEX.support, 'Needs support'],
          [TONE_HEX.alert, 'RED'],
          [TONE_HEX.neutral, 'Not reached yet'],
        ]
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[5px] border border-line bg-surface/95 px-2.5 py-1.5 text-xs shadow-[0_1px_2px_rgba(27,29,26,0.06)]">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-ink" />
        Real phone
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-[1.5px] border-dashed border-brand" />
        Ward 47 (demo)
      </span>
    </div>
  )
}

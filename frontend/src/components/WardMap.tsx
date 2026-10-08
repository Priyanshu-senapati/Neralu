import 'leaflet/dist/leaflet.css'
import { memo } from 'react'
import { AttributionControl, CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import { elderStatus, TONE_HEX } from '../status'
import type { ElderListItem } from '../types'

const CENTER: [number, number] = [12.925, 77.5838]

interface Props {
  elders: ElderListItem[]
  selectedId: number | null
  onSelect: (id: number) => void
}

// Memoised: the dashboard re-renders every 500 ms for the scenario clock; the map only needs to
// redraw its ~400 markers when residents or the selection change.
export const WardMap = memo(function WardMap({ elders, selectedId, onSelect }: Props) {
  // Draw calm dots first so coloured statuses sit on top.
  const ordered = [...elders].sort((a, b) => rank(a) - rank(b))
  return (
    <section aria-label="Ward map" className="relative isolate min-h-0 flex-1 overflow-hidden bg-sunken">
      <MapContainer center={CENTER} zoom={15} zoomControl={false} className="h-full w-full" attributionControl={false}>
        <AttributionControl position="bottomleft" prefix={false} />
        {/* CARTO basemaps now require an API key; OSM tiles are desaturated in CSS to stay quiet. */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          className="neralu-tiles"
          maxZoom={19}
        />
        {ordered.map((e) => {
          const s = elderStatus(e)
          const selected = e.id === selectedId
          const real = !e.is_simulated
          return (
            <CircleMarker
              key={e.id}
              center={[e.lat, e.lng]}
              radius={selected ? 9 : real ? 7 : s.tone === 'neutral' || s.tone === 'ok' ? 3.5 : 5.5}
              pathOptions={{
                color: selected || real ? '#1B1D1A' : TONE_HEX[s.tone],
                weight: selected || real ? 2 : 1,
                fillColor: TONE_HEX[s.tone],
                fillOpacity: s.tone === 'neutral' ? 0.45 : 0.85,
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
        {elders
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
      <Legend />
    </section>
  )
})

function rank(e: ElderListItem) {
  if (!e.is_simulated) return 5
  const t = elderStatus(e).tone
  return t === 'neutral' ? 0 : t === 'ok' ? 1 : t === 'support' ? 2 : t === 'watch' ? 3 : 4
}

function Legend() {
  const items: [string, string][] = [
    [TONE_HEX.ok, 'Fine'],
    [TONE_HEX.watch, 'Follow-up'],
    [TONE_HEX.support, 'Needs support'],
    [TONE_HEX.alert, 'RED'],
    [TONE_HEX.neutral, 'Not reached yet'],
    ['#1B1D1A', 'Real phone (ringed)'],
  ]
  return (
    <div className="absolute left-3 top-3 z-[400] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-[3px] border border-line bg-surface/95 px-2.5 py-1.5 text-xs">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  )
}

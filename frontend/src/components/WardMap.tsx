import 'leaflet/dist/leaflet.css'
import { AttributionControl, CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import { elderStatus, TONE_HEX } from '../status'
import type { ElderListItem } from '../types'

const CENTER: [number, number] = [12.925, 77.5838]

interface Props {
  elders: ElderListItem[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export function WardMap({ elders, selectedId, onSelect }: Props) {
  // Draw calm dots first so coloured statuses sit on top.
  const ordered = [...elders].sort((a, b) => rank(a) - rank(b))
  return (
    <section className="relative isolate min-h-0 overflow-hidden rounded-ui border border-line bg-surface">
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
                color: selected || real ? '#1C1C1A' : TONE_HEX[s.tone],
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
      </MapContainer>
      <Legend />
    </section>
  )
}

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
    ['#1C1C1A', 'Real phone (outlined)'],
  ]
  return (
    <div className="absolute left-2 top-2 z-[400] flex gap-3 rounded-ui border border-line bg-surface/95 px-2.5 py-1.5 text-[11px]">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  )
}

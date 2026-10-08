import type { Weather } from '../types'

const LEVEL: Record<Weather['level'], { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'border border-line text-muted' },
  caution: { label: 'Caution', cls: 'bg-watch-bg text-watch' },
  severe_for_vulnerable: { label: 'Severe for vulnerable', cls: 'bg-alert-bg text-heat' },
}

export function WeatherBlock({ w }: { w: Weather }) {
  const level = LEVEL[w.level]
  return (
    <div className="flex items-center gap-4 text-sm" title="Weather is set from the demo controls (simulated)">
      <Reading label="Temp" value={`${w.temp_c.toFixed(0)} °C`} />
      <Reading label="Humidity" value={`${w.humidity_pct.toFixed(0)} %`} />
      <Reading label="Heat index" value={`${w.heat_index_c.toFixed(1)} °C`} heat />
      <Reading label="Night min" value={`${w.night_min_c.toFixed(0)} °C`} />
      <span className={`rounded-ui px-2 py-0.5 text-xs font-semibold ${level.cls}`}>{level.label}</span>
      <span className="font-mono text-[10px] text-muted">simulated</span>
    </div>
  )
}

function Reading({ label, value, heat }: { label: string; value: string; heat?: boolean }) {
  return (
    <div className="leading-tight">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`font-mono tabular-nums ${heat ? 'font-medium text-heat' : ''}`}>{value}</div>
    </div>
  )
}

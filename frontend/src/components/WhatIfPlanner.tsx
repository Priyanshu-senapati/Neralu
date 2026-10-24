import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import type { Weather, WhatIf } from '../types'
import { PlanCompare } from './PlanCompare'

/*
 * What-if planner: drag a forecast (or load tomorrow's real one) and see the ward's work plan before
 * the heat arrives: who would be called, the cases expected, and whether there are enough responders.
 * Nothing here changes the run.
 */
interface Props {
  weatherNow: Weather
  onClose: () => void
}

type Mode = 'sliders' | 'tomorrow'

export function WhatIfPlanner({ weatherNow, onClose }: Props) {
  const [temp, setTemp] = useState(weatherNow.temp_c)
  const [hum, setHum] = useState(weatherNow.humidity_pct)
  const [night, setNight] = useState(weatherNow.night_min_c)
  const [responders, setResponders] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('sliders')
  const [data, setData] = useState<WhatIf | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // In tomorrow mode the sliders only mirror the forecast, so moving them there must not refetch.
  const sliders = mode === 'sliders' ? `${temp}|${hum}|${night}` : ''
  const query = useMemo(() => {
    const r = responders ?? undefined
    if (!sliders) return { forecast: 'tomorrow' as const, responders: r }
    const [t, h, n] = sliders.split('|').map(Number)
    return { temp_c: t, humidity_pct: h, night_min_c: n, responders: r }
  }, [sliders, responders])

  useEffect(() => {
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      setBusy(true)
      try {
        const d = await api.whatIf(query, ctrl.signal)
        setData(d)
        setNote(null)
        if ('forecast' in query) {
          const w = d.scenario.weather
          setTemp(w.temp_c)
          setHum(w.humidity_pct)
          setNight(w.night_min_c)
        }
      } catch (err) {
        if (ctrl.signal.aborted) return
        if (err instanceof ApiError && err.status === 503) {
          setNote("Tomorrow's forecast is unavailable (offline?). Use the sliders.")
          setMode('sliders')
        } else setNote('Cannot reach the backend.')
      } finally {
        if (!ctrl.signal.aborted) setBusy(false)
      }
    }, 90)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [query])

  const slide = (set: (v: number) => void) => (v: number) => {
    setMode('sliders')
    set(v)
  }
  const onDuty = data?.scenario.responders_on_duty ?? 0

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="whatif-title"
      className="drawer-enter fixed inset-y-0 right-0 z-[1000] flex w-[640px] max-w-full flex-col border-l border-line-strong bg-surface text-ink"
    >
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="whatif-title" className="text-lg font-medium">What-if planner</h2>
          <p className="mt-0.5 text-sm text-muted">
            A forecast turned into the ward's work plan. Simulated estimates; nothing here changes the run.
          </p>
        </div>
        <button ref={closeRef} onClick={onClose} className="press shrink-0 rounded-ui border border-line px-2 py-1 text-sm text-muted hover:text-ink">
          Close
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Slider id="wi-temp" label="Afternoon temperature" unit="°C" min={25} max={46} step={0.5} value={temp} onChange={slide(setTemp)} />
          <Slider id="wi-hum" label="Humidity" unit="%" min={10} max={90} step={1} value={hum} onChange={slide(setHum)} />
          <Slider id="wi-night" label="Night minimum" unit="°C" min={15} max={32} step={0.5} value={night} onChange={slide(setNight)} />
          <Slider
            id="wi-resp"
            label="Responders on duty (volunteers, ASHA)"
            unit=""
            min={0}
            max={30}
            step={1}
            value={responders ?? onDuty}
            onChange={(v) => setResponders(v)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => setMode('tomorrow')}
            disabled={mode === 'tomorrow' && busy}
            className={`press rounded-ui border px-2.5 py-1 ${mode === 'tomorrow' ? 'border-brand text-brand' : 'border-line hover:bg-paper'}`}
          >
            Tomorrow's real forecast, Bengaluru
          </button>
          <button
            onClick={() => {
              setMode('sliders')
              setTemp(weatherNow.temp_c)
              setHum(weatherNow.humidity_pct)
              setNight(weatherNow.night_min_c)
              setResponders(null)
            }}
            className="press rounded-ui border border-line px-2.5 py-1 hover:bg-paper"
          >
            Back to now
          </button>
          {responders !== null && data && (
            <span className="text-xs text-muted">Responders set by hand · {data.baseline.responders_on_duty} on duty now</span>
          )}
        </div>
        {note && <p role="status" className="mt-2 text-sm text-watch">{note}</p>}

        {data ? (
          <div className={`mt-5 transition-opacity ${busy ? 'opacity-60' : ''}`}>
            <PlanCompare data={data} />
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">{note ? '' : 'Working out the plan…'}</p>
        )}
      </div>
    </aside>
  )
}

function Slider(p: { id: string; label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label htmlFor={p.id} className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{p.label}</span>
        <span className="num font-medium">
          {Number.isInteger(p.step) ? p.value : p.value.toFixed(1)}
          {p.unit && <span className="text-muted"> {p.unit}</span>}
        </span>
      </label>
      <input
        id={p.id}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        className="heat-range w-full"
      />
    </div>
  )
}

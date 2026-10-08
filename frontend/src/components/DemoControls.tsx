import { FlowButton } from '@/components/ui/flow-button'
import { useState } from 'react'
import { api, ApiError } from '../api'

const PRESETS = [
  { label: 'Normal day 31 °C / 45 %', w: { temp_c: 31, humidity_pct: 45, night_min_c: 23 } },
  { label: 'Hot day 35 °C / 35 %, night 25 °C', w: { temp_c: 35, humidity_pct: 35, night_min_c: 25 } },
  { label: 'Heatwave 38 °C / 40 %, night 27 °C', w: { temp_c: 38, humidity_pct: 40, night_min_c: 27 } },
]

export function DemoControls({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key)
    setNote(null)
    try {
      const msg = await fn()
      setNote(msg ?? null)
      onChanged()
    } catch (err) {
      setNote(err instanceof ApiError && err.status === 503 ? 'Forecast unavailable (offline?) · use a preset' : 'Request failed · is the backend running?')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed bottom-3 right-3 z-[900] w-72 rounded-ui border border-line bg-surface text-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full justify-between px-3 py-1.5 text-xs text-muted">
        <span>Demo controls</span>
        <span>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-line p-3">
          <div className="text-[0.6875rem] text-muted">Weather</div>
          <Btn busy={busy === 'live'} onClick={() => run('live', async () => {
            const { weather: w } = await api.setLiveHeat()
            return `Live forecast: heat index ${w.heat_index_c.toFixed(1)} °C at ${w.observed_at?.slice(-5)}`
          })}>
            Today's real forecast, Bengaluru
          </Btn>
          <div className="pt-1 text-[0.6875rem] text-muted">Simulated presets</div>
          {PRESETS.map((p) => (
            <Btn key={p.label} busy={busy === p.label} onClick={() => run(p.label, async () => void (await api.setHeat(p.w)))}>
              {p.label}
            </Btn>
          ))}
          <div className="pt-1 text-[0.6875rem] text-muted">Calls</div>
          <div className="grid gap-1.5">
            {[1, 2].map((n) => (
              <FlowButton key={n} size="sm" className="w-full justify-center" disabled={busy === `r${n}`} onClick={() => run(`r${n}`, async () => {
                const { created } = await api.startRound(n)
                setOpen(false) // get out of the way: the live call spotlight is about to open
                return `Round ${n}: ${created} calls`
              })}>
                {busy === `r${n}` ? 'Starting…' : `Start round ${n}`}
              </FlowButton>
            ))}
          </div>
          {confirmReset ? (
            <div className="grid grid-cols-2 gap-1.5">
              <Btn busy={busy === 'reset'} onClick={() => { setConfirmReset(false); run('reset', async () => void (await api.reset())) }}>
                Confirm reset
              </Btn>
              <Btn onClick={() => setConfirmReset(false)}>Cancel</Btn>
            </div>
          ) : (
            <Btn onClick={() => setConfirmReset(true)}>Reset run</Btn>
          )}
          {note && <div className="pt-1 text-xs text-muted">{note}</div>}
        </div>
      )}
    </div>
  )
}

function Btn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="press w-full rounded-ui border border-line px-2 py-1.5 text-left text-sm hover:bg-paper disabled:text-muted"
    >
      {busy ? 'Working…' : children}
    </button>
  )
}

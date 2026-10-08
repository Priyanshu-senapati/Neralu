import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { DrawnCheck } from '../components/Motion'
import { StatusPill } from '../components/StatusPill'
import { WaitingTimer } from '../components/WaitingTimer'
import { TIER_LABEL } from '../status'
import { useScenarioNow } from '../time'
import type { CaseDetail, Summary, VolunteerMe } from '../types'
import { useEventStream } from '../useEventStream'

const RESOLUTIONS: { key: string; label: string }[] = [
  { key: 'safe_in_person', label: 'Safe — confirmed in person' },
  { key: 'support_delivered', label: 'Needs support — delivered water/ORS' },
  { key: 'called_108', label: 'Called 108' },
  { key: 'not_found_escalate', label: "Couldn't reach — escalate" },
]

let audioCtx: AudioContext | null = null

function alertNewCase() {
  navigator.vibrate?.([250, 120, 250])
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5)
  osc.connect(gain).connect(audioCtx.destination)
  osc.start()
  osc.stop(audioCtx.currentTime + 0.5)
}

export default function Volunteer() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [onDuty, setOnDuty] = useState(false)
  const [me, setMe] = useState<VolunteerMe | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const seen = useRef<Set<number> | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([api.volunteerMe(token), api.summary()])
      const ids = new Set(m.cases.map((c) => c.id))
      if (seen.current && m.cases.some((c) => !seen.current!.has(c.id) && c.state === 'open')) alertNewCase()
      seen.current = ids
      setMe(m)
      setSummary(s)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'This volunteer link is not valid for the current run.' : 'Cannot reach Neralu · retrying')
    }
  }, [token])

  const onEvent = useCallback(
    (e: { kind: string }) => {
      if (['case_opened', 'tier_alerted', 'case_accepted', 'case_resolved', 'tier_overdue', 'run_reset'].includes(e.kind)) load()
    },
    [load],
  )
  useEventStream(onDuty ? onEvent : () => {}, onDuty ? load : () => {})
  useEffect(() => {
    if (onDuty) load()
  }, [onDuty, load])

  const now = useScenarioNow(summary?.scenario_now, summary?.demo_speed ?? 1)

  if (!token) return <Shell><p className="text-sm">Open the link from your invite. This page needs a volunteer token.</p></Shell>

  if (!onDuty) {
    return (
      <Shell>
        <p className="mb-6 text-sm text-muted">
          When you go on duty this phone will vibrate and sound when someone near you needs a check.
        </p>
        <button
          onClick={() => {
            audioCtx = new AudioContext()
            navigator.vibrate?.(50)
            setOnDuty(true)
          }}
          className="press w-full rounded-ui bg-ink py-4 text-base font-semibold text-paper"
        >
          Go on duty
        </button>
      </Shell>
    )
  }

  const cases = (me?.cases ?? []).filter((c) => c.mine || !dismissed.has(c.id))
  const mine = cases.find((c) => c.mine)

  return (
    <Shell name={me?.volunteer.name}>
      {error && <p className="mb-3 rounded-ui bg-alert-bg px-3 py-2 text-sm text-alert">{error}</p>}
      {notice && (
        <p key={notice} className="card-enter mb-3 flex items-center gap-2 rounded-ui border border-line bg-surface px-3 py-2 text-sm">
          {notice.startsWith('Recorded') && <DrawnCheck className="h-5 w-5 shrink-0 text-ok" />}
          {notice}
        </p>
      )}
      {!me && !error && <div className="h-40 animate-pulse rounded-ui bg-line" />}
      {me && cases.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">On duty · no cases near you right now</p>
      )}
      {/* Screen readers announce a new or changed case, not just the vibration. */}
      <div className="space-y-3" aria-live="polite">
        {mine ? (
          <AssignedCase c={mine} token={token} now={now} onDone={(msg) => { setNotice(msg); load() }} />
        ) : (
          cases.map((c) => (
            <OpenCase
              key={c.id}
              c={c}
              token={token}
              now={now}
              onAccepted={() => { setNotice(null); load() }}
              onTaken={() => { setNotice('Someone else accepted this case'); load() }}
              onDismiss={() => setDismissed(new Set([...dismissed, c.id]))}
            />
          ))
        )}
      </div>
    </Shell>
  )
}

function Shell({ children, name }: { children: React.ReactNode; name?: string }) {
  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-paper px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-5 flex items-baseline justify-between">
        <span className="text-lg font-semibold">Neralu</span>
        <span className="text-sm text-muted">{name ? `${name} · on duty` : 'Volunteer'}</span>
      </header>
      {children}
    </div>
  )
}

function CaseHeader({ c, now }: { c: CaseDetail; now: Date | null }) {
  const red = c.level === 'red'
  return (
    <>
      <div className="flex items-center justify-between">
        <span className={`rounded-ui px-2 py-0.5 text-sm font-semibold ${red ? 'bg-alert-bg text-alert' : 'bg-support-bg text-support'}`}>
          {red ? 'RED' : 'Needs support'} · waiting <WaitingTimer since={c.opened_scenario} now={now} />
        </span>
        {c.distance_km !== undefined && <span className="font-mono text-xs text-muted">≈ {c.distance_km} km</span>}
      </div>
      <div className="mt-3 text-xl font-semibold">
        {c.elder.name} <span className="font-mono text-base font-normal text-muted">{c.elder.age}</span>
      </div>
      <div className="mt-1 text-sm">{c.reason}</div>
      <div className="mt-1 text-sm text-muted">{c.elder.risk_factors.join(' · ')}</div>
      {c.elder.is_simulated && <div className="mt-1 font-mono text-xs text-muted">simulated resident</div>}
    </>
  )
}

interface OpenProps {
  c: CaseDetail
  token: string
  now: Date | null
  onAccepted: () => void
  onTaken: () => void
  onDismiss: () => void
}

function OpenCase({ c, token, now, onAccepted, onTaken, onDismiss }: OpenProps) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const accept = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await api.accept(c.id, token)
      onAccepted()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onTaken()
      else setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="card-enter rounded-ui border border-line bg-surface p-4">
      <CaseHeader c={c} now={now} />
      <p className="mt-3 text-xs text-muted">
        Address shown after you accept · {TIER_LABEL[c.tier]} tier{c.overdue ? ' · ward officer alerted' : ''}
      </p>
      {failed && <p className="mt-2 text-sm text-alert">Could not accept · check your connection and try again</p>}
      <div className="mt-4 grid grid-cols-[2fr_1fr] gap-2">
        <button onClick={accept} disabled={busy} className="press rounded-ui bg-ink py-3.5 text-base font-semibold text-paper disabled:opacity-60">
          {busy ? 'Accepting…' : 'Accept'}
        </button>
        <button onClick={onDismiss} className="press rounded-ui border border-line py-3.5 text-base">
          Can't go
        </button>
      </div>
    </article>
  )
}

function AssignedCase({ c, token, now, onDone }: { c: CaseDetail; token: string; now: Date | null; onDone: (msg: string) => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const first = c.elder.name.split(' ')[0]

  const resolve = async (key: string, label: string) => {
    setBusy(key)
    setFailed(false)
    try {
      await api.resolve(c.id, token, key, note.trim() || undefined)
      onDone(key === 'not_found_escalate' ? 'Case passed on to the next tier' : `Recorded: ${label}`)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="card-enter rounded-ui border border-line bg-surface p-4">
      <CaseHeader c={c} now={now} />
      <div className="mt-4 rounded-ui bg-paper px-3 py-2.5">
        <div className="text-xs text-muted">Address</div>
        <div className="text-base">{c.elder.address}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {c.elder.phone ? (
          <a href={`tel:${c.elder.phone}`} className="press rounded-ui border border-line py-3 text-center text-base font-semibold">
            Call {first}
          </a>
        ) : (
          <span className="rounded-ui border border-line py-3 text-center text-sm text-muted">No phone on file</span>
        )}
        {c.elder.maps_url && (
          <a href={c.elder.maps_url} target="_blank" rel="noreferrer" className="press rounded-ui border border-line py-3 text-center text-base font-semibold">
            Open in Maps
          </a>
        )}
      </div>
      <h3 className="mt-5 text-sm font-semibold">After you see {first}</h3>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Note (optional)"
        aria-label="Note about this visit (optional)"
        className="mt-2 w-full rounded-ui border border-line bg-surface px-3 py-2 text-base"
        rows={2}
      />
      {failed && <p className="mt-2 text-sm text-alert">Could not save · try again</p>}
      <div className="mt-2 space-y-2">
        {RESOLUTIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => resolve(r.key, r.label)}
            disabled={busy !== null}
            className={`press w-full rounded-ui border py-3.5 text-left px-3 text-base ${r.key === 'safe_in_person' ? 'border-ok bg-ok-bg text-ok font-semibold' : r.key === 'called_108' ? 'border-alert text-alert' : 'border-line'}`}
          >
            {busy === r.key ? 'Saving…' : r.label}
          </button>
        ))}
      </div>
      <div className="mt-3"><StatusPill tone="neutral" label="Accepted by you" /></div>
    </article>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Wordmark } from '../components/Brand'
import { DrawnCheck } from '../components/Motion'
import { StatusPill } from '../components/StatusPill'
import { WaitingTimer } from '../components/WaitingTimer'
import { callFindings } from '../loop'
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
        <h1 className="display text-[1.85rem] font-medium leading-tight">Someone near you may need a check today.</h1>
        <ol className="mt-5 space-y-3 border-t border-line pt-4 text-[0.9375rem] leading-snug">
          {[
            'When a person near you does not answer Neralu, or says something worrying, this phone buzzes.',
            'Accept the case. Only then do you see their address.',
            'Go to their door, then record what you found. Their family is told.',
          ].map((t, i) => (
            <li key={t} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
              <span className="num text-sm text-muted">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">Neralu never calls an ambulance. If it is an emergency, you decide to call 108.</p>
        <div className="flex-1" />
        <button
          onClick={() => {
            audioCtx = new AudioContext()
            navigator.vibrate?.(50)
            setOnDuty(true)
          }}
          className="press mt-8 w-full rounded-[5px] bg-brand py-4 text-base font-semibold text-brand-ink"
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
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-ink">
        <Wordmark size="sm" />
        <span className="text-sm text-muted">
          {name ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
              {name} · on duty
            </span>
          ) : (
            'Volunteer · Ward 47'
          )}
        </span>
      </header>
      <div className="flex flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">{children}</div>
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
        {c.distance_km !== undefined && <span className="num text-xs text-muted">≈ {c.distance_km} km away</span>}
      </div>
      <div className="mt-3 text-xl font-semibold">
        {c.elder.name} <span className="num text-base font-normal text-muted">{c.elder.age}</span>
      </div>
      <div className="mt-0.5 text-sm text-muted">{c.elder.risk_factors.join(' · ')}</div>
      {c.elder.is_simulated && <div className="mt-1 font-mono text-xs text-muted">simulated resident</div>}
    </>
  )
}

/** What the phone check found, so the volunteer knows what they are walking into. */
function CallFindings({ c }: { c: CaseDetail }) {
  const first = c.elder.name.split(' ')[0]
  const call = [...c.checkins].reverse().find((x) => x.classified) ?? null
  const unanswered = c.checkins.filter((x) => x.classified && x.outcome === 'UNREACHED').length
  const found = call && call.outcome !== 'UNREACHED' ? callFindings(call.answers) : []
  return (
    <div className="mt-3 rounded-ui bg-paper px-3 py-2.5">
      <div className="text-xs font-semibold text-muted">WHAT NERALU'S CALL FOUND</div>
      {found.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-sm">
          {found.slice(0, 4).map((f) => (
            <li key={f.text} className={f.concern ? 'font-semibold text-alert' : ''}>
              {first} {f.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm font-semibold text-alert">
          {unanswered >= 2 ? `${first} did not answer ${unanswered} calls.` : c.reason}
        </p>
      )}
    </div>
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
  const first = c.elder.name.split(' ')[0]
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
      <p className="mb-2 text-sm font-semibold">
        {c.level === 'red' ? `${first} needs someone to check in person` : `${first} needs practical help`}
      </p>
      <CaseHeader c={c} now={now} />
      <CallFindings c={c} />
      <p className="mt-3 text-sm">
        If you accept, this visit is yours. Others stop being asked, and the ward office sees you are on the way.
      </p>
      <p className="mt-1 text-xs text-muted">
        The address appears after you accept · {TIER_LABEL[c.tier]} tier{c.overdue ? ' · ward officer alerted' : ''}
      </p>
      {failed && <p className="mt-2 text-sm text-alert">Could not accept. Check your connection and try again.</p>}
      <div className="mt-4 grid grid-cols-[2fr_1fr] gap-2">
        <button onClick={accept} disabled={busy} className="press rounded-ui bg-ink py-3.5 text-base font-semibold text-paper disabled:opacity-60">
          {busy ? 'Accepting…' : `Accept · I'll go`}
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
      onDone(key === 'not_found_escalate'
        ? 'Passed on: the next tier is being asked to go.'
        : `Recorded: ${label}. The ward office and family have been told. Thank you.`)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="card-enter overflow-hidden rounded-ui border border-line bg-surface">
      <div className="bg-ink px-4 py-3 text-paper">
        <div className="text-base font-semibold">You are now responsible for {first}'s visit</div>
        <div className="mt-0.5 text-sm text-paper/80">Nobody else is being asked. The ward office and family can see you are on the way.</div>
      </div>
      <div className="p-4">
      <ol className="mb-4 grid grid-cols-4 gap-1 text-center text-xs" aria-label="Your visit, step by step">
        {['Accepted', `Go to ${first}`, 'Record what you found', 'Family told'].map((label, i) => (
          <li key={label} className="flex flex-col items-center gap-1">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${i === 0 ? 'bg-ink text-paper' : i === 1 ? 'border-2 border-ink font-semibold' : 'border border-line-strong text-muted'}`}>
              {i === 0 ? '✓' : i + 1}
            </span>
            <span className={i <= 1 ? 'font-semibold' : 'text-muted'}>{label}</span>
          </li>
        ))}
      </ol>
      <CaseHeader c={c} now={now} />
      <div className="mt-4 rounded-ui border-2 border-ink px-3 py-2.5">
        <div className="text-xs font-semibold text-muted">ADDRESS</div>
        <div className="text-lg font-semibold">{c.elder.address}</div>
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
      <CallFindings c={c} />
      <div className="mt-4 text-sm">
        <h3 className="font-semibold">At the door</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
          <li>Are they alert, and do they know what day it is?</li>
          <li>Offer water. Help them to the coolest spot in the home.</li>
          <li>Unresponsive, very confused or collapsed: call 108 first, then record it here.</li>
        </ul>
      </div>
      <h3 className="mt-5 text-sm font-semibold">What did you find?</h3>
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
      </div>
    </article>
  )
}

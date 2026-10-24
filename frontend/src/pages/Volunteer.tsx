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
  const [notice, setNotice] = useState<string | null>(null)
  // Open cases this phone already knew about, and whether it was asked: a new case, or one handed
  // to this person after someone else said "Can't go", buzzes the phone.
  const seen = useRef<Map<number, boolean> | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([api.volunteerMe(token), api.summary()])
      const open = m.cases.filter((c) => c.state === 'open')
      const before = seen.current
      if (before && open.some((c) => !before.has(c.id) || (c.alerted_you && !before.get(c.id)))) alertNewCase()
      seen.current = new Map(open.map((c) => [c.id, !!c.alerted_you]))
      setMe(m)
      setSummary(s)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'This volunteer link is not valid for the current run.' : 'Cannot reach Neralu · retrying')
    }
  }, [token])

  const onEvent = useCallback(
    (e: { kind: string }) => {
      if (['case_opened', 'tier_alerted', 'case_accepted', 'case_resolved', 'tier_overdue', 'run_reset', 'case_declined', 'volunteer_duty'].includes(e.kind)) load()
    },
    [load],
  )
  useEventStream(onDuty ? onEvent : () => {}, onDuty ? load : () => {})
  useEffect(() => {
    if (onDuty) load()
  }, [onDuty, load])

  const now = useScenarioNow(summary?.scenario_now, summary?.demo_speed ?? 1)

  const goOffDuty = async () => {
    try {
      await api.duty(token, false)
      seen.current = null
      setMe(null)
      setNotice(null)
      setOnDuty(false)
    } catch (e) {
      setNotice(e instanceof ApiError && e.status === 409
        ? 'Record what you found on your current visit before going off duty.'
        : 'Could not go off duty. Check your connection and try again.')
    }
  }

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
            api.duty(token, true).catch(() => undefined) // a bad link shows its own error once loaded
            setOnDuty(true)
          }}
          className="press mt-8 w-full rounded-[5px] bg-brand py-4 text-base font-semibold text-brand-ink"
        >
          Go on duty
        </button>
      </Shell>
    )
  }

  const cases = me?.cases ?? []
  const mine = cases.find((c) => c.mine)

  return (
    <Shell name={me?.volunteer.name} onOffDuty={mine ? undefined : goOffDuty}>
      {error && <p className="mb-3 rounded-ui bg-alert-bg px-3 py-2 text-sm text-alert">{error}</p>}
      {notice && (
        <p key={notice} className="card-enter mb-3 flex items-center gap-2 rounded-ui border border-line bg-surface px-3 py-2 text-sm">
          {notice.startsWith('Recorded') && <DrawnCheck className="h-5 w-5 shrink-0 text-ok" />}
          {notice}
        </p>
      )}
      {!me && !error && <div className="h-40 animate-pulse rounded-ui bg-line" />}
      {me && cases.every((c) => c.declined_by_you) && (
        <p className="py-16 text-center text-sm text-muted">On duty · no cases near you right now</p>
      )}
      {/* Screen readers announce a new or changed case, not just the vibration. */}
      <div className="space-y-3" aria-live="polite">
        {mine ? (
          <AssignedCase c={mine} token={token} now={now} onDone={(msg) => { setNotice(msg); load() }} />
        ) : (
          cases.map((c) => c.declined_by_you ? (
            <DeclinedCase
              key={c.id}
              c={c}
              token={token}
              onAccepted={() => { setNotice(null); load() }}
              onTaken={() => { setNotice('Someone else accepted this case'); load() }}
            />
          ) : (
            <OpenCase
              key={c.id}
              c={c}
              token={token}
              now={now}
              onAccepted={() => { setNotice(null); load() }}
              onTaken={() => { setNotice('Someone else accepted this case'); load() }}
              onDeclined={() => {
                setNotice(`Thanks for saying so. The next nearest ${me?.volunteer.role === 'asha' ? 'ASHA worker' : 'volunteer'} is being asked instead.`)
                load()
              }}
            />
          ))
        )}
      </div>
    </Shell>
  )
}

function Shell({ children, name, onOffDuty }: { children: React.ReactNode; name?: string; onOffDuty?: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-ink">
        <Wordmark size="sm" />
        <span className="text-sm text-muted">
          {name ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
              {name} · on duty
              {onOffDuty && (
                <button onClick={onOffDuty} className="press ml-1 rounded-ui border border-line px-2 py-0.5 text-xs text-ink">
                  Go off duty
                </button>
              )}
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
        {c.distance_km !== undefined && (
          <span className="num text-right text-xs text-muted">
            {c.alerted_you && <span className="block font-sans font-semibold text-brand">You are one of the nearest</span>}≈ {c.distance_km} km away
          </span>
        )}
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
  onDeclined: () => void
}

function OpenCase({ c, token, now, onAccepted, onTaken, onDeclined }: OpenProps) {
  const [busy, setBusy] = useState(false)
  const [declining, setDeclining] = useState(false)
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
  const decline = async () => {
    setDeclining(true)
    setFailed(false)
    try {
      await api.decline(c.id, token)
      onDeclined()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onTaken()
      else setFailed(true)
    } finally {
      setDeclining(false)
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
      {failed && <p className="mt-2 text-sm text-alert">That did not go through. Check your connection and try again.</p>}
      <div className="mt-4 grid grid-cols-[2fr_1fr] gap-2">
        <button onClick={accept} disabled={busy} className="press rounded-ui bg-ink py-3.5 text-base font-semibold text-paper disabled:opacity-60">
          {busy ? 'Accepting…' : `Accept · I'll go`}
        </button>
        <button onClick={decline} disabled={busy || declining} className="press rounded-ui border border-line py-3.5 text-base disabled:opacity-60">
          {declining ? 'Passing on…' : "Can't go"}
        </button>
      </div>
    </article>
  )
}

/** A case this person said they can't go to: kept small at the bottom, in case they can after all. */
function DeclinedCase({ c, token, onAccepted, onTaken }: { c: CaseDetail; token: string; onAccepted: () => void; onTaken: () => void }) {
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
    <article className="flex items-center justify-between gap-3 rounded-ui border border-line bg-surface px-3 py-2.5 text-sm">
      <span className="text-muted">
        You said you can't go to {c.elder.name.split(' ')[0]}. Others are being asked.
        {failed && <span className="block text-alert">That did not go through. Try again.</span>}
      </span>
      <button onClick={accept} disabled={busy} className="press shrink-0 rounded-ui border border-line px-2.5 py-1.5 text-ink disabled:opacity-60">
        {busy ? 'Accepting…' : 'I can go after all'}
      </button>
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
      {c.overdue && (
        <p role="alert" className="bg-alert-bg px-4 py-2.5 text-sm font-semibold text-alert">
          No visit has been recorded yet, so the ward office has been alerted. Record what you found as soon as you can.
        </p>
      )}
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

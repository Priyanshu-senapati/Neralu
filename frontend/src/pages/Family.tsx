import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Wordmark } from '../components/Brand'
import type { FamilyStatus } from '../types'

/**
 * The family's private view of one person: how today's checks went, in plain words. Read-only.
 * The link's secret lives in the #fragment (never sent to the server in the page request) and goes
 * to the API in a header. Shows no address, phone, code word, volunteer name or anyone else.
 */

const TONE: Record<FamilyStatus['tone'], { card: string; text: string; dot: string }> = {
  ok: { card: 'border-ok/40 bg-ok-bg', text: 'text-ok', dot: 'bg-ok' },
  watch: { card: 'border-watch/40 bg-watch-bg', text: 'text-watch', dot: 'bg-watch' },
  alert: { card: 'border-alert/50 bg-alert-bg', text: 'text-alert', dot: 'bg-alert' },
  neutral: { card: 'border-line bg-surface', text: '', dot: 'bg-ink/40' },
}
const NEXT: Record<NonNullable<FamilyStatus['next_call']>['kind'], string> = {
  check: 'check call', retry: 'another try', 'follow-up': 'follow-up call', 'after-care': 'after-care call',
}
const POLL_MS = 5000

export default function Family() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const token = hash.slice(1)
  const [d, setD] = useState<FamilyStatus | null>(null)
  const [loaded, setState] = useState<'loading' | 'ok' | 'inactive' | 'offline'>('loading')
  const state = token ? loaded : 'inactive' // no secret in the address: nothing to ask the server
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      setD(await api.family.status(token))
      setState('ok')
    } catch (err) {
      setState(err instanceof ApiError && err.status === 404 ? 'inactive' : 'offline')
    }
  }, [token])

  useEffect(() => {
    load()
    const id = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const renew = async () => {
    const { family_token } = await api.family.renew(token)
    navigate(`/family#${family_token}`, { replace: true })
    setNote('New link made: the old one no longer works. Save this page’s address and share it only with family.')
  }
  const revoke = async () => {
    await api.family.revoke(token)
    setNote(null)
    setState('inactive')
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-8 flex items-center justify-between">
          <Wordmark size="sm" />
          <span className="text-xs text-muted">Family view · private</span>
        </div>

        {state === 'loading' && <div className="h-40 animate-pulse rounded-[10px] bg-line" />}
        {state === 'inactive' && <Inactive />}
        {state === 'offline' && !d && <p className="text-sm text-muted">Cannot reach Neralu right now · retrying</p>}
        {d && state !== 'inactive' && (
          <Status d={d} offline={state === 'offline'} note={note} onRenew={renew} onRevoke={revoke} />
        )}
      </div>
    </div>
  )
}

function Status({ d, offline, note, onRenew, onRevoke }: {
  d: FamilyStatus; offline: boolean; note: string | null; onRenew: () => Promise<void>; onRevoke: () => Promise<void>
}) {
  const t = TONE[d.tone]
  const first = d.first_name
  return (
    <>
      <p className="text-sm text-muted">Heat checks for</p>
      <h1 className="display text-[2rem] font-medium leading-tight">{d.name}</h1>

      <section aria-live="polite" className={`mt-5 rounded-[10px] border px-5 py-4 ${t.card}`}>
        <div className="text-xs text-muted">Now · <span className="num">{d.as_of}</span>{offline && ' · reconnecting'}</div>
        <p className={`mt-1 text-[1.35rem] font-semibold leading-snug ${t.text}`}>{d.headline}</p>
        {(d.last_check || d.next_call) && (
          <dl className="mt-3 space-y-1 border-t border-ink/10 pt-3 text-sm">
            {d.last_check && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last check</dt>
                <dd className="text-right"><span className="num">{d.last_check.at}</span> · {d.last_check.text}{d.last_check.by_caregiver && ' (caregiver)'}</dd>
              </div>
            )}
            {d.next_call && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Next</dt>
                <dd className="text-right">
                  {NEXT[d.next_call.kind]}{d.next_call.to_caregiver && ' to the caregiver'} at <span className="num">{d.next_call.at}</span>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <p className="mt-4 text-sm leading-relaxed text-ink/80">
        Today's heat index is <span className="num">{d.heat.heat_index_c.toFixed(1)} °C</span>
        {d.heat.source !== 'open-meteo' && ' (simulated)'}.{' '}
        {d.heat.above_threshold
          ? <>That is above {first}'s personal threshold of <span className="num">{d.heat.threshold_c.toFixed(0)} °C</span>, so Neralu checks on {first}{d.through_caregiver ? ' through their caregiver' : ''}.</>
          : <>That is below {first}'s personal threshold of <span className="num">{d.heat.threshold_c.toFixed(0)} °C</span>.</>}
      </p>

      {d.today.length > 0 && (
        <section className="mt-7">
          <h2 className="text-sm font-semibold">Today</h2>
          <ol className="mt-2 divide-y divide-line border-y border-line">
            {[...d.today].reverse().map((line, i) => (
              <li key={`${line.at}-${i}`} className="grid grid-cols-[3rem_0.75rem_minmax(0,1fr)] items-baseline gap-x-2 py-2 text-sm">
                <span className="num text-muted">{line.at}</span>
                <span className={`h-2 w-2 rounded-full ${TONE[line.tone].dot}`} aria-hidden="true" />
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-7 rounded-[8px] border border-line bg-surface px-4 py-3 text-sm">
        Neralu never asks for money, OTP, Aadhaar or bank details. Every Neralu call starts with your family's code word.
      </p>
      {(!d.pilot || !d.registered) && (
        <p className="mt-3 text-xs text-muted">
          {!d.registered ? `${first} is the demo's fictional resident. ` : ''}
          {!d.pilot ? 'Demo: times follow the demo clock, and the ward’s other residents are simulated.' : ''}
        </p>
      )}

      <div className="flex-1" />
      <LinkControls first={first} note={note} onRenew={onRenew} onRevoke={onRevoke} />
    </>
  )
}

function LinkControls({ first, note, onRenew, onRevoke }: {
  first: string; note: string | null; onRenew: () => Promise<void>; onRevoke: () => Promise<void>
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setConfirm(false)
    } catch {
      setError('That did not work. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mt-10 border-t border-line pt-4 text-sm">
      <p className="text-muted">Keep this link private: anyone who has it can see this page. If it was shared by mistake, replace it.</p>
      {note && <p role="status" className="mt-2 font-semibold">{note}</p>}
      {error && <p role="alert" className="mt-2 text-alert">{error}</p>}
      {confirm ? (
        <div className="mt-3 rounded-[8px] border border-alert/50 bg-alert-bg px-4 py-3">
          <p>Turn off this link? This page stops working. Neralu keeps checking on {first}.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => act(onRevoke)} className="press min-h-11 rounded-full bg-alert px-4 font-semibold text-paper disabled:opacity-60">
              Turn off
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="press min-h-11 rounded-full border border-line-strong px-4">Keep it</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => act(onRenew)} className="press min-h-11 rounded-full border border-line-strong px-4 disabled:opacity-60">
            Get a new link
          </button>
          <button type="button" onClick={() => setConfirm(true)} className="press min-h-11 rounded-full px-4 text-muted hover:text-alert">
            Turn off this link
          </button>
        </div>
      )}
    </section>
  )
}

function Inactive() {
  return (
    <div className="py-10">
      <h1 className="display text-[1.8rem] font-medium leading-tight">This link is not active.</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/80">
        It may have been turned off or replaced by a newer link. Neralu still checks on everyone registered;
        only this page is off.
      </p>
    </div>
  )
}

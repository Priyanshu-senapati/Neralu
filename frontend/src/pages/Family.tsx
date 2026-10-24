import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Wordmark } from '../components/Brand'
import type { FamilyStatus } from '../types'

const POLL_MS = 5000
const TONE: Record<string, { box: string; dot: string }> = {
  ok: { box: 'border-ok bg-ok-bg', dot: 'bg-ok' },
  watch: { box: 'border-watch bg-watch-bg', dot: 'bg-watch' },
  alert: { box: 'border-alert bg-alert-bg', dot: 'bg-alert' },
  neutral: { box: 'border-line-strong bg-surface', dot: 'bg-muted' },
  muted: { box: 'border-line bg-surface', dot: 'bg-line-strong' },
}

/*
 * A family's private view of one person's heat check today. It asks only for this person's status
 * (never the ward's live stream), so nothing about anyone else ever reaches this phone.
 */
export default function Family() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [d, setD] = useState<FamilyStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setD(await api.family(token))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404
        ? 'This link is not valid, or the registration was removed.'
        : 'Cannot reach Neralu right now. Retrying.')
    }
  }, [token])

  useEffect(() => {
    load()
    const id = window.setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const first = d?.name.split(' ')[0]
  const tone = TONE[d?.tone ?? 'neutral'] ?? TONE.neutral

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Wordmark size="sm" />
        <span className="text-sm text-muted">Family view</span>
      </header>
      <main className="flex flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        {!d && !error && <div className="h-40 animate-pulse rounded-ui bg-line" />}
        {error && !d && <p role="alert" className="rounded-ui bg-alert-bg px-3 py-2 text-sm text-alert">{error}</p>}
        {d && (
          <>
            <h1 className="display text-[1.7rem] font-medium leading-tight">{first}'s heat check today</h1>
            <section aria-live="polite" className={`mt-4 rounded-ui border-l-4 px-4 py-4 ${tone.box}`}>
              <p className="text-[1.125rem] font-semibold leading-snug">{d.headline}</p>
            </section>
            <p className="mt-2 text-sm text-muted">
              Heat index <span className="num whitespace-nowrap">{d.heat_index_c.toFixed(1)} °C</span>
              {d.weather_simulated ? ' (simulated)' : ''} · {first}'s own threshold{' '}
              <span className="num whitespace-nowrap">{d.threshold_c.toFixed(0)} °C</span>
            </p>
            {error && <p className="mt-2 text-xs text-watch">{error}</p>}

            <h2 className="mt-7 text-sm font-semibold">Today</h2>
            {d.timeline.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing yet today.</p>
            ) : (
              <ol className="mt-2 border-l border-line-strong">
                {d.timeline.map((x, i) => (
                  <li key={i} className="relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 py-1.5 pl-4 text-sm">
                    <span className={`absolute -left-[5px] top-[0.7rem] h-2.5 w-2.5 rounded-full ${(TONE[x.tone] ?? TONE.muted).dot}`} aria-hidden="true" />
                    <span className="num text-muted">{x.time}</span>
                    <span>{x.text}</span>
                  </li>
                ))}
              </ol>
            )}

            <div className="flex-1" />
            <footer className="mt-10 space-y-1.5 border-t border-line pt-4 text-xs text-muted">
              <p>This page updates by itself. The link is private to your family: please do not share it.</p>
              <p>Neralu never asks for money, OTP, Aadhaar or bank details. Neralu never calls an ambulance itself; a person decides that.</p>
              {d.demo_clock && <p>Demo: times on this page run faster than real time.</p>}
            </footer>
          </>
        )}
      </main>
    </div>
  )
}

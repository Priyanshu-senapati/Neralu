import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlowButton } from '@/components/ui/flow-button'
import { api, ApiError, SIGNED_OUT_EVENT } from '../api'
import { Wordmark } from './Brand'

/**
 * The ward console and its case records open only after the ward office signs in: they show
 * residents' names and risk details, and an address once a volunteer accepts a visit. The server
 * enforces this on every console route; this screen just asks for the passcode.
 */
export function OfficerGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'out' | 'in'>('checking')
  const [unreachable, setUnreachable] = useState(false)

  useEffect(() => {
    let live = true
    api.officer
      .session()
      .then((s) => live && setState(s.signed_in ? 'in' : 'out'))
      .catch(() => {
        if (!live) return
        setUnreachable(true)
        setState('out')
      })
    const signedOut = () => setState('out')
    window.addEventListener(SIGNED_OUT_EVENT, signedOut)
    return () => {
      live = false
      window.removeEventListener(SIGNED_OUT_EVENT, signedOut)
    }
  }, [])

  if (state === 'checking') return <div className="min-h-dvh bg-paper" />
  if (state === 'in') return <>{children}</>
  return <SignIn unreachable={unreachable} onSignedIn={() => setState('in')} />
}

function SignIn({ unreachable, onSignedIn }: { unreachable: boolean; onSignedIn: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(unreachable ? 'Cannot reach Neralu. Check that the server is running.' : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!passcode.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.officer.login(passcode.trim())
      onSignedIn()
    } catch (err) {
      const detail = err instanceof ApiError ? (err.body as { detail?: string } | null)?.detail : undefined
      setError(err instanceof ApiError && (err.status === 401 || err.status === 429) && detail
        ? detail
        : 'Cannot reach Neralu. Check that the server is running.')
      setPasscode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="skin flex min-h-dvh items-center justify-center bg-paper px-4 py-10 text-ink">
      <div className="w-full max-w-[24rem]">
        <Link to="/" className="inline-block rounded-[3px]" aria-label="About Neralu">
          <Wordmark size="sm" />
        </Link>
        <h1 className="display mt-8 text-[2rem] font-medium leading-tight">Ward 47 console</h1>
        <p className="mt-3 text-[0.9375rem] leading-snug text-muted">
          For the ward office. The console shows residents' names and risk details, and an address once
          a volunteer accepts a visit, so it opens only with the office passcode.
        </p>
        <form onSubmit={submit} className="mt-8">
          <label className="block">
            <span className="text-sm font-semibold">Passcode</span>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoComplete="current-password"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'signin-error' : undefined}
              className="mt-2 w-full rounded-[8px] border border-line-strong bg-surface px-4 py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_25%,transparent)] focus:outline-none"
            />
          </label>
          {/* The line is always there, so the form does not jump when a message appears. */}
          <p id="signin-error" role="alert" className="mt-3 min-h-5 text-sm text-alert">
            {error}
          </p>
          <div className="mt-6 flex items-center justify-between gap-4">
            <span className="text-xs text-muted">Stays signed in on this computer for 12 hours.</span>
            <FlowButton type="submit" disabled={busy || !passcode.trim()}>
              {busy ? 'Signing in…' : 'Sign in'}
            </FlowButton>
          </div>
        </form>
      </div>
    </main>
  )
}

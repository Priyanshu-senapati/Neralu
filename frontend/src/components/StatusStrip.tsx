import { useCallback, useEffect, useState } from 'react'

interface StatusCheck {
  key: string
  label: string
  ok: boolean
  detail: string
  warn: boolean
}

interface SystemStatus {
  ok: boolean
  checks: StatusCheck[]
  telephony_mode: string
  checked_seconds_ago: number
}

const POLL_MS = 30_000

/**
 * Everything a live call depends on, at a glance: quiet when all is well, red with the fix when not.
 * Checked by the server from evidence (public link fetched, last real call, scheduler heartbeat).
 */
export function StatusStrip() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (fresh = false) => {
    try {
      const r = await fetch(`/api/status${fresh ? '?fresh=1' : ''}`)
      if (!r.ok) throw new Error(String(r.status))
      setStatus(await r.json())
      setUnreachable(false)
    } catch {
      setUnreachable(true)
    }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(() => load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const recheck = async () => {
    setBusy(true)
    await load(true)
    setBusy(false)
  }

  if (unreachable) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 bg-alert-bg px-5 py-1.5 text-xs text-alert">
        <span><span className="font-semibold">Server not reachable.</span> Restart it (scripts\stage.ps1), then reload this page.</span>
      </div>
    )
  }
  if (!status) return null

  const failing = status.checks.filter((c) => !c.ok)
  return (
    <div
      role={failing.length ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-1.5 text-xs ${failing.length ? 'bg-alert-bg text-alert' : 'border-b border-line bg-surface text-muted'}`}
    >
      <span className={`font-semibold ${failing.length ? '' : 'text-ink'}`}>
        {failing.length ? `${failing.length} problem${failing.length > 1 ? 's' : ''} before calling` : 'Ready for live calls'}
      </span>
      {failing.length > 0
        ? failing.map((c) => (
            <span key={c.key}>
              <span className="font-semibold">{c.label}:</span> {c.detail}
            </span>
          ))
        : status.checks.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5" title={c.detail}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${c.warn ? 'bg-watch' : 'bg-ok'}`} />
              {c.label}
              {c.warn && <span className="sr-only">: {c.detail}</span>}
            </span>
          ))}
      <button onClick={recheck} disabled={busy} className="ml-auto rounded-ui border border-line px-2 py-0.5 text-xs text-muted hover:text-ink disabled:opacity-50">
        {busy ? 'Checking…' : 'Recheck'}
      </button>
    </div>
  )
}

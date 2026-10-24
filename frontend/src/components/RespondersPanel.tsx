import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Responder, ResponderCase } from '../types'

/*
 * Who can go to a door right now: every volunteer and ASHA worker, on or off duty, the case they hold,
 * the cases they are being asked to, and the ones they said they can't go to.
 */
interface Props {
  refreshKey: number
  onOpenProfile: (elderId: number) => void
  onClose: () => void
}

export function RespondersPanel({ refreshKey, onOpenProfile, onClose }: Props) {
  const [rows, setRows] = useState<Responder[] | null>(null)
  const [failed, setFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.responders().then((r) => { setRows(r); setFailed(false) }).catch(() => setFailed(true))
  }, [refreshKey])

  const onDuty = rows?.filter((r) => r.on_duty) ?? []
  const busy = onDuty.filter((r) => r.load > 0).length

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="responders-title"
      className="drawer-enter fixed inset-y-0 right-0 z-[1000] flex w-[520px] max-w-full flex-col border-l border-line-strong bg-surface text-ink"
    >
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="responders-title" className="text-lg font-medium">Responders</h2>
          <p className="mt-0.5 text-sm text-muted" aria-live="polite">
            {rows
              ? `${onDuty.length} of ${rows.length} on duty · ${busy} on a visit · ${onDuty.length - busy} free`
              : failed ? 'Cannot reach the backend.' : 'Loading…'}
          </p>
        </div>
        <button ref={closeRef} onClick={onClose} className="press shrink-0 rounded-ui border border-line px-2 py-1 text-sm text-muted hover:text-ink">
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        <p className="mb-3 text-xs text-muted">
          When someone says they can't go, or goes off duty, the next nearest free responder is asked at once.
          If nobody is left at a tier, the case moves up a tier, and after ASHA workers to the ward officer.
        </p>
        {(['volunteer', 'asha'] as const).map((role) => (
          <section key={role} aria-label={role === 'asha' ? 'ASHA workers' : 'Volunteers'} className="mb-4">
            <h3 className="border-b border-line pb-1 text-sm font-medium">{role === 'asha' ? 'ASHA workers' : 'Volunteers'}</h3>
            <ul>
              {(rows ?? []).filter((r) => r.role === role).map((r) => (
                <ResponderRow key={r.id} r={r} onOpen={onOpenProfile} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}

function ResponderRow({ r, onOpen }: { r: Responder; onOpen: (id: number) => void }) {
  const status = !r.on_duty ? 'Off duty' : r.load > 0 ? 'On a visit' : 'Free'
  const tone = !r.on_duty ? 'text-muted' : r.load > 0 ? 'text-ink font-medium' : 'text-ok font-medium'
  return (
    <li className="border-b border-line py-2.5 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className={r.on_duty ? '' : 'text-muted'}>
          {r.name}
          {r.is_simulated ? <span className="ml-1.5 font-mono text-[0.6875rem] text-muted">simulated</span> : null}
        </span>
        <span className={`text-xs ${tone}`}>{status}</span>
      </div>
      <CaseLine label="Holding" cases={r.holding} onOpen={onOpen} />
      <CaseLine label="Being asked" cases={r.asked} onOpen={onOpen} />
      <CaseLine label="Said can't go" cases={r.declined} onOpen={onOpen} muted />
    </li>
  )
}

function CaseLine({ label, cases, onOpen, muted }: { label: string; cases: ResponderCase[]; onOpen: (id: number) => void; muted?: boolean }) {
  if (!cases.length) return null
  return (
    <div className={`mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs ${muted ? 'text-muted' : ''}`}>
      <span className="text-muted">{label}:</span>
      {cases.map((c) => (
        <button
          key={c.case_id}
          onClick={() => onOpen(c.elder_id)}
          className={`underline decoration-line-strong underline-offset-2 hover:decoration-ink ${c.level === 'red' && !muted ? 'text-alert' : ''}`}
        >
          {c.elder ?? `case ${c.case_id}`}{c.level === 'red' ? ' (RED)' : ' (support)'}
        </button>
      ))}
    </div>
  )
}

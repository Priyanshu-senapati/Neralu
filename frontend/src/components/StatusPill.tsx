import type { Tone } from '../status'

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  watch: 'bg-watch-bg text-watch',
  support: 'bg-support-bg text-support',
  alert: 'bg-alert-bg text-alert',
  neutral: 'bg-paper text-muted border border-line',
}

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-ui px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  )
}

export function SimTag() {
  return (
    <span className="rounded-ui border border-line px-1 font-mono text-[10px] text-muted">
      simulated
    </span>
  )
}

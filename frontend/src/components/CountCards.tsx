import type { Summary } from '../types'

const CARDS: { key: keyof Summary['counts']; label: string; tone?: string }[] = [
  { key: 'registered', label: 'Registered' },
  { key: 'due_today', label: 'Due today' },
  { key: 'fine', label: 'Fine', tone: 'text-ok' },
  { key: 'follow_up', label: 'Follow-up', tone: 'text-watch' },
  { key: 'escalated', label: 'Escalated', tone: 'text-alert' },
  { key: 'support', label: 'Needs support', tone: 'text-support' },
  { key: 'unreached_now', label: 'Unreached now' },
]

export function CountCards({ counts }: { counts: Summary['counts'] }) {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-ui border border-line bg-line">
      {CARDS.map((c) => (
        <div key={c.key} className="bg-surface px-4 py-2.5">
          <div className="text-xs text-muted">{c.label}</div>
          <div className={`font-mono text-2xl tabular-nums ${counts[c.key] > 0 && c.tone ? c.tone : ''}`}>
            {counts[c.key]}
          </div>
        </div>
      ))}
    </div>
  )
}

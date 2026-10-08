import { minutesSince } from '../time'

/** Live waiting time in scenario minutes. No SLA promises, just the elapsed time. */
export function WaitingTimer({ since, now, className = '' }: { since: string | null | undefined; now: Date | null; className?: string }) {
  const m = minutesSince(since, now)
  const text = m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
  return <span className={`font-mono tabular-nums ${className}`}>{text}</span>
}

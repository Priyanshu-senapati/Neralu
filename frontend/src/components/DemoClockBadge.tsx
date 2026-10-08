export function DemoClockBadge({ speed, maxAttempts }: { speed: number; maxAttempts: number }) {
  return (
    <span className="whitespace-nowrap rounded-ui border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
      Demo time ×{speed} · {maxAttempts} attempts (production: 3)
    </span>
  )
}

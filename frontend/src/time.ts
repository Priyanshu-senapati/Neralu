import { useEffect, useState } from 'react'

const hhmm = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
})
const dayFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
})

export const fmtTime = (iso: string | null | undefined) => (iso ? hhmm.format(new Date(iso)) : '—')
export const fmtDay = (d: Date) => dayFmt.format(d)

/** Scenario "now", advanced locally at demo speed between server updates. */
export function useScenarioNow(anchorIso: string | undefined, speed: number): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (!anchorIso) return
    const anchor = new Date(anchorIso).getTime()
    const realStart = Date.now()
    const tick = () => setNow(new Date(anchor + (Date.now() - realStart) * speed))
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [anchorIso, speed])
  return now
}

/** Whole scenario minutes elapsed since `iso`. */
export const minutesSince = (iso: string | null | undefined, now: Date | null) =>
  iso && now ? Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000)) : 0

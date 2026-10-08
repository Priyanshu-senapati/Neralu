import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap, reducedMotion } from '../motion'

/**
 * A number that glides to its new value. React renders only the first value; GSAP owns the
 * text afterwards, so a re-render can never flash the final number before the tween starts.
 */
export function AnimatedNumber({ value, from, className = '' }: { value: number; from?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(from ?? value)
  const [initial] = useState(from ?? value)

  useEffect(() => {
    const el = ref.current
    if (!el || shown.current === value) return
    if (reducedMotion()) {
      el.textContent = String(value)
      shown.current = value
      return
    }
    const o = { v: shown.current }
    const tween = gsap.to(o, {
      v: value,
      duration: Math.min(0.9, 0.35 + Math.abs(value - shown.current) * 0.004),
      onUpdate: () => {
        shown.current = Math.round(o.v)
        el.textContent = String(shown.current)
      },
    })
    return () => {
      tween.kill()
    }
  }, [value])

  return <span ref={ref} className={className}>{initial}</span>
}

/** A check mark that draws itself once, for confirmations (case resolved, person registered). */
export function DrawnCheck({ className = 'h-5 w-5' }: { className?: string }) {
  const circle = useRef<SVGCircleElement>(null)
  const tick = useRef<SVGPathElement>(null)

  useLayoutEffect(() => {
    if (reducedMotion() || !circle.current || !tick.current) return
    const tl = gsap.timeline()
    tl.from(circle.current, { drawSVG: '0%', duration: 0.45 })
      .from(tick.current, { drawSVG: '0%', duration: 0.3 }, '-=0.15')
    return () => {
      tl.kill()
    }
  }, [])

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true">
      <circle ref={circle} cx="12" cy="12" r="10" />
      <path ref={tick} d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  )
}

import { useEffect, useRef } from 'react'
import { gsap, reducedMotion } from '@/motion'
import { cn } from '@/lib/utils'

/*
 * A soft light that follows the cursor inside its parent (ibelick/spotlight, rebuilt on GSAP so
 * the site needs no second animation library). Mouse-only: it never appears on touch, and it is
 * skipped for reduced motion. Decorative, so hidden from assistive technology.
 */
export function Spotlight({ className, size = 420, color = 'rgba(242, 184, 75, 0.16)' }: { className?: string; size?: number; color?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent || reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' })
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' })
    const move = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect()
      x(e.clientX - r.left - size / 2)
      y(e.clientY - r.top - size / 2)
    }
    const enter = () => gsap.to(el, { opacity: 1, duration: 0.4 })
    const leave = () => gsap.to(el, { opacity: 0, duration: 0.4 })
    parent.addEventListener('pointermove', move)
    parent.addEventListener('pointerenter', enter)
    parent.addEventListener('pointerleave', leave)
    return () => {
      parent.removeEventListener('pointermove', move)
      parent.removeEventListener('pointerenter', enter)
      parent.removeEventListener('pointerleave', leave)
    }
  }, [size])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none absolute left-0 top-0 rounded-full opacity-0 blur-2xl', className)}
      style={{ width: size, height: size, background: `radial-gradient(circle at center, ${color}, transparent 70%)` }}
    />
  )
}

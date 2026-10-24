import { useEffect, type RefObject } from 'react'

/**
 * Story cards (marked data-rim) catch light on the edge nearest the pointer. One pointermove
 * listener, at most one update per frame, and only for cards on screen; CSS draws the light.
 */
export function useRimLight(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let raf = 0
    let x = 0
    let y = 0
    const paint = () => {
      raf = 0
      for (const card of el.querySelectorAll<HTMLElement>('[data-rim]')) {
        const r = card.getBoundingClientRect()
        if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue
        card.style.setProperty('--rx', `${x - r.left}px`)
        card.style.setProperty('--ry', `${y - r.top}px`)
      }
    }
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (!raf) raf = requestAnimationFrame(paint)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [root])
}

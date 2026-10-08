/**
 * Motion for Neralu. One curve, short durations, and motion only where it explains a change:
 * a row moving up because it became urgent, a number that changed, a case that just arrived.
 * Frequent updates (the clock, every refetch) never animate. Reduced motion skips all of it.
 */
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { Flip } from 'gsap/Flip'

gsap.registerPlugin(CustomEase, DrawSVGPlugin, Flip)

/** Strong ease-out: instant response, long gentle settle (same curve as --ease-out in tokens.css). */
export const EASE = CustomEase.create('neralu', '0.23, 1, 0.32, 1')

gsap.defaults({ ease: EASE, duration: 0.5 })

/** Reduced motion, or '?still' in the URL: every animation shows its finished state (for slides and screenshots). */
export const reducedMotion = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(window.location.search).has('still'))

/** Hex values GSAP can interpolate (it cannot tween CSS custom properties directly). */
export const FLASH = { alert: '#FBE9E5', ok: '#E8F3EC' }

export { Flip, gsap }

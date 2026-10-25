import { gsap, reducedMotion, ScrollTrigger } from '../../motion'

/*
 * Smooth wheel scrolling for notched mouse wheels (Windows and Linux). A notch moves the page about
 * 100 px at once, so the scroll-played scenes step; here each notch moves a target instead and the
 * page glides to it, settling within about a third of a second. Only the wheel is taken over:
 * keyboard, scrollbar, touch, find-in-page and in-page links scroll natively, and the glide stops
 * the moment anything else moves the page. macOS and iOS already scroll with inertia, and reduced
 * motion means no glide, so both are left alone.
 */

const RATE = 9 // per second: how fast the page closes on its target (95 % within a third of a second)
const LINE = 100 / 6 // px per line, for wheels that report lines (Firefox)

const apple = () => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || navigator.platform || navigator.userAgent)
}

/** A box under the pointer that can still scroll this way takes the wheel itself. */
function scrollsInside(from: EventTarget | null, dy: number) {
  for (let el = from instanceof Element ? from : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight) continue
    const { overflowY } = getComputedStyle(el)
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true
  }
  return false
}

/** Starts smoothing the wheel on this page; returns the function that stops it. */
export function smoothWheel(): () => void {
  if (reducedMotion() || apple()) return () => {}
  const root = document.scrollingElement ?? document.documentElement
  let target = 0
  let current = 0
  let gliding = false

  const wheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return // zoom, sideways scroll
    const dy = e.deltaY * (e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? window.innerHeight : 1)
    if (Math.abs(e.deltaX) > Math.abs(dy) || scrollsInside(e.target, dy)) return
    e.preventDefault()
    if (!gliding) target = current = window.scrollY
    target = Math.min(Math.max(target + dy, 0), root.scrollHeight - window.innerHeight)
    gliding = true
  }
  const tick = (_time: number, dtMs: number) => {
    if (!gliding) return
    // Something else moved the page (the scrollbar, a key, a link): let it, and stop gliding.
    if (Math.abs(window.scrollY - current) > 2) {
      gliding = false
      return
    }
    current += (target - current) * (1 - Math.exp((-RATE * dtMs) / 1000))
    if (Math.abs(target - current) < 0.5) {
      current = target
      gliding = false
    }
    // 'instant': the page's CSS asks for smooth scrolling, which would animate on top of this.
    window.scrollTo({ top: current, behavior: 'instant' })
    ScrollTrigger.update() // pins and scrubbed scenes follow in this same frame
  }
  window.addEventListener('wheel', wheel, { passive: false })
  gsap.ticker.add(tick, false, true) // before GSAP renders this frame's tweens
  return () => {
    window.removeEventListener('wheel', wheel)
    gsap.ticker.remove(tick)
  }
}

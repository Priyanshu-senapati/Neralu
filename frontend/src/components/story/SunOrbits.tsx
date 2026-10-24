import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { token, useTheme } from '@/theme'
import { reducedMotion } from '../../motion'
import { OrbitTooltip } from './OrbitTooltip'
import { heat, useHeatValue } from './useScrollHeat'
import { makeValueNoise1 } from './noise'
import {
  COS_TILT, DOT_R0, DOT_R1, H_END, HIT_R, HitGrid, MAX_FRAME, R_MIN_F, SPRING_C, SPRING_K, STEP, WAKE_LEN,
  conicRadius, countCalled, depth01, dotScale, heat01, isCalled, magnetForce, mixRGB, omegaAt, orbitFor,
  parseColor, radiusFor, rgba, springAccel, type Household, type RGB,
} from './orbitPhysics'

/*
 * Ward 47 as a solar system. Each household orbits the sun at the distance of its own heat
 * threshold; as the afternoon heats up, a heat front spreads out from the sun and every household
 * inside it turns orange, because Neralu calls them today. One canvas, one frame loop, physics on a
 * fixed 1/120 s step; React re-renders only when the hovered household or the count changes.
 */

const TAU = Math.PI * 2
const WAKE_SPAN_S = 12 // a wake never keeps more than this much past track
const DRIFT = 0.006 // the sun's drift, in widths per second: the wakes stream out behind it
const BUCKETS = 12 // dot colours are drawn in this many batches

interface Colors {
  brand: RGB
  heat: RGB
  sun: RGB
  paper: RGB
  ink: RGB
  dark: boolean
}

const readColors = (): Colors => ({
  brand: parseColor(token('--brand')),
  heat: parseColor(token('--heat')),
  sun: parseColor(token('--sun')),
  paper: parseColor(token('--paper')),
  ink: parseColor(token('--ink')),
  dark: document.documentElement.dataset.theme !== 'light',
})

export default function SunOrbits({ households, className = '' }: { households: Household[]; className?: string }) {
  const still = reducedMotion()
  const theme = useTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const colors = useRef<Colors | null>(null)
  const redraw = useRef<() => void>(() => {})
  const pointer = useRef<{ x: number; y: number; touch: boolean } | null>(null)
  const pinned = useRef(-1) // the household the keyboard (or a tap) selected
  const [selected, setSelected] = useState(-1)
  const [stepping, setStepping] = useState(false)
  const selectedRef = useRef(-1)
  useLayoutEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const called = useHeatValue((H) => countCalled(households, H))
  // The heat label only matters while a card is open: otherwise scrolling re-renders nothing here.
  const open = selected >= 0
  const H = useHeatValue((h) => (open ? Math.round(h * 10) / 10 : 0))

  const orbits = useMemo(() => households.map(orbitFor), [households])

  // Colours come from the theme tokens; re-read them when the theme changes.
  useEffect(() => {
    colors.current = readColors()
    redraw.current()
  }, [theme])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!host || !canvas || !ctx) return
    colors.current ??= readColors()

    const n = households.length
    const thr = Float32Array.from(households, (h) => h.threshold)
    const aF = Float32Array.from(orbits, (o) => o.aF)
    const ecc = Float32Array.from(orbits, (o) => o.e)
    const varpi = Float32Array.from(orbits, (o) => o.varpi)
    const theta = Float32Array.from(orbits, (o) => o.theta0)
    const kamala = households.findIndex((h) => h.kamala)
    const H0 = heat.H
    // Sprung state: colour mix (0 shade green → 1 heat orange), dot radius, pointer offset.
    const mix = Float32Array.from(households, (h) => (isCalled(h.threshold, H0) ? 1 : 0))
    const mixV = new Float32Array(n)
    const rad = Float32Array.from(mix, (m) => (m ? DOT_R1 : DOT_R0))
    const radV = new Float32Array(n)
    const ox = new Float32Array(n)
    const oy = new Float32Array(n)
    const ovx = new Float32Array(n)
    const ovy = new Float32Array(n)
    // Where each dot was drawn this frame, for hit-testing and the tooltip.
    const px = new Float32Array(n)
    const py = new Float32Array(n)
    const dep = new Float32Array(n)
    const bucket = new Uint8Array(n)
    // Wakes: a ring of past positions per household, sampled so each keeps about one turn
    // (at most WAKE_SPAN_S), and stored against the sun's drift so the track streams out behind.
    const wx = new Float32Array(n * WAKE_LEN)
    const wy = new Float32Array(n * WAKE_LEN)
    const wHead = new Uint8Array(n)
    const wCount = new Uint8Array(n)
    const wEvery = new Float32Array(n)
    const wClock = new Float32Array(n)
    const grid = new HitGrid(24)
    const shimmer = makeValueNoise1(5)

    let width = 0
    let height = 0
    let dpr = 1
    let R = 1
    let cx = 0
    let cy = 0
    let narrow = false
    let drift = 0
    let time = 0
    let timeScale = 1
    let timeScaleV = 0
    let sunF = still ? 0.1 : 0.07 + 0.03 * heat01(H0)
    let sunV = 0
    let acc = 0
    let last = 0
    let raf = 0
    let onScreen = true
    let slowFrames = 0
    let wakeStride = 1 // 2 on a slow machine: every other wake

    const layout = () => {
      const r = host.getBoundingClientRect()
      width = r.width
      height = r.height
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      narrow = width < 768
      R = Math.min(width, height)
      // Phone: the sun sits low and the copy above it. Wider: the sun to the right of the copy.
      cx = width * (narrow ? 0.5 : 0.7)
      cy = height * (narrow ? 0.78 : 0.54)
      const rMin = R_MIN_F * R
      for (let i = 0; i < n; i++) {
        const period = TAU / omegaAt(aF[i] * R, rMin)
        wEvery[i] = Math.min(period * 1.1, WAKE_SPAN_S) / WAKE_LEN
      }
      wCount.fill(0)
    }

    const step = (dt: number) => {
      const H = heat.H
      const hf = heat01(H)
      // Time slows while someone reads a household's card, so the card can keep up with its dot.
      const tsTarget = selectedRef.current >= 0 ? 0.18 : 1
      timeScaleV += springAccel(timeScale, timeScaleV, tsTarget, 40, 2 * Math.sqrt(40)) * dt
      timeScale += timeScaleV * dt
      const sim = dt * timeScale
      time += sim
      drift += DRIFT * width * sim
      sunV += springAccel(sunF, sunV, 0.07 + 0.03 * hf) * dt
      sunF += sunV * dt

      const rMin = R_MIN_F * R
      const p = pointer.current
      for (let i = 0; i < n; i++) {
        const a = aF[i] * R
        const r = conicRadius(a, ecc[i], theta[i], varpi[i])
        theta[i] += omegaAt(r, rMin) * sim
        const on = H >= thr[i]
        mixV[i] += springAccel(mix[i], mixV[i], on ? 1 : 0) * dt
        mix[i] += mixV[i] * dt
        radV[i] += springAccel(rad[i], radV[i], on ? DOT_R1 : DOT_R0) * dt
        rad[i] += radV[i] * dt
        // Magnetic hover: pushed out from the pointer, sprung back onto the orbit.
        let fx = 0
        let fy = 0
        if (p && !p.touch) {
          const bx = cx + r * Math.cos(theta[i]) + ox[i] - p.x
          const by = cy + r * Math.sin(theta[i]) * COS_TILT + oy[i] - p.y
          const d = Math.hypot(bx, by)
          if (d > 0.001) {
            const f = magnetForce(d)
            fx = (f * bx) / d
            fy = (f * by) / d
          }
        }
        ovx[i] += (-SPRING_K * ox[i] - SPRING_C * ovx[i] + fx) * dt
        ovy[i] += (-SPRING_K * oy[i] - SPRING_C * ovy[i] + fy) * dt
        ox[i] += ovx[i] * dt
        oy[i] += ovy[i] * dt
        // Wake sample: only households inside the heat front keep one; it grows from the dot.
        wClock[i] += sim
        if (wClock[i] >= wEvery[i]) {
          wClock[i] = 0
          if (on) {
            const k = i * WAKE_LEN + wHead[i]
            wx[k] = r * Math.cos(theta[i]) - drift
            wy[k] = r * Math.sin(theta[i]) * COS_TILT
            wHead[i] = (wHead[i] + 1) % WAKE_LEN
            if (wCount[i] < WAKE_LEN) wCount[i]++
          } else wCount[i] = 0
        }
      }
    }

    const ellipse = (r: number, from = 0, to = TAU) => {
      ctx.beginPath()
      ctx.ellipse(cx, cy, r, r * COS_TILT, 0, from, to)
    }

    const draw = () => {
      const c = colors.current!
      const H = still ? H_END : heat.H
      const hf = heat01(H)
      const glow = c.dark ? 'lighter' : 'source-over'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < n; i++) {
        const r = conicRadius(aF[i] * R, ecc[i], theta[i], varpi[i])
        px[i] = cx + r * Math.cos(theta[i]) + ox[i]
        py[i] = cy + r * Math.sin(theta[i]) * COS_TILT + oy[i]
        dep[i] = depth01(theta[i])
        bucket[i] = Math.min(BUCKETS - 1, Math.max(0, Math.round(mix[i] * (BUCKETS - 1))))
      }
      grid.rebuild(px, py, n, width, height)

      // The heat front: today's heat index on the same scale as the thresholds. It breathes.
      const front = radiusFor(H, R) * (1 + (still ? 0 : 0.015 * Math.sin((time * TAU) / 4)))
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, COS_TILT)
      const fill = ctx.createRadialGradient(0, 0, front * 0.2, 0, 0, front)
      fill.addColorStop(0, rgba(c.heat, 0))
      fill.addColorStop(0.85, rgba(c.heat, (c.dark ? 0.05 : 0.04) + 0.07 * hf))
      fill.addColorStop(1, rgba(c.heat, 0))
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(0, 0, front, 0, TAU)
      ctx.fill()
      ctx.restore()
      // Faint orbit guides at each whole degree of threshold, 31–39 °C.
      ctx.lineWidth = 1
      ctx.strokeStyle = rgba(c.ink, c.dark ? 0.06 : 0.08)
      for (let t = 31; t <= 39; t++) {
        ellipse(radiusFor(t, R))
        ctx.stroke()
      }
      const frontRing = (from: number, to: number) => {
        ctx.lineWidth = 1.5
        ctx.strokeStyle = rgba(c.heat, 0.35 + 0.4 * hf)
        ellipse(front, from, to)
        ctx.stroke()
      }
      frontRing(Math.PI, TAU) // far half, behind the sun

      // Wakes, batched by age into four strokes so ~400 trails cost four draw calls.
      if (!still) {
        ctx.globalCompositeOperation = glow
        ctx.lineWidth = 1
        const bands = 4
        const per = WAKE_LEN / bands
        for (let b = 0; b < bands; b++) {
          ctx.beginPath()
          for (let i = 0; i < n; i += wakeStride) {
            const count = wCount[i]
            if (count < 2 || mix[i] < 0.5) continue
            // Segment j runs from the j-th newest sample to the one before it; band b covers j in [b·per, (b+1)·per).
            const lo = b * per
            const hi = Math.min(count - 1, (b + 1) * per)
            if (lo >= hi) continue
            for (let j = lo; j <= hi; j++) {
              const k = i * WAKE_LEN + ((wHead[i] - 1 - j + WAKE_LEN * 2) % WAKE_LEN)
              const x = cx + wx[k] + drift
              const y = cy + wy[k]
              if (j === lo) ctx.moveTo(j === 0 ? px[i] : x, j === 0 ? py[i] : y)
              ctx.lineTo(x, y)
            }
          }
          ctx.strokeStyle = rgba(c.heat, (c.dark ? 0.34 : 0.4) * (1 - b / bands) * (0.4 + 0.6 * hf))
          ctx.stroke()
        }
        ctx.globalCompositeOperation = 'source-over'
      }

      const dots = (near: boolean) => {
        for (let b = 0; b < BUCKETS; b++) {
          ctx.beginPath()
          let any = false
          for (let i = 0; i < n; i++) {
            if (bucket[i] !== b || dep[i] >= 0.5 !== near) continue
            const s = rad[i] * dotScale(dep[i])
            ctx.moveTo(px[i] + s, py[i])
            ctx.arc(px[i], py[i], s, 0, TAU)
            any = true
          }
          if (!any) continue
          ctx.globalAlpha = near ? 1 : 0.55
          ctx.fillStyle = rgba(mixRGB(c.brand, c.heat, b / (BUCKETS - 1)))
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      dots(false)

      // The sun: it grows and its corona brightens with the heat, and the corona shimmers.
      const core = sunF * R
      const sx = cx + (still ? 0 : shimmer(time * 0.3) * R * 0.01)
      const sy = cy + (still ? 0 : shimmer(time * 0.3 + 40) * R * 0.006)
      ctx.globalCompositeOperation = glow
      const corona = ctx.createRadialGradient(sx, sy, core * 0.6, sx, sy, core * (3.2 + hf))
      const sunTone = mixRGB(c.sun, c.heat, 0.35 * hf)
      corona.addColorStop(0, rgba(sunTone, 0.32 + 0.38 * hf))
      corona.addColorStop(0.35, rgba(sunTone, 0.1 + 0.14 * hf))
      corona.addColorStop(1, rgba(sunTone, 0))
      ctx.fillStyle = corona
      ctx.beginPath()
      ctx.arc(sx, sy, core * (3.2 + hf), 0, TAU)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      // Dark theme: a white-hot centre. Light theme: the tokens are deep (for text on paper), so the
      // centre is lifted toward the paper instead, or the sun would read as a dark planet.
      const body = ctx.createRadialGradient(cx - core * 0.25, cy - core * 0.3, core * 0.1, cx, cy, core)
      body.addColorStop(0, rgba(c.dark ? mixRGB(c.sun, [255, 255, 255], 0.55) : mixRGB(c.heat, c.paper, 0.55)))
      body.addColorStop(1, rgba(c.dark ? sunTone : mixRGB(c.heat, c.paper, 0.12)))
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(cx, cy, core, 0, TAU)
      ctx.fill()

      frontRing(0, Math.PI) // near half, in front of the sun
      dots(true)

      // Kamala, the demo persona: a ring and her name, so the call further down has a face here.
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace'
      if (kamala >= 0) {
        const s = rad[kamala] * dotScale(dep[kamala]) + 4
        ctx.lineWidth = 1.25
        ctx.strokeStyle = rgba(c.ink, 0.9)
        ctx.beginPath()
        ctx.arc(px[kamala], py[kamala], s, 0, TAU)
        ctx.stroke()
        ctx.fillStyle = rgba(c.ink, 0.85)
        ctx.fillText('Kamala R.', px[kamala] + s + 5, py[kamala] + 4)
      }
      // The household whose card is open gets the same ring, so the card clearly belongs to it.
      const open = selectedRef.current
      if (open >= 0 && open !== kamala && open < n) {
        ctx.lineWidth = 1.25
        ctx.strokeStyle = rgba(c.ink, 0.9)
        ctx.beginPath()
        ctx.arc(px[open], py[open], rad[open] * dotScale(dep[open]) + 4, 0, TAU)
        ctx.stroke()
      }
      // The front's own label, at its right-hand edge (a phone has no room; the counter shows it).
      if (!narrow) {
        ctx.fillStyle = rgba(c.heat, 0.9)
        const lx = Math.min(cx + front * Math.cos(0.45) + 8, width - 72)
        ctx.fillText(`${H.toFixed(1)} °C`, lx, cy + front * Math.sin(0.45) * COS_TILT + 4)
      }

      // A veil over the copy's side, so the text stays readable over the system.
      const veil = narrow ? ctx.createLinearGradient(0, 0, 0, height * 0.62) : ctx.createLinearGradient(0, 0, width * 0.62, 0)
      veil.addColorStop(0, rgba(c.paper, 0.9))
      veil.addColorStop(0.55, rgba(c.paper, 0.55))
      veil.addColorStop(1, rgba(c.paper, 0))
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, width, height)

      // The open card follows its dot.
      const sel = selectedRef.current
      const tip = tipRef.current
      if (tip && sel >= 0) {
        const tw = tip.offsetWidth
        const th = tip.offsetHeight
        let tx = px[sel] + 14
        let ty = py[sel] - th - 10
        if (tx + tw > width - 8) tx = px[sel] - tw - 14
        if (ty < 8) ty = py[sel] + 14
        tip.style.transform = `translate3d(${Math.round(Math.max(8, tx))}px, ${Math.round(Math.min(height - th - 8, ty))}px, 0)`
      }
    }
    redraw.current = draw

    const pick = () => {
      const p = pointer.current
      if (!p || pinned.current >= 0) return
      const i = grid.nearest(p.x, p.y, p.touch ? HIT_R + 8 : HIT_R)
      canvas.style.cursor = i >= 0 ? 'pointer' : ''
      if (i !== selectedRef.current) setSelected(i)
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const raw = last ? (now - last) / 1000 : STEP
      last = now
      // A slow machine (a projector laptop): after 30 slow frames in a row, keep half the wakes.
      slowFrames = raw > 0.024 ? slowFrames + 1 : 0
      if (slowFrames > 30) wakeStride = 2
      acc += Math.min(raw, MAX_FRAME)
      while (acc >= STEP) {
        step(STEP)
        acc -= STEP
      }
      draw()
      pick()
    }
    const start = () => {
      if (still || raf || !onScreen || document.hidden) return
      last = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    layout()
    if (still) {
      // One still frame at the heatwave, no wakes; hover still works and redraws on demand.
      mix.forEach((_, i) => {
        mix[i] = isCalled(thr[i], H_END) ? 1 : 0
        rad[i] = mix[i] ? DOT_R1 : DOT_R0
      })
      draw()
    } else start()

    const ro = new ResizeObserver(() => {
      layout()
      draw()
    })
    ro.observe(host)
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      if (onScreen) start()
      else stop()
    })
    io.observe(host)
    const vis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', vis)

    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, touch: e.pointerType !== 'mouse' }
    }
    const move = (e: PointerEvent) => {
      at(e)
      if (still) {
        pick()
        draw()
      }
    }
    const leave = () => {
      pointer.current = null
      if (pinned.current < 0) setSelected(-1)
    }
    const down = (e: PointerEvent) => {
      at(e)
      // A tap opens the nearest household's card (or closes it on empty space).
      if (e.pointerType !== 'mouse') {
        const i = grid.nearest(pointer.current!.x, pointer.current!.y, HIT_R + 8)
        pinned.current = i
        setSelected(i)
        if (still) draw()
      }
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerdown', down)

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', vis)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointerdown', down)
      redraw.current = () => {}
    }
  }, [households, orbits, still])

  // Keyboard: step through the households Neralu calls at the current heat.
  const calledIdx = useCallback(() => {
    const H = still ? H_END : heat.H
    const list = households.map((h, i) => (isCalled(h.threshold, H) ? i : -1)).filter((i) => i >= 0)
    const k = households.findIndex((h) => h.kamala)
    // Kamala first when she is called: her call is the one the page follows.
    return list.length ? [...list.filter((i) => i === k), ...list.filter((i) => i !== k)] : households.map((_, i) => i)
  }, [households, still])

  const show = (i: number) => {
    pinned.current = i
    setSelected(i)
    requestAnimationFrame(() => redraw.current())
  }
  const onStepKey = (e: React.KeyboardEvent) => {
    if (!stepping) return
    const list = calledIdx()
    const at = Math.max(0, list.indexOf(pinned.current))
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') show(list[(at + 1) % list.length])
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') show(list[(at - 1 + list.length) % list.length])
    else if (e.key === 'Escape') stopStepping()
    else return
    e.preventDefault()
  }
  const stopStepping = () => {
    setStepping(false)
    pinned.current = -1
    setSelected(-1)
  }

  const shownH = still ? H_END : H
  const shownCalled = still ? countCalled(households, H_END) : called
  const household = selected >= 0 ? households[selected] ?? null : null

  return (
    <div ref={hostRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Ward 47 drawn as a solar system: ${households.length} households orbit a sun, each at the distance of its own heat threshold. ${shownCalled} of ${households.length} are inside the heat front and get a call.`}
        className="absolute inset-0 h-full w-full touch-pan-y"
      />
      <OrbitTooltip ref={tipRef} household={household} H={shownH} announce={stepping} />
      <button
        type="button"
        onClick={() => (stepping ? stopStepping() : (setStepping(true), show(calledIdx()[0])))}
        onKeyDown={onStepKey}
        onBlur={() => stepping && stopStepping()}
        aria-pressed={stepping}
        className="absolute bottom-4 right-4 z-10 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-xs text-muted hover:text-ink focus-visible:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:bottom-6 sm:right-6"
      >
        {stepping ? 'Use arrow keys · Esc to stop' : 'Step through households'}
      </button>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { useTheme } from '@/theme'
import { makeSimplex2 } from './noise'
import { MAX_FRAME, heat01, mixRGB, parseColor, rgba, type RGB } from './orbitPhysics'
import { heat } from './useScrollHeat'

/*
 * The story page's background: faint motes of air drifting on a curl-noise flow field, rising
 * faster and warming from shade green to heat orange as the hero's heat index climbs. Past the
 * hero the heat stays where it ended and the haze settles to a slow drift. No trails, so the text
 * on top stays readable. Not mounted at all for reduced motion.
 */

const FLOW_SCALE = 0.0016 // noise-field zoom: one swirl is a few hundred pixels across
const FLOW_SPEED = 22 // px/s along the flow
const RISE = 6 // px/s upward drift on a normal day
const BUOYANCY = 38 // extra px/s upward at the full heatwave
const ALPHA = [0.6, 1, 1.45] // three brightness groups
const LIT = [1, 2.2, 3.6] // how strongly a mote is lit by the sun (far, near, close)

export default function HeatHaze() {
  const theme = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useRef<{ brand: RGB; heat: RGB; dark: boolean } | null>(null)

  useEffect(() => {
    const el = canvasRef.current ?? document.documentElement
    const token = (name: string) => getComputedStyle(el).getPropertyValue(name).trim()
    colors.current = {
      brand: parseColor(token('--brand')),
      heat: parseColor(token('--heat')),
      dark: document.documentElement.dataset.theme !== 'light',
    }
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const noise = makeSimplex2(47)
    let width = 0
    let height = 0
    let dpr = 1
    let count = 0
    let x = new Float32Array(0)
    let y = new Float32Array(0)
    let size = new Float32Array(0)
    let group = new Uint8Array(0)
    let lit = new Uint8Array(0)
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

    const populate = (n: number) => {
      count = n
      x = new Float32Array(n)
      y = new Float32Array(n)
      size = new Float32Array(n)
      group = new Uint8Array(n)
      lit = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        x[i] = rand() * width
        y[i] = rand() * height
        size[i] = 0.7 + rand() * 1.2
        group[i] = Math.floor(rand() * ALPHA.length)
      }
    }
    const layout = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      // Resizes (a phone's address bar) keep the motes where they are; only the count can change.
      const want = width < 768 ? 300 : 700
      if (x.length !== want) populate(want)
    }

    let t = 0
    let energy = 1
    let last = 0
    let raf = 0
    let slowFrames = 0
    const eps = 1

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const raw = last ? (now - last) / 1000 : 1 / 60
      last = now
      // A slow machine: after 30 slow frames in a row, keep half the motes.
      slowFrames = raw > 0.024 ? slowFrames + 1 : 0
      if (slowFrames > 30 && count > 150) {
        count = Math.floor(count / 2)
        slowFrames = 0
      }
      const dt = Math.min(raw, MAX_FRAME)
      const hf = heat01(heat.H)
      // Past the hero the haze settles to a slow drift.
      energy += ((heat.settled ? 0.35 : 1) - energy) * Math.min(1, dt * 2)
      t += dt * energy
      const flow = FLOW_SPEED * energy * dt
      const rise = (RISE + BUOYANCY * hf) * energy * dt
      const ox = t * 0.04
      const oy = t * 0.025

      for (let i = 0; i < count; i++) {
        // Curl of a noise potential: a divergence-free flow, so motes swirl without clumping.
        const nx = x[i] * FLOW_SCALE + ox
        const ny = y[i] * FLOW_SCALE - oy
        const dpdy = (noise(nx, ny + eps * FLOW_SCALE) - noise(nx, ny - eps * FLOW_SCALE)) / (2 * eps)
        const dpdx = (noise(nx + eps * FLOW_SCALE, ny) - noise(nx - eps * FLOW_SCALE, ny)) / (2 * eps)
        x[i] += dpdy * flow * 260
        y[i] += -dpdx * flow * 260 - rise
        if (y[i] < -8) {
          y[i] = height + 8
          x[i] = rand() * width
        }
        if (x[i] < -8) x[i] += width + 16
        else if (x[i] > width + 8) x[i] -= width + 16
      }

      const c = colors.current
      if (!c) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = c.dark ? 'lighter' : 'source-over'
      const tone = mixRGB(c.brand, c.heat, hf)
      const base = 0.05 + 0.13 * hf
      // Motes near the sun catch its light: brightness falls off with the square of the distance.
      const sun = heat.sun
      const sunTone = mixRGB(tone, [255, 214, 160], 0.7)
      for (let i = 0; i < count; i++) {
        const d2 = sun.on ? ((x[i] - sun.x) ** 2 + (y[i] - sun.y) ** 2) / (240 * 240) : 99
        lit[i] = Math.min(LIT.length - 1, Math.floor(2.4 / (1 + d2)))
      }
      for (let l = 0; l < LIT.length; l++) {
        for (let g = 0; g < ALPHA.length; g++) {
          ctx.beginPath()
          let any = false
          for (let i = 0; i < count; i++) {
            if (group[i] !== g || lit[i] !== l) continue
            ctx.moveTo(x[i] + size[i], y[i])
            ctx.arc(x[i], y[i], size[i], 0, Math.PI * 2)
            any = true
          }
          if (!any) continue
          ctx.fillStyle = rgba(l ? mixRGB(tone, sunTone, l / (LIT.length - 1)) : tone, Math.min(0.55, base * ALPHA[g] * LIT[l] * (c.dark ? 1 : 1.3)))
          ctx.fill()
        }
      }
    }
    const start = () => {
      if (raf || document.hidden) return
      last = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    layout()
    start()
    const ro = new ResizeObserver(layout)
    ro.observe(canvas)
    const vis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', vis)
    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
}

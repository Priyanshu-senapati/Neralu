/*
 * The story hero's physics, as pure functions (no DOM), so each rule can be checked on its own.
 *
 * Ward 47's households orbit a sun. A household's distance from the sun is its own heat threshold
 * (backend/app/risk.py personal_threshold_c): the most vulnerable orbit closest. The heat front is
 * the same mapping applied to today's heat index, so a household inside the front is one that
 * calls_due() would phone today (heat index >= threshold).
 */

import { personalThreshold } from '@/heat'
import type { ElderListItem } from '@/types'

/** Thresholds run about 30–40 °C; that range spans the drawn orbits. */
export const T_MIN = 30
export const T_MAX = 40
/** The scroll moves the example afternoon from a normal day to a heatwave. */
export const H_START = 31
export const H_END = 38
/** Orbit radii as fractions of R = min(width, height). */
export const R_MIN_F = 0.16
export const R_MAX_F = 0.46
export const JITTER_F = 0.012
/** The orbit plane is tilted 62° away from the viewer: circles read as ellipses in depth. */
export const TILT = (62 * Math.PI) / 180
export const COS_TILT = Math.cos(TILT)
/** The innermost orbit takes about this long. */
export const INNER_PERIOD_S = 14
export const OMEGA0 = (2 * Math.PI) / INNER_PERIOD_S
/** Critically damped spring: c = 2√k, so it settles without overshoot. */
export const SPRING_K = 170
export const SPRING_C = 2 * Math.sqrt(SPRING_K)
/** Fixed physics step, and the most frame time one frame may feed it (a tab coming back). */
export const STEP = 1 / 120
export const MAX_FRAME = 0.05
/** Pointer "magnet": dots within this radius are pushed outward. */
export const MAGNET_R = 90
export const MAGNET_F = 1400
/** Screen positions kept per household for its wake. */
export const WAKE_LEN = 28
/** Hover picks the nearest dot within this many pixels. */
export const HIT_R = 12
/** Dot radius, uncalled → called. */
export const DOT_R0 = 2.2
export const DOT_R1 = 3.4

const TAU = Math.PI * 2
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/* -------------------------------- data ---------------------------------- */

export interface Household {
  id: number
  name: string
  age: number | null
  threshold: number
  factors: string[]
  simulated: boolean
  /** The demo persona, Kamala R.: marked with a ring. */
  kamala: boolean
  /** Where the household is, so the hero can put it on the ward. */
  lat: number
  lng: number
}

/**
 * Households from the live list. The threshold is the example afternoon's: a mild night, so no
 * warm-night degree off (the live console's threshold_c follows its own weather).
 */
export function householdsFrom(elders: ElderListItem[]): Household[] {
  return elders.map((e) => ({
    id: e.id,
    name: e.name,
    age: e.age,
    threshold: personalThreshold(e.risk_score),
    factors: e.risk_factors,
    simulated: e.is_simulated,
    kamala: e.source === 'demo',
    lat: e.lat,
    lng: e.lng,
  }))
}

/**
 * While the list loads, or if it fails: 401 example households with the seeded ward's threshold
 * spread (31 °C: 1 · 32: 5 · 33: 14 · 34: 39 · 35: 81 · 36: 104 · 37: 92 · 38: 53 · 39: 12).
 * Shown with an "example data" label.
 */
const EXAMPLE_SPREAD: [number, number][] = [[31, 1], [32, 5], [33, 13], [34, 39], [35, 81], [36, 104], [37, 92], [38, 53], [39, 12]]

export function exampleHouseholds(): Household[] {
  const out: Household[] = [
    { id: 0, name: 'Kamala R.', age: 74, threshold: 33, factors: ['Age 74', 'Lives alone', 'Sheet roof', 'Heat-sensitive medicines'], simulated: false, kamala: true, lat: 12.9262, lng: 77.5851 },
  ]
  // Spread over the ward's footprint (about 1 km across), from a fixed seed.
  const rand = mulberry32(401)
  for (const [threshold, n] of EXAMPLE_SPREAD)
    for (let k = 0; k < n; k++)
      out.push({ id: out.length, name: `Example household ${out.length}`, age: null, threshold, factors: [], simulated: true, kamala: false, lat: 12.925 + (rand() - 0.5) * 0.009, lng: 77.584 + (rand() - 0.5) * 0.009 })
  return out
}

/** Points per risk factor, as in backend/app/risk.py, to pick the two that weigh most. */
export function factorPoints(label: string): number {
  const age = /^Age (\d+)/.exec(label)
  if (age) return Number(age[1]) >= 80 ? 30 : Number(age[1]) >= 70 ? 20 : 10
  return ({ 'Lives alone': 20, 'Sheet roof': 15, 'Heat-sensitive medicines': 15, 'No fan': 10, 'Memory difficulty': 10, 'Top floor': 8, 'Hearing difficulty': 5 } as Record<string, number>)[label] ?? 0
}

export const topFactors = (factors: string[], n = 2) =>
  [...factors].sort((a, b) => factorPoints(b) - factorPoints(a)).slice(0, n)

/* ------------------------------ heat rule ------------------------------- */

/** The real rule: a household is called when the heat index reaches its own threshold. */
export const isCalled = (threshold: number, H: number) => H >= threshold

export const countCalled = (households: Household[], H: number) =>
  households.reduce((n, h) => n + (isCalled(h.threshold, H) ? 1 : 0), 0)

/** 0 on a normal afternoon (31 °C) → 1 in the heatwave (38 °C). */
export const heat01 = (H: number) => clamp((H - H_START) / (H_END - H_START), 0, 1)

/* ------------------------------- orbits --------------------------------- */

/** Threshold → orbit radius: 30 °C at 0.16 R, 40 °C at 0.46 R, straight line between. */
export function radiusFor(threshold: number, R: number): number {
  const t = (clamp(threshold, T_MIN, T_MAX) - T_MIN) / (T_MAX - T_MIN)
  return (R_MIN_F + t * (R_MAX_F - R_MIN_F)) * R
}

/** Kepler's third law (T² ∝ r³): angular speed falls as r^-1.5, so inner orbits run faster. */
export const omegaAt = (r: number, rMin: number, omega0 = OMEGA0) => omega0 * (rMin / r) ** 1.5

/** A slightly eccentric orbit: r(θ) = a(1 − e²) / (1 + e·cos(θ − ϖ)). */
export const conicRadius = (a: number, e: number, theta: number, varpi: number) =>
  (a * (1 - e * e)) / (1 + e * Math.cos(theta - varpi))

/** Integer hash for per-household seeds. */
export function hash32(n: number): number {
  let x = (n + 0x9e3779b9) | 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  return (x ^ (x >>> 16)) >>> 0
}

export function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let x = Math.imul(t ^ (t >>> 15), t | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** One household's fixed orbit, in units of R so a resize only rescales it. */
export interface Orbit {
  aF: number
  e: number
  varpi: number
  theta0: number
}

export function orbitFor(h: Household): Orbit {
  const rand = mulberry32(hash32(h.id))
  return {
    aF: radiusFor(h.threshold, 1) + (rand() * 2 - 1) * JITTER_F,
    e: rand() * 0.08,
    varpi: rand() * TAU,
    theta0: rand() * TAU,
  }
}

/** 0 at the back of the tilted plane, 1 at the front (nearest the viewer). */
export const depth01 = (theta: number) => (Math.sin(theta) + 1) / 2
export const dotScale = (d01: number) => 0.75 + 0.35 * d01

/* ------------------------------- springs -------------------------------- */

/** a = −k(x − target) − c·v */
export const springAccel = (x: number, v: number, target: number, k = SPRING_K, c = SPRING_C) => -k * (x - target) - c * v

/** One semi-implicit Euler step: velocity first, then position with the new velocity. */
export function springStep(x: number, v: number, target: number, dt = STEP): [number, number] {
  const nv = v + springAccel(x, v, target) * dt
  return [x + nv * dt, nv]
}

/** Outward push on a dot d pixels from the pointer: F = 1400 (1 − d/R_m)². */
export const magnetForce = (d: number) => (d < MAGNET_R ? MAGNET_F * (1 - d / MAGNET_R) ** 2 : 0)

/* ------------------------------- colour --------------------------------- */

export type RGB = [number, number, number]

export function parseColor(c: string): RGB {
  const s = c.trim()
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).replace(/./g, (x) => x + x) : s.slice(1, 7)
    const n = parseInt(h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const m = s.match(/[\d.]+/g)
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [255, 255, 255]
}

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const rgba = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`

/* ------------------------------ hit testing ------------------------------ */

/** A uniform grid over the canvas, rebuilt each frame, so hover never searches all dots. */
export class HitGrid {
  private cols = 1
  private rows = 1
  private head = new Int32Array(1)
  private next = new Int32Array(0)
  private xs: Float32Array = new Float32Array(0)
  private ys: Float32Array = new Float32Array(0)
  private cell: number
  constructor(cell = 24) {
    this.cell = cell
  }

  rebuild(xs: Float32Array, ys: Float32Array, n: number, width: number, height: number) {
    this.cols = Math.max(1, Math.ceil(width / this.cell))
    this.rows = Math.max(1, Math.ceil(height / this.cell))
    if (this.head.length < this.cols * this.rows) this.head = new Int32Array(this.cols * this.rows)
    if (this.next.length < n) this.next = new Int32Array(n)
    this.head.fill(-1, 0, this.cols * this.rows)
    this.xs = xs
    this.ys = ys
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i] / this.cell)
      const cy = Math.floor(ys[i] / this.cell)
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue
      const c = cy * this.cols + cx
      this.next[i] = this.head[c]
      this.head[c] = i
    }
  }

  /** Index of the nearest point within maxD of (x, y), or −1. */
  nearest(x: number, y: number, maxD = HIT_R): number {
    const cx = Math.floor(x / this.cell)
    const cy = Math.floor(y / this.cell)
    const reach = Math.ceil(maxD / this.cell)
    let best = -1
    let bestD = maxD * maxD
    for (let gy = cy - reach; gy <= cy + reach; gy++) {
      if (gy < 0 || gy >= this.rows) continue
      for (let gx = cx - reach; gx <= cx + reach; gx++) {
        if (gx < 0 || gx >= this.cols) continue
        for (let i = this.head[gy * this.cols + gx]; i !== -1; i = this.next[i]) {
          const d = (this.xs[i] - x) ** 2 + (this.ys[i] - y) ** 2
          if (d <= bestD) {
            bestD = d
            best = i
          }
        }
      }
    }
    return best
  }
}

/* ------------------------------ self-check ------------------------------- */

/** Run once from the browser console: (await import('/src/components/story/orbitPhysics.ts')).__selfTest() */
export function __selfTest(): true {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`orbitPhysics: ${what}`)
  }
  const R = 800
  const rMin = radiusFor(T_MIN, R)
  const rMax = radiusFor(T_MAX, R)
  assert(Math.abs(rMin - 0.16 * R) < 1e-9 && Math.abs(rMax - 0.46 * R) < 1e-9, 'threshold → radius endpoints')
  assert(Math.abs(radiusFor(35, R) - 0.31 * R) < 1e-9, 'threshold → radius is linear')
  assert(radiusFor(29, R) === rMin && radiusFor(41, R) === rMax, 'thresholds outside 30–40 °C clamp')
  assert(omegaAt(rMin, rMin) > omegaAt(radiusFor(35, R), rMin) && omegaAt(radiusFor(35, R), rMin) > omegaAt(rMax, rMin), 'Kepler: inner orbits run faster')
  assert(Math.abs((2 * Math.PI) / omegaAt(rMin, rMin) - INNER_PERIOD_S) < 1e-9, 'innermost period is 14 s')
  let x = 0
  let v = 0
  for (let t = 0; t < 1; t += STEP) [x, v] = springStep(x, v, 1)
  assert(Math.abs(x - 1) < 0.01, 'spring settles within 1 s at k = 170')
  let peak = 0
  ;[x, v] = [0, 0]
  for (let t = 0; t < 2; t += STEP) {
    ;[x, v] = springStep(x, v, 1)
    peak = Math.max(peak, x)
  }
  assert(peak <= 1.0001, 'critically damped: no overshoot')
  const hs = exampleHouseholds()
  assert(hs.length === 401, 'example ward has 401 households')
  assert(countCalled(hs, H_START) <= countCalled(hs, 35) && countCalled(hs, 35) <= countCalled(hs, H_END), 'more heat never calls fewer people')
  assert(isCalled(33, 33) && !isCalled(33, 32.9), 'called exactly at the threshold, as calls_due')
  assert(magnetForce(0) === MAGNET_F && magnetForce(MAGNET_R) === 0, 'magnet force range')
  return true
}

import * as THREE from 'three'
import { EARTH_KM } from './geo'

/*
 * The hero's camera script, as functions of scroll progress p (0–1). Pure apart from vector maths,
 * so the stages can be checked on their own (__selfTest).
 *
 *   0–0.15     space: the sun close up, Earth on its orbit behind it
 *   0.15–0.45  fly: past the sun (it falls away behind) to Earth; the orbit eases to a stop and
 *              Earth turns until Bengaluru faces the camera in afternoon light
 *   0.45–0.70  descend: India, then Bengaluru; altitude falls logarithmically, like a map zoom
 *   0.70–1     ward: Ward 47 from 3 km up; the heat rises and the households light up
 */

export const SUN_RADIUS = 8
export const ORBIT_RADIUS = 64
export const ALT_START = 6 // Earth radii above the ward when the descent begins
export const ALT_CITY = 26 / EARTH_KM
export const ALT_WARD = 4.6 / EARTH_KM
export const AFTERNOON = (50 * Math.PI) / 180 // the sun stands this far west of the ward's zenith

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** Ken Perlin's smootherstep: zero velocity and acceleration at both ends, so stages hand over without a jolt. */
export const ease = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export const flyAt = (p: number) => ease(0.15, 0.45, p)
/** Earth's orbital speed, as a share of its normal speed: it eases to a stop as we fly in. */
export const orbitSpeedAt = (p: number) => 1 - flyAt(p)
/** Altitude above the ward, in Earth radii: logarithmic in p, so every doubling of zoom takes the same scroll. */
export function altitudeAt(p: number): number {
  const lerpLog = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t)
  if (p < 0.7) return lerpLog(ALT_START, ALT_CITY, ease(0.45, 0.7, p))
  return lerpLog(ALT_CITY, ALT_WARD, ease(0.7, 0.92, p))
}
/** How far the view leans from straight down at the end: an oblique look over the rooftops. */
export const tiltAt = (p: number) => 0.3 * ease(0.55, 0.95, p)
export const heatAt = (p: number) => 31 + 7 * ease(0.74, 0.97, p)
export const cloudsAt = (p: number) => 1 - ease(0.5, 0.62, p)
export const cityPatchAt = (p: number) => ease(0.5, 0.6, p)
export const wardPatchAt = (p: number) => ease(0.64, 0.74, p)
export const householdsAt = (p: number) => ease(0.7, 0.8, p)

/** The opening shot: the sun close, Earth's orbit beyond it. */
export const OPENING = { pos: new THREE.Vector3(6, 7, 40), target: new THREE.Vector3(-11, 0, -6) }

export interface Pose {
  pos: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
}

const UP = new THREE.Vector3(0, 1, 0)
const SUN_AT = new THREE.Vector3(0, 0, 0)
const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() }

/**
 * The camera at progress p. `earth` is Earth's centre, `ward` the unit vector from it to Ward 47
 * (both in world space, after Earth's orbit and spin), `north` the local north at the ward.
 */
export function poseAt(p: number, earth: THREE.Vector3, ward: THREE.Vector3, north: THREE.Vector3, out: Pose): Pose {
  const f = flyAt(p)
  const alt = altitudeAt(p)
  const tilt = tiltAt(p)
  // Above the ward: leaning back toward the south by `tilt`, looking at the ward, north up the screen.
  const surface = tmp.a.copy(ward).add(earth)
  const above = tmp.b.copy(ward).multiplyScalar(Math.cos(tilt)).addScaledVector(north, -Math.sin(tilt)).multiplyScalar(alt).add(surface)
  if (f >= 1) {
    out.pos.copy(above)
    out.target.copy(surface)
    out.up.copy(UP).lerp(north, ease(0.45, 0.6, p)).normalize()
    return out
  }
  // The fly-in: a high arc over the sun, so it falls away below the camera while still in view,
  // then a turn toward Earth and the run in to it. The camera never passes through the sun.
  const ctrl = tmp.c.copy(OPENING.pos).add(above).multiplyScalar(0.5)
  const away = tmp.d.copy(ctrl).setY(0).normalize()
  ctrl.addScaledVector(away, SUN_RADIUS * 2).addScaledVector(UP, SUN_RADIUS * 9)
  const u = 1 - f
  out.pos.copy(OPENING.pos).multiplyScalar(u * u).addScaledVector(ctrl, 2 * u * f).addScaledVector(above, f * f)
  const turn = ease(0.31, 0.45, p) // keep the sun in frame, receding, then look ahead to Earth
  out.target.copy(OPENING.target).lerp(SUN_AT, ease(0.15, 0.25, p)).lerp(surface, turn)
  out.up.copy(UP)
  return out
}

/** Run in the browser console: (await import('/src/components/story/space/cameraPath.ts')).__selfTest() */
export function __selfTest(): true {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`cameraPath: ${what}`)
  }
  let prev = Infinity
  for (let p = 0.45; p <= 1; p += 0.01) {
    const a = altitudeAt(p)
    assert(a <= prev + 1e-12, `altitude only falls (p=${p.toFixed(2)})`)
    prev = a
  }
  assert(Math.abs(altitudeAt(0.7) - ALT_CITY) < 1e-9, 'descent hands over to the ward stage at the city altitude')
  assert(Math.abs(altitudeAt(1) - ALT_WARD) < 1e-9, 'ends 4.6 km up')
  assert(heatAt(0) === 31 && heatAt(1) === 38, 'heat runs 31 → 38 °C')
  assert(orbitSpeedAt(0) === 1 && orbitSpeedAt(0.5) === 0, 'the orbit stops before the descent')
  // The fly-in never enters the sun.
  const earth = new THREE.Vector3(0, 0, -ORBIT_RADIUS)
  const ward = new THREE.Vector3(0, 0, 1)
  const north = new THREE.Vector3(0, 1, 0)
  const pose: Pose = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() }
  for (let p = 0; p <= 0.45; p += 0.005) assert(poseAt(p, earth, ward, north, pose).pos.length() > SUN_RADIUS * 1.5, `clear of the sun at p=${p.toFixed(3)}`)
  return true
}

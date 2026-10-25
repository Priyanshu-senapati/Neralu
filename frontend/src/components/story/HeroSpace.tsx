import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { reducedMotion } from '../../motion'
import { useTheme } from '@/theme'
import { OrbitTooltip } from './OrbitTooltip'
import { H_END, HIT_R, HitGrid, heat01, isCalled, type Household } from './orbitPhysics'
import { heat, useHeatValue, useProgressValue } from './useScrollHeat'
import { AFTERNOON, ORBIT_RADIUS, SUN_RADIUS, cityPatchAt, cloudsAt, flyAt, householdsAt, orbitSpeedAt, poseAt, wardPatchAt, type Pose } from './space/cameraPath'
import { createEarth } from './space/earthMaterial'
import { KAMALA, WARD, latLngToVec } from './space/geo'
import { createGodRays } from './space/godRays'
import { createSun } from './space/sunMaterial'
import { createWard } from './space/wardLayer'

/*
 * The story hero, as one WebGL scene: the sun, Earth on its orbit, and Ward 47 on the ground.
 * Scrolling the pinned hero flies the camera past the sun to Earth and down to Kamala's street
 * (space/cameraPath.ts); the heat rises at the end and the households light up.
 *
 * Two passes share one camera pose: the far scene (stars, sun, orbit) with a deep depth range, then
 * the near scene (Earth and the ward) with a depth range fitted to the altitude, so depth stays
 * exact from space down to 3 km. God rays are a quarter-resolution pass while the sun is in view.
 * One frame loop, paused off screen and in hidden tabs; the pixel ratio steps down on slow machines.
 * The ward's layers are drawn once, invisibly, as soon as they load, so their shaders and textures
 * are ready before the descent (on Windows each shader is translated to Direct3D on first use).
 * Each frame reads the page layout once, before it writes any style, so it never forces a reflow.
 */

const UP = new THREE.Vector3(0, 1, 0)
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

function stars(count: number) {
  const pos = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const tint = new Float32Array(count)
  let seed = 3
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    pos.set([Math.cos(a) * r * 1500, u * 1500, Math.sin(a) * r * 1500], i * 3)
    size[i] = 0.6 + rand() ** 3 * 2.4
    tint[i] = rand()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1))
  const uniforms = { uTime: { value: 0 }, uPx: { value: 1 } }
  const m = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aTint; uniform float uTime; uniform float uPx;
      varying float vTint; varying float vTw;
      void main() {
        vTint = aTint;
        vTw = 0.75 + 0.25 * sin(uTime * (0.6 + aTint * 1.7) + aTint * 40.0);
        gl_PointSize = aSize * uPx;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vTint; varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d) * vTw;
        vec3 c = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), vTint);
        gl_FragColor = vec4(c * a, a);
      }`,
  })
  return { points: new THREE.Points(g, m), uniforms }
}

export default function HeroSpace({ households, className = '' }: { households: Household[]; className?: string }) {
  const still = reducedMotion()
  const theme = useTheme()
  const applyTheme = useRef<(dark: boolean) => void>(() => {})
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const cityLabel = useRef<HTMLDivElement>(null)
  const homeLabel = useRef<HTMLDivElement>(null)
  const pinned = useRef(-1)
  const [selected, setSelected] = useState(-1)
  const [stepping, setStepping] = useState(false)
  const [failed, setFailed] = useState(false)
  const selectedRef = useRef(-1)
  useLayoutEffect(() => {
    selectedRef.current = selected
  }, [selected])
  const atWard = useProgressValue((p) => householdsAt(p) > 0.6)
  const open = selected >= 0
  const H = useHeatValue((h) => (open ? Math.round(h * 10) / 10 : 0))

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    } catch {
      // No WebGL here: the hero's copy stands on its own.
      const id = requestAnimationFrame(() => setFailed(true))
      return () => cancelAnimationFrame(id)
    }
    renderer.autoClear = false
    const css = getComputedStyle(host)
    const color = (name: string, fallback: string) => new THREE.Color(css.getPropertyValue(name).trim() || fallback)
    renderer.setClearColor(color('--paper', '#030406'), 1)

    const far = new THREE.Scene()
    const near = new THREE.Scene()
    const farCam = new THREE.PerspectiveCamera(42, 1, 0.5, 4000)
    const nearCam = new THREE.PerspectiveCamera(42, 1, 0.01, 10)

    const sky = stars(2600)
    const sun = createSun(SUN_RADIUS)
    const orbitLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, i) => {
        const a = (i / 256) * Math.PI * 2
        return new THREE.Vector3(Math.sin(a) * ORBIT_RADIUS, 0, -Math.cos(a) * ORBIT_RADIUS)
      })),
      new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.16, depthWrite: false }),
    )
    far.add(sky.points, sun.group, orbitLine)

    const earthGroup = new THREE.Group()
    const earth = createEarth(renderer)
    const ward = createWard(households, { cool: color('--brand', '#5effc8'), hot: color('--heat', '#ff7a33') })
    earthGroup.add(earth.group, ward.group)
    near.add(earthGroup)
    const rays = createGodRays()

    // The ward and Kamala's home in Earth's own frame, and local north at the ward.
    const wardLocal = latLngToVec(WARD.lat, WARD.lng)
    const northLocal = latLngToVec(WARD.lat + 0.01, WARD.lng).sub(wardLocal).normalize()
    const kamalaLocal = latLngToVec(KAMALA.lat, KAMALA.lng, 1.00012)
    const grid = new HitGrid(24)
    const screen = { x: new Float32Array(households.length), y: new Float32Array(households.length) }

    let width = 0
    let height = 0
    let dpr = Math.min(1.75, window.devicePixelRatio || 1)
    let theta = 0.2 // Earth's place on its orbit: upper right of the sun in the opening shot
    let t = 0
    let p = heat.progress
    let last = 0
    let raf = 0
    let onScreen = true
    let slow = 0
    let avg = 1 / 60
    let prepare = false
    let alive = true
    const labelW = { city: 0, home: 0 }
    const E = new THREE.Vector3()
    const sunDir = new THREE.Vector3()
    const wardW = new THREE.Vector3()
    const northW = new THREE.Vector3()
    const v = new THREE.Vector3()
    const pose: Pose = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() }

    const measure = () => {
      labelW.city = (cityLabel.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
      labelW.home = (homeLabel.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
    }
    const layout = () => {
      measure()
      const r = host.getBoundingClientRect()
      width = r.width
      height = r.height
      renderer.setPixelRatio(dpr)
      renderer.setSize(width, height, false)
      for (const cam of [farCam, nearCam]) {
        cam.aspect = width / Math.max(1, height)
        // A phone is tall and narrow: widen the view so Earth and the ward still fit across.
        cam.fov = width < 768 ? 58 : 42
        cam.updateProjectionMatrix()
      }
    }

    const place = (sx: number, sy: number, el: HTMLElement | null, alpha: number, w: number) => {
      if (!el) return
      el.style.opacity = String(alpha)
      // Keep the whole label on screen: a narrow phone would otherwise cut it off at the edge.
      const x = Math.min(sx, width - w - 28)
      if (alpha > 0.01) el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(sy)}px, 0)`
    }
    const toScreen = (world: THREE.Vector3, cam: THREE.Camera) => {
      v.copy(world).project(cam)
      return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, behind: v.z > 1 }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const raw = last ? (now - last) / 1000 : 1 / 60
      last = now
      const dt = Math.min(raw, 0.05)
      // A slow machine (a projector laptop): when frames average under ~47 fps for half a second,
      // render fewer pixels, 1.75 → 1.25 → 1 → 0.8 of the screen's. An average, so a machine that
      // alternates fast and slow frames (judder) steps down too.
      avg += (Math.min(raw, 0.1) - avg) * 0.1
      slow = avg > 0.021 ? slow + 1 : 0
      if (slow > 30 && dpr > 0.8) {
        dpr = dpr > 1.3 ? 1.25 : dpr > 1.05 ? 1 : 0.8
        slow = 0
        avg = 1 / 60
        layout()
      }
      draw(dt)
    }

    const draw = (dt: number) => {
      // Read the layout first, before this frame writes any style.
      const r = host.getBoundingClientRect()
      const sel = selectedRef.current
      const tip = tipRef.current
      const tw = tip && sel >= 0 ? tip.offsetWidth : 0
      const th = tip && sel >= 0 ? tip.offsetHeight : 0
      t += dt
      // Follow the scroll with a light lag, so even a jerky wheel moves the camera smoothly.
      const goal = still ? 1 : heat.progress
      p += (goal - p) * Math.min(1, dt * 6) // eases toward the scroll (about a sixth of a second behind)
      if (Math.abs(goal - p) < 1e-4) p = goal
      const f = flyAt(p)
      theta += dt * ((Math.PI * 2) / 200) * orbitSpeedAt(p)
      E.set(Math.sin(theta) * ORBIT_RADIUS, 0, -Math.cos(theta) * ORBIT_RADIUS)
      sunDir.copy(E).negate().normalize()
      // Turn Earth so Ward 47 ends up facing the camera in afternoon light (sun to the west).
      const sunH = v.set(sunDir.x, 0, sunDir.z).normalize()
      const east = new THREE.Vector3().crossVectors(UP, sunH)
      const want = sunH.clone().multiplyScalar(Math.cos(AFTERNOON)).addScaledVector(east, Math.sin(AFTERNOON))
      const spinFree = 2.2 + t * 0.045
      const spinTarget = Math.atan2(want.x, want.z) - Math.atan2(wardLocal.x, wardLocal.z)
      const spin = spinFree + wrapPi(spinTarget - spinFree) * f
      earthGroup.position.copy(E)
      earthGroup.rotation.y = spin
      earthGroup.updateMatrixWorld()
      wardW.copy(wardLocal).applyAxisAngle(UP, spin)
      northW.copy(northLocal).applyAxisAngle(UP, spin)

      poseAt(p, E, wardW, northW, pose)
      for (const cam of [farCam, nearCam]) {
        cam.position.copy(pose.pos)
        cam.up.copy(pose.up)
        cam.lookAt(pose.target)
      }
      const alt = Math.max(1e-6, pose.pos.distanceTo(E) - 1)
      nearCam.near = Math.max(alt * 0.2, 2e-6)
      nearCam.far = alt + 3
      nearCam.updateProjectionMatrix()

      const H = still ? H_END : heat.H
      sky.uniforms.uTime.value = t
      sky.uniforms.uPx.value = dpr
      sun.update(t, dt, Math.max(0.35, heat01(H)), farCam)
      orbitLine.material.opacity = 0.16 * (1 - f)
      earth.update(sunDir, t, cloudsAt(p))
      const hh = householdsAt(p)
      ward.update({ sunDir, H, city: cityPatchAt(p), ward: wardPatchAt(p), households: hh, t, pixelRatio: dpr, prepare })
      prepare = false

      renderer.setRenderTarget(null)
      renderer.clear()
      renderer.render(far, farCam)
      renderer.clearDepth()
      renderer.render(near, nearCam)
      const sunOn = rays.render(renderer, farCam, sun.group.position, SUN_RADIUS, E, 0.85 * (1 - f))
      const s = toScreen(sun.group.position, farCam)
      heat.sun.x = r.left + s.x
      heat.sun.y = r.top + s.y
      heat.sun.on = sunOn && !s.behind

      // Labels: the city on the way down, then Kamala's home.
      const city = toScreen(v.copy(wardLocal).applyMatrix4(earthGroup.matrixWorld), nearCam)
      place(city.x, city.y, cityLabel.current, city.behind ? 0 : cityPatchAt(p) * (1 - hh), labelW.city)
      const home = toScreen(v.copy(kamalaLocal).applyMatrix4(earthGroup.matrixWorld), nearCam)
      place(home.x, home.y, homeLabel.current, home.behind ? 0 : hh, labelW.home)

      // The open card follows its household.
      if (tip && sel >= 0 && hh > 0.5) {
        const at = toScreen(v.fromArray(ward.local, sel * 3).applyMatrix4(earthGroup.matrixWorld), nearCam)
        let tx = at.x + 16
        let ty = at.y - th - 12
        if (tx + tw > width - 8) tx = at.x - tw - 16
        if (ty < 8) ty = at.y + 16
        tip.style.transform = `translate3d(${Math.round(Math.max(8, tx))}px, ${Math.round(Math.min(height - th - 8, ty))}px, 0)`
      }
    }

    // Hover and tap: project the households to the screen only when the pointer moves.
    const pick = (x: number, y: number, reach: number) => {
      if (householdsAt(p) < 0.6) return -1
      for (let i = 0; i < households.length; i++) {
        const at = toScreen(v.fromArray(ward.local, i * 3).applyMatrix4(earthGroup.matrixWorld), nearCam)
        screen.x[i] = at.behind ? -999 : at.x
        screen.y[i] = at.behind ? -999 : at.y
      }
      grid.rebuild(screen.x, screen.y, households.length, width, height)
      return grid.nearest(x, y, reach)
    }
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || pinned.current >= 0) return
      const [x, y] = local(e)
      const i = pick(x, y, HIT_R + 2)
      canvas.style.cursor = i >= 0 ? 'pointer' : ''
      if (i !== selectedRef.current) setSelected(i)
      if (still) draw(0)
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const [x, y] = local(e)
      const i = pick(x, y, HIT_R + 10)
      pinned.current = i
      setSelected(i)
      if (still) draw(0)
    }
    const leave = () => pinned.current < 0 && setSelected(-1)

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
    document.fonts?.ready.then(() => alive && measure())
    // Compile in parallel where the browser can, then draw the hidden ward once (see above).
    Promise.all([earth.ready, ward.ready])
      .then(() => (alive ? renderer.compileAsync(near, nearCam) : undefined))
      .catch(() => {})
      .then(() => {
        prepare = alive
      })
    if (still) {
      draw(0)
      earth.ready.then(() => draw(0))
    } else start()
    const ro = new ResizeObserver(() => {
      layout()
      if (still) draw(0)
    })
    ro.observe(host)
    const io = new IntersectionObserver(([en]) => {
      onScreen = en.isIntersecting
      if (onScreen) start()
      else stop()
    })
    io.observe(host)
    const vis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', vis)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerleave', leave)
    redraw.current = () => still && draw(0)
    // Light theme: a daylight sky in the page's paper colour; stars and the orbit line belong to the night.
    applyTheme.current = (dark: boolean) => {
      renderer.setClearColor(new THREE.Color(getComputedStyle(host).getPropertyValue('--paper').trim() || (dark ? '#030406' : '#f7f6f1')), 1)
      sky.points.visible = dark
      orbitLine.visible = dark
      if (still) draw(0)
    }
    applyTheme.current(document.documentElement.dataset.theme !== 'light')

    return () => {
      alive = false
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', vis)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerleave', leave)
      sun.dispose()
      earth.dispose()
      ward.dispose()
      rays.dispose()
      sky.points.geometry.dispose()
      ;(sky.points.material as THREE.Material).dispose()
      orbitLine.geometry.dispose()
      orbitLine.material.dispose()
      renderer.dispose()
      heat.sun.on = false
      redraw.current = () => {}
    }
  }, [households, still])
  const redraw = useRef<() => void>(() => {})
  useEffect(() => applyTheme.current(theme === 'dark'), [theme])

  // Keyboard: step through the households Neralu calls at the current heat (Kamala first).
  const calledIdx = useCallback(() => {
    const h = still ? H_END : heat.H
    const k = households.findIndex((x) => x.kamala)
    const list = households.map((x, i) => (isCalled(x.threshold, h) ? i : -1)).filter((i) => i >= 0)
    return list.length ? [...list.filter((i) => i === k), ...list.filter((i) => i !== k)] : households.map((_, i) => i)
  }, [households, still])
  const show = (i: number) => {
    pinned.current = i
    setSelected(i)
    requestAnimationFrame(() => redraw.current())
  }
  const stopStepping = () => {
    setStepping(false)
    pinned.current = -1
    setSelected(-1)
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

  const household = selected >= 0 && atWard ? households[selected] ?? null : null
  if (failed) return null
  return (
    <div ref={hostRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="The sun, and Earth on its orbit. Scrolling flies past the sun to Earth and down to Ward 47 in Bengaluru, where each household lights up when the heat crosses its own threshold."
        className="absolute inset-0 h-full w-full touch-pan-y"
      />
      <div ref={cityLabel} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 opacity-0">
        <div className="-translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap text-center">
          <div className="text-[0.9375rem] font-semibold text-ink">Bengaluru</div>
          <div className="text-xs text-muted">Ward 47 · demo ward</div>
        </div>
      </div>
      <div ref={homeLabel} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 opacity-0">
        <div className="translate-x-5 -translate-y-1/2 whitespace-nowrap rounded-[6px] bg-surface/90 px-2.5 py-1.5 text-[0.8125rem]">
          <span className="font-semibold text-ink">Kamala R.</span> <span className="text-muted">· 74 · her home</span>
        </div>
      </div>
      <OrbitTooltip ref={tipRef} household={household} H={still ? H_END : H} announce={stepping} />
      {atWard && (
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
      )}
    </div>
  )
}

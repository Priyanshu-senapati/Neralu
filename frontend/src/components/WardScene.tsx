import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { gsap, reducedMotion } from '@/motion'
import { elderStatus, toneHex } from '@/status'
import { useTheme } from '@/theme'
import { minutesSince } from '@/time'
import type { ElderListItem } from '@/types'

/*
 * The ward console's map, in 3D: every registered resident is a house on the Ward 47 plate at
 * their real position, as tall as their heat risk. In "Today's checks" the houses take their live
 * status colour; in "Heat risk" they show vulnerability. A home with a RED case is red in both
 * views; cases nobody has accepted glow, pulse and get a floating label (faster when overdue), an
 * accepted RED case keeps a steady glow. Real phones get a ring, hover shows who it is, click opens
 * the profile. Orbit with drag, zoom with the wheel, reset to the default view.
 *
 * The scene is built once per set of residents; refreshes (every ~0.7 s during a round) only
 * recolour and resize houses in place.
 */

export type WardView = 'risk' | 'status'

const CENTER = { lat: 12.925, lng: 77.5838 }
const HALF = { lat: 0.0102, lng: 0.0104 }
const PLATE = 2.3
const RISK = { high: '#e8622e', medium: '#ee9a45', low: '#59645e' }
const MAX_LABELS = 6
const BRIGHT_RED = new THREE.Color('#ffd0c4')

/** A soft round light (white, tinted per use) for the glow over urgent homes. Additive, no bloom pass. */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.22, 'rgba(255,255,255,0.6)')
  grd.addColorStop(0.55, 'rgba(255,255,255,0.15)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Homes marked on the map: every case waiting for someone to accept (RED or support), plus RED cases
 * already accepted (a volunteer is on the way: steady, not pulsing), most urgent first.
 */
function marked(elders: ElderListItem[]) {
  return elders
    .filter((e) => e.open_case && (e.open_case.state === 'open' || e.open_case.level === 'red'))
    .sort((a, b) => Number(b.open_case!.state === 'open') - Number(a.open_case!.state === 'open') ||
      Number(b.open_case!.level === 'red') - Number(a.open_case!.level === 'red') ||
      Number(b.open_case!.overdue) - Number(a.open_case!.overdue))
}

interface Props {
  elders: ElderListItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  view: WardView
  now: Date | null
  className?: string
}

interface Placed {
  e: ElderListItem
  x: number
  z: number
  h: number
  w: number
}

const place = (e: ElderListItem): Placed => ({
  e,
  x: ((e.lng - CENTER.lng) / HALF.lng) * (PLATE / 2) * 0.92,
  z: (-(e.lat - CENTER.lat) / HALF.lat) * (PLATE / 2) * 0.92,
  h: 0.035 + (e.risk_score / 100) * 0.24,
  w: e.is_simulated ? 0.05 : 0.07,
})

/** Residents whose case needs a person now, most urgent first (they get beacons and labels). */
function urgent(elders: ElderListItem[]) {
  return elders
    .filter((e) => e.open_case && e.open_case.state === 'open')
    .sort((a, b) => Number(b.open_case!.level === 'red') - Number(a.open_case!.level === 'red') || Number(b.open_case!.overdue) - Number(a.open_case!.overdue))
}

export default function WardScene({ elders, selectedId, onSelect, view, now, className = '' }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  const labelRefs = useRef(new Map<number, HTMLDivElement>())
  const api = useRef<{ update: () => void; reset: () => void } | null>(null)
  const latest = useRef({ elders, selectedId, view, onSelect })
  // Keep the newest props where the animation loop can read them (declared first, so it runs
  // before the recolour effect below).
  useEffect(() => {
    latest.current = { elders, selectedId, view, onSelect }
  })
  const theme = useTheme()
  const [hovered, setHovered] = useState<ElderListItem | null>(null)

  // Rebuild only when the set of residents changes (a new run or a registration), not on refresh.
  const roster = useMemo(() => elders.map((e) => e.id).join(','), [elders])

  useEffect(() => {
    const el = host.current
    if (!el || !roster) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
    const HOME = new THREE.Vector3(1.95, 2.2, 2.25) // close enough that houses read as houses

    scene.add(new THREE.HemisphereLight('#fff1dc', '#0b1612', 1.15))
    const sun = new THREE.DirectionalLight('#ffd7a3', 2.3)
    sun.position.set(2.2, 4.2, 1.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -1.7, right: 1.7, top: 1.7, bottom: -1.7, near: 0.5, far: 10 })
    sun.shadow.bias = -0.0015
    scene.add(sun)

    const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE, 0.08, PLATE), new THREE.MeshStandardMaterial({ color: '#16302a', roughness: 0.95 }))
    plate.position.y = -0.04
    plate.receiveShadow = true
    scene.add(plate)
    const grid = new THREE.GridHelper(PLATE, 10, '#2a4d41', '#2a4d41')
    grid.position.y = 0.002
    scene.add(grid)
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(PLATE, 0.08, PLATE)),
      new THREE.LineBasicMaterial({ color: '#74d3a4', transparent: true, opacity: 0.35 }),
    )
    edge.position.y = -0.04
    scene.add(edge)

    const items = latest.current.elders.map(place)
    const index = new Map(items.map((it, i) => [it.e.id, i]))
    const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }), items.length)
    houses.castShadow = true
    houses.receiveShadow = true
    scene.add(houses)

    // Rings at the base of real-phone homes, beacons over cases waiting for a person.
    const ringGeo = new THREE.RingGeometry(0.06, 0.074, 40)
    const realRings = items
      .filter((it) => !it.e.is_simulated)
      .map((it) => {
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#74d3a4', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }))
        ring.rotation.x = -Math.PI / 2
        ring.position.set(it.x, 0.004, it.z)
        scene.add(ring)
        return ring
      })
    // Beacons: a light beam, a glowing halo over the roof, a glow on the ground and two rings that
    // spread out, so a RED home reads from the back of a room on a projector. Normal blending, not
    // additive: additive red over the green homes would turn yellow.
    const glow = glowTexture()
    const additive = (opacity: number) =>
      ({ transparent: true, opacity, depthWrite: false, blending: THREE.NormalBlending }) as const
    const beaconPool = Array.from({ length: 12 }, () => {
      const g = new THREE.Group()
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.6, 10, 1, true), new THREE.MeshBasicMaterial(additive(0.75)))
      beam.position.y = 0.3
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, ...additive(0.95) }))
      halo.scale.setScalar(0.45)
      halo.position.y = 0.02
      const ground = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, ...additive(0.7) }))
      ground.scale.setScalar(0.8)
      const pulse = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, ...additive(1) }))
      pulse.rotation.x = -Math.PI / 2
      pulse.position.y = 0.005
      const pulse2 = pulse.clone()
      pulse2.material = (pulse.material as THREE.MeshBasicMaterial).clone()
      g.add(beam, halo, pulse, pulse2)
      g.visible = false
      ground.visible = false
      scene.add(g, ground)
      return { g, beam, halo, ground, pulse, pulse2 }
    })

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const col = new THREE.Color()
    // live: waiting for someone to accept (pulses); overdue: officer action needed (pulses faster);
    // idx: the home's instance, recoloured every frame while it pulses.
    let beacons: { b: (typeof beaconPool)[number]; it: Placed; idx: number; red: boolean; live: boolean; overdue: boolean }[] = []
    const redCol = new THREE.Color()

    const update = () => {
      const { elders: list, selectedId: sel, view: v } = latest.current
      const byId = new Map(list.map((e) => [e.id, e]))
      const toneCol = { ok: toneHex('ok'), watch: toneHex('watch'), support: toneHex('support'), alert: toneHex('alert'), neutral: '#4b5550' }
      items.forEach((it, i) => {
        const e = byId.get(it.e.id) ?? it.e
        it.e = e
        const s = elderStatus(e)
        const selected = e.id === sel
        const h = it.h * (selected ? 1.35 : 1)
        const w = it.w * (selected ? 1.5 : 1)
        m.compose(new THREE.Vector3(it.x, h / 2, it.z), q, new THREE.Vector3(w, h, w))
        houses.setMatrixAt(i, m)
        // A home with a RED case is red in both views: in "Heat risk" it would otherwise look like any
        // other high-risk home.
        if (e.open_case?.level === 'red') col.set(toneCol.alert)
        else if (v === 'risk') col.set(e.risk_score >= 60 ? RISK.high : e.risk_score >= 35 ? RISK.medium : RISK.low)
        else col.set(toneCol[s.tone])
        if (selected) col.lerp(new THREE.Color('#ffffff'), 0.35)
        houses.setColorAt(i, col)
      })
      houses.instanceMatrix.needsUpdate = true
      if (houses.instanceColor) houses.instanceColor.needsUpdate = true

      const waiting = marked(list).slice(0, beaconPool.length)
      redCol.set(toneCol.alert)
      beaconPool.forEach((b) => (b.g.visible = b.ground.visible = false))
      beacons = waiting.flatMap((e, k) => {
        const i = index.get(e.id)
        if (i === undefined) return []
        const it = items[i]
        const b = beaconPool[k]
        const red = e.open_case!.level === 'red'
        const live = e.open_case!.state === 'open'
        const c = red ? toneCol.alert : toneCol.support
        for (const mat of [b.beam.material, b.halo.material, b.ground.material, b.pulse.material, b.pulse2.material])
          (mat as THREE.MeshBasicMaterial | THREE.SpriteMaterial).color.set(c)
        b.g.position.set(it.x, it.h, it.z)
        b.ground.position.set(it.x, 0.01, it.z)
        b.beam.visible = live // accepted: a volunteer is on the way, so no beam calling for one
        b.pulse.visible = b.pulse2.visible = live
        b.g.visible = b.ground.visible = true
        return [{ b, it, idx: i, red, live, overdue: !!e.open_case!.overdue }]
      })
    }

    const fit = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const homeDistance = () => {
      // Back off on narrow panels so the plate's diagonal fits.
      const a = el.clientWidth / el.clientHeight
      return HOME.length() * (a < 1.4 ? 1.4 / Math.max(a, 0.6) : 1)
    }
    camera.position.copy(HOME).setLength(homeDistance())
    camera.lookAt(0, 0.05, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.05, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 1.6
    controls.maxDistance = 7.5
    controls.minPolarAngle = 0.25
    controls.maxPolarAngle = 1.32
    controls.rotateSpeed = 0.6
    renderer.domElement.style.cursor = 'grab'

    // Hover and click: which house is under the pointer.
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let pointer: { x: number; y: number } | null = null
    let downAt: { x: number; y: number } | null = null
    const pick = () => {
      if (!pointer) return null
      ndc.set((pointer.x / el.clientWidth) * 2 - 1, -(pointer.y / el.clientHeight) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObject(houses, false)[0]
      return hit?.instanceId !== undefined ? items[hit.instanceId] : null
    }
    let lastHover: number | null = null
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onLeave = () => {
      pointer = null
    }
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      renderer.domElement.style.cursor = 'grabbing'
    }
    const onUp = (e: PointerEvent) => {
      renderer.domElement.style.cursor = 'grab'
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
        const it = pick()
        if (it) latest.current.onSelect(it.e.id)
      }
      downAt = null
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const tmp = new THREE.Vector3()
    let t = 0
    let frame = 0
    let running = false
    const draw = () => {
      t += 1 / 60
      controls.update()
      let recoloured = false
      beacons.forEach(({ b, idx, red, live, overdue }, k) => {
        const halo = b.halo.material as THREE.SpriteMaterial
        const ground = b.ground.material as THREE.SpriteMaterial
        if (!live) {
          // Accepted: a steady glow, no pulse.
          halo.opacity = 0.55
          ground.opacity = 0.35
          return
        }
        const speed = overdue ? 1.5 : 0.8
        const p = (t * speed + k * 0.17) % 1
        const p2 = (p + 0.5) % 1
        b.pulse.scale.setScalar(1 + p * 4)
        b.pulse2.scale.setScalar(1 + p2 * 4)
        ;(b.pulse.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.9
        ;(b.pulse2.material as THREE.MeshBasicMaterial).opacity = (1 - p2) * 0.9
        const beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * speed + k)
        halo.opacity = 0.7 + 0.3 * beat
        b.halo.scale.setScalar(0.38 + 0.2 * beat)
        ground.opacity = 0.55 + 0.4 * beat
        if (red) {
          // The home itself breathes between its RED and a light red.
          col.copy(redCol).lerp(BRIGHT_RED, 0.55 * beat)
          houses.setColorAt(idx, col)
          recoloured = true
        }
      })
      if (recoloured && houses.instanceColor) houses.instanceColor.needsUpdate = true
      realRings.forEach((r) => ((r.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 2.4) * 0.35))
      renderer.render(scene, camera)

      // Hover: tooltip follows the pointer.
      const it = pick()
      const id = it?.e.id ?? null
      if (id !== lastHover) {
        lastHover = id
        setHovered(it?.e ?? null)
        renderer.domElement.style.cursor = it ? 'pointer' : downAt ? 'grabbing' : 'grab'
      }
      if (tooltip.current && pointer) tooltip.current.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 14}px)`

      // Floating labels over urgent homes.
      for (const { it: u } of beacons) {
        const lab = labelRefs.current.get(u.e.id)
        if (!lab) continue
        tmp.set(u.x, u.h + 0.55, u.z).project(camera)
        // Keep every label fully inside the map, however the ward is orbited or zoomed.
        const half = lab.offsetWidth / 2
        const lx = gsap.utils.clamp(half + 6, el.clientWidth - half - 6, (tmp.x * 0.5 + 0.5) * el.clientWidth)
        const ly = gsap.utils.clamp(lab.offsetHeight + 6, el.clientHeight - 6, (-tmp.y * 0.5 + 0.5) * el.clientHeight)
        lab.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -100%)`
        lab.style.opacity = tmp.z < 1 ? '1' : '0'
      }
    }
    const loop = () => {
      draw()
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || document.hidden) return
      running = true
      frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    fit()
    update()
    draw()
    const ro = new ResizeObserver(() => {
      fit()
      draw()
    })
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()))
    io.observe(el)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    if (!reducedMotion()) start()

    api.current = {
      update: () => {
        update()
        if (!running) draw()
      },
      reset: () => {
        const to = HOME.clone().setLength(homeDistance())
        if (reducedMotion()) {
          camera.position.copy(to)
          draw()
        } else gsap.to(camera.position, { x: to.x, y: to.y, z: to.z, duration: 0.9, ease: 'power3.inOut' })
      },
    }

    return () => {
      stop()
      api.current = null
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      el.removeChild(renderer.domElement)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      glow.dispose()
      renderer.dispose()
    }
  }, [roster])

  // Live data: recolour in place.
  useEffect(() => {
    api.current?.update()
  }, [elders, selectedId, view, theme])

  const labels = urgent(elders).slice(0, MAX_LABELS)

  return (
    <div ref={host} className={`relative overflow-hidden ${className}`}>
      {labels.map((e) => {
        const c = e.open_case!
        const red = c.level === 'red'
        return (
          <div
            key={e.id}
            ref={(n) => {
              if (n) labelRefs.current.set(e.id, n)
              else labelRefs.current.delete(e.id)
            }}
            className={`pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[4px] border px-2 py-1 text-xs shadow-[0_8px_20px_-10px_rgba(0,0,0,0.8)] ${red ? 'border-alert/50 bg-alert-bg text-alert' : 'border-support/50 bg-support-bg text-support'}`}
          >
            <span className="font-semibold">{e.name}</span> · {red ? 'RED' : 'Support'}
            {c.overdue ? ' · officer action needed' : ` · waiting ${minutesSince(c.opened_scenario, now)} min`}
          </div>
        )
      })}
      <div
        ref={tooltip}
        className={`pointer-events-none absolute left-0 top-0 z-10 max-w-[16rem] rounded-[5px] border border-line-strong bg-surface/95 px-3 py-2 text-xs text-ink shadow-[0_10px_28px_-12px_rgba(0,0,0,0.8)] transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}
      >
        {hovered && (
          <>
            <div className="font-semibold">
              {hovered.name} <span className="num font-normal text-muted">{hovered.age}</span>
              {hovered.is_simulated ? <span className="ml-1 font-normal text-muted">· simulated</span> : <span className="ml-1 font-normal text-brand">· real phone</span>}
            </div>
            <div className="mt-0.5">{elderStatus(hovered).label}</div>
            <div className="mt-0.5 text-muted">
              Heat risk <span className="num">{hovered.risk_score}</span> · {hovered.risk_factors.slice(0, 3).join(', ')}
            </div>
            <div className="mt-1 text-muted">Click to open the profile</div>
          </>
        )}
      </div>
      <button
        onClick={() => api.current?.reset()}
        className="absolute bottom-3 right-3 z-10 rounded-[4px] border border-line-strong bg-surface/90 px-2.5 py-1 text-xs text-muted hover:text-ink"
      >
        Reset view
      </button>
      <p className="pointer-events-none absolute bottom-3 left-3 z-10 text-xs text-muted [@media(pointer:coarse)]:hidden">
        Drag to orbit · scroll to zoom · click a home
      </p>
    </div>
  )
}

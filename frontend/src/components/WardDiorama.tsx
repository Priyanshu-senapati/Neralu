import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { personalThreshold } from '@/heat'
import { gsap, reducedMotion } from '@/motion'
import type { ElderListItem } from '@/types'

/*
 * Ward 47 in 3D: every registered resident is one house on the ward plate, placed from their real
 * coordinates, as tall as their heat risk. One authored moment: a heat wave sweeps across from the
 * sunny corner, the houses rise, and everyone over their personal threshold turns heat-orange.
 * The cursor tilts the ward slightly. Reduced motion: the finished scene, still.
 */

const CENTER = { lat: 12.925, lng: 77.5838 }
const HALF = { lat: 0.0102, lng: 0.0104 } // the ward boundary used on the console map
const PLATE = 2.3

const C = {
  plate: new THREE.Color('#183329'),
  street: new THREE.Color('#2a4d41'),
  house: new THREE.Color('#61716a'),
  called: new THREE.Color('#ee9a45'),
  calledHigh: new THREE.Color('#e8622e'),
  marker: new THREE.Color('#f6c56e'),
}

interface Props {
  elders: ElderListItem[]
  heat: number
  className?: string
}

export default function WardDiorama({ elders, heat, className = '' }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const kamalaRow = elders.find((e) => !e.is_simulated)
  const kamalaCalled = kamalaRow ? personalThreshold(kamalaRow.risk_score) <= heat : false
  const label = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el || elders.length === 0) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      return // no WebGL: the hero keeps its text and shader
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.domElement.style.display = 'block'
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50)
    camera.position.set(3.2, 3.1, 3.2)
    camera.lookAt(0, 0.16, 0)

    scene.add(new THREE.HemisphereLight('#fff1dc', '#0b1612', 1.1))
    const sun = new THREE.DirectionalLight('#ffd7a3', 2.4)
    sun.position.set(2.2, 4.2, 1.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -1.7, right: 1.7, top: 1.7, bottom: -1.7, near: 0.5, far: 10 })
    sun.shadow.bias = -0.0015
    scene.add(sun)

    const ward = new THREE.Group()
    scene.add(ward)

    // The plate and its street grid.
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(PLATE, 0.08, PLATE),
      new THREE.MeshStandardMaterial({ color: C.plate, roughness: 0.95 }),
    )
    plate.position.y = -0.04
    plate.receiveShadow = true
    ward.add(plate)
    const grid = new THREE.GridHelper(PLATE, 10, C.street, C.street)
    grid.position.y = 0.002
    ward.add(grid)

    // Houses: one instance per resident.
    const n = elders.length
    const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), n)
    houses.castShadow = true
    houses.receiveShadow = true
    ward.add(houses)

    const sunCorner = new THREE.Vector2(PLATE / 2, -PLATE / 2)
    const items = elders.map((e) => {
      const x = ((e.lng - CENTER.lng) / HALF.lng) * (PLATE / 2) * 0.92
      const z = (-(e.lat - CENTER.lat) / HALF.lat) * (PLATE / 2) * 0.92
      const called = personalThreshold(e.risk_score) <= heat
      return {
        x,
        z,
        h: 0.035 + (e.risk_score / 100) * 0.26,
        w: e.is_simulated ? 0.05 : 0.07,
        d: Math.hypot(x - sunCorner.x, z - sunCorner.y),
        target: called ? (e.risk_score >= 60 ? C.calledHigh : C.called) : C.house,
        real: !e.is_simulated,
      }
    })
    const reach = Math.max(...items.map((i) => i.d)) + 0.4

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const col = new THREE.Color()
    const wave = { r: reducedMotion() ? reach : -0.2 }
    const layout = () => {
      items.forEach((it, i) => {
        const p = gsap.utils.clamp(0, 1, (wave.r - it.d) / 0.45)
        const k = 1 - Math.pow(1 - p, 3)
        const h = it.h * (0.12 + 0.88 * k)
        m.compose(new THREE.Vector3(it.x, h / 2, it.z), q, new THREE.Vector3(it.w, h, it.w))
        houses.setMatrixAt(i, m)
        houses.setColorAt(i, col.copy(C.house).lerp(it.target, k))
      })
      houses.instanceMatrix.needsUpdate = true
      if (houses.instanceColor) houses.instanceColor.needsUpdate = true
    }
    layout()

    // Kamala's house: a beam and a ring, and an HTML label that follows it on screen.
    const kamala = items.find((i) => i.real)
    const marker = new THREE.Group()
    if (kamala) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.55, 8),
        new THREE.MeshBasicMaterial({ color: C.marker, transparent: true, opacity: 0.9 }),
      )
      beam.position.y = kamala.h + 0.3
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.105, 48), new THREE.MeshBasicMaterial({ color: C.marker, side: THREE.DoubleSide, transparent: true }))
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.006
      marker.add(beam, ring)
      marker.position.set(kamala.x, 0, kamala.z)
      ward.add(marker)
    }
    const labelAnchor = new THREE.Vector3()

    const size = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const a = w / h
      // Fit the plate's diagonal (it swings wider when the cursor tilts it) inside the frame, with
      // a margin, whatever the panel's shape: never crop the corners.
      const halfDiagonal = (PLATE / 2) * Math.SQRT2 + 0.12
      const view = Math.max(1.12, halfDiagonal / a)
      Object.assign(camera, { left: -view * a, right: view * a, top: view, bottom: -view })
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(() => {
      size()
      draw()
    })

    // Gentle tilt towards the cursor, eased.
    const tilt = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      target.y = ((e.clientX - r.left) / r.width - 0.5) * 0.28
      target.x = ((e.clientY - r.top) / r.height - 0.5) * 0.12
    }
    const onLeave = () => Object.assign(target, { x: 0, y: 0 })

    const draw = () => {
      ward.rotation.y = tilt.y
      ward.rotation.x = tilt.x
      renderer.render(scene, camera)
      if (kamala && label.current) {
        labelAnchor.set(kamala.x, kamala.h + 0.62, kamala.z).applyMatrix4(ward.matrixWorld).project(camera)
        const x = (labelAnchor.x * 0.5 + 0.5) * el.clientWidth
        const y = (-labelAnchor.y * 0.5 + 0.5) * el.clientHeight
        label.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
        label.current.style.opacity = String(gsap.utils.clamp(0, 1, (wave.r - kamala.d) / 0.5))
      }
    }

    const still = reducedMotion()
    let frame = 0
    let running = false
    let t = 0
    const loop = () => {
      t += 1 / 60
      tilt.x += (target.x - tilt.x) * 0.06
      tilt.y += (target.y - tilt.y) * 0.06
      if (marker.children[1]) {
        const s = 1 + ((t * 0.6) % 1) * 0.9
        marker.children[1].scale.setScalar(s)
        ;(marker.children[1] as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>).material.opacity = 1 - ((t * 0.6) % 1)
      }
      draw()
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      if (still || running || document.hidden) return
      running = true
      frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    size()
    ro.observe(el)
    draw()

    const sweep = still ? null : gsap.to(wave, { r: reach, duration: 2.6, delay: 0.5, ease: 'power1.inOut', onUpdate: layout })
    if (still) draw()

    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()))
    io.observe(el)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)

    return () => {
      stop()
      sweep?.kill()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeChild(renderer.domElement)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
    }
  }, [elders, heat])

  return (
    <div ref={host} className={`relative ${className}`}>
      <div
        ref={label}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[4px] bg-paper px-2.5 py-1.5 text-xs text-ink opacity-0 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.6)]"
      >
        <span className="font-semibold">Kamala R., 74</span>{' '}
        <span className="text-muted">{kamalaCalled ? '· gets a call today' : '· below her threshold today'}</span>
      </div>
    </div>
  )
}

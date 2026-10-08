import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { geoBounds, geoGraticule10 } from 'd3'
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import { gsap, reducedMotion } from '@/motion'

/*
 * A dotted 3D earth (after 21st.dev's "wireframe dotted globe", rebuilt in three.js for real depth).
 * Land is drawn as dots coloured by broad climate zone, from heat orange near the tropics to mint
 * and blue towards the poles; illustrative, not a temperature map. The far side shows faintly
 * through the near side. Drag to spin (it coasts to a stop); it turns slowly on its own. On load
 * it swings round to India and a beacon marks Bengaluru, Ward 47.
 *
 * The land outlines ship with the site (public/data, Natural Earth 1:110m, public domain), so the
 * hero never depends on a third-party request on a venue's Wi-Fi.
 */

const BENGALURU = { lat: 12.97, lng: 77.59 }
const R = 1

type Land = FeatureCollection<Polygon | MultiPolygon>

/** Lat/lng in degrees to a point on the sphere (three.js: y up). */
function toVec(lat: number, lng: number, r = R) {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lng + 180)
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

function inRing([x, y]: Position, ring: Position[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inPolygon(p: Position, poly: Position[][]) {
  if (!inRing(p, poly[0])) return false
  for (let i = 1; i < poly.length; i++) if (inRing(p, poly[i])) return false
  return true
}

/** Evenly spaced dots over land: one degree-ish apart, widened in longitude so polar rows aren't crowded. */
function landDots(land: Land, step = 1.15): [number, number][] {
  const parts = land.features.map((f: Feature<Polygon | MultiPolygon>) => ({
    bounds: geoBounds(f),
    polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
  }))
  const dots: [number, number][] = []
  for (let lat = -84; lat <= 84; lat += step) {
    const dLng = step / Math.max(0.2, Math.cos(THREE.MathUtils.degToRad(lat)))
    for (let lng = -180; lng < 180; lng += dLng) {
      for (const part of parts) {
        const [[x0, y0], [x1, y1]] = part.bounds
        if (lat < y0 || lat > y1 || (x0 <= x1 && (lng < x0 || lng > x1))) continue
        if (part.polys.some((poly) => inPolygon([lng, lat], poly))) {
          dots.push([lat, lng])
          break
        }
      }
    }
  }
  return dots
}

// Climate-zone colours: hot tropics to cool poles.
const ZONES = [
  { lat: 0, c: new THREE.Color('#ff6a3d') },
  { lat: 18, c: new THREE.Color('#ff9a3c') },
  { lat: 32, c: new THREE.Color('#f6c97c') },
  { lat: 48, c: new THREE.Color('#74d3a4') },
  { lat: 66, c: new THREE.Color('#5fb4e8') },
  { lat: 90, c: new THREE.Color('#9fc4ff') },
]
function zoneColour(lat: number, out: THREE.Color) {
  const a = Math.abs(lat)
  for (let i = 1; i < ZONES.length; i++) {
    if (a <= ZONES[i].lat) {
      const t = (a - ZONES[i - 1].lat) / (ZONES[i].lat - ZONES[i - 1].lat)
      return out.copy(ZONES[i - 1].c).lerp(ZONES[i].c, t)
    }
  }
  return out.copy(ZONES[ZONES.length - 1].c)
}

// Round, depth-aware dots: the far hemisphere fades so the globe reads as a solid in space.
const DOT_VERTEX = /* glsl */ `
  attribute vec3 color;
  uniform float size;
  uniform float pixelRatio;
  varying vec3 vColor;
  varying float vFacing;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 normal = normalize(world.xyz);
    vec3 toCamera = normalize(cameraPosition - world.xyz);
    vFacing = dot(normal, toCamera);
    vColor = color;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * pixelRatio * (2.6 / -mv.z) * mix(0.55, 1.0, smoothstep(-0.2, 0.6, vFacing));
  }
`
const DOT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vFacing;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float edge = smoothstep(0.5, 0.32, d);
    float alpha = mix(0.16, 1.0, smoothstep(-0.25, 0.35, vFacing)) * edge;
    gl_FragColor = vec4(vColor * mix(0.55, 1.15, smoothstep(0.0, 0.9, vFacing)), alpha);
  }
`
// A thin rim of light where the atmosphere would be.
const RIM_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
const RIM_FRAGMENT = /* glsl */ `
  uniform vec3 glow;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
    gl_FragColor = vec4(glow, rim * 0.55);
  }
`

export default function HeatGlobe({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let disposed = false
    let cleanup = () => {}

    fetch('/data/land-110m.json')
      .then((r) => (r.ok ? (r.json() as Promise<Land>) : Promise.reject(new Error(String(r.status)))))
      .then((land) => {
        if (disposed) return
        cleanup = build(el, land, label.current)
        setReady(true)
      })
      .catch(() => !disposed && setFailed(true))

    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  return (
    <div ref={host} className={`relative ${className}`}>
      <div
        ref={label}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[4px] border border-line bg-surface/95 px-2.5 py-1.5 text-xs text-ink opacity-0 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.7)]"
      >
        <span className="font-semibold">Bengaluru</span> <span className="text-muted">· Ward 47</span>
      </div>
      {failed && <p className="absolute inset-0 grid place-items-center text-sm text-muted">The globe could not load.</p>}
      {ready && (
        <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-muted [@media(pointer:coarse)]:hidden">
          Drag to spin
        </p>
      )}
    </div>
  )
}

function build(el: HTMLDivElement, land: Land, labelEl: HTMLDivElement | null) {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  } catch {
    return () => {}
  }
  const pr = Math.min(window.devicePixelRatio, 2)
  renderer.setPixelRatio(pr)
  renderer.domElement.style.display = 'block'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  el.prepend(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50)
  camera.position.set(0, 0.35, 4.1)

  const globe = new THREE.Group()
  globe.rotation.z = THREE.MathUtils.degToRad(-12) // a gentle axial tilt reads as "a planet"
  scene.add(globe)

  // Dark core: hides most of the far side so the dots read as a surface, not a cloud.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.985, 64, 64),
    new THREE.MeshBasicMaterial({ color: '#03100b', transparent: true, opacity: 0.82 }),
  )
  globe.add(core)

  // Graticule: faint latitude/longitude lines every 10°.
  const lines: number[] = []
  for (const line of geoGraticule10().coordinates) {
    for (let i = 1; i < line.length; i++) {
      const a = toVec(line[i - 1][1], line[i - 1][0], R * 1.001)
      const b = toVec(line[i][1], line[i][0], R * 1.001)
      lines.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const gratGeo = new THREE.BufferGeometry()
  gratGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  globe.add(new THREE.LineSegments(gratGeo, new THREE.LineBasicMaterial({ color: '#74d3a4', transparent: true, opacity: 0.09 })))

  // Land dots.
  const dots = landDots(land)
  const pos = new Float32Array(dots.length * 3)
  const col = new Float32Array(dots.length * 3)
  const c = new THREE.Color()
  dots.forEach(([lat, lng], i) => {
    toVec(lat, lng, R * 1.004).toArray(pos, i * 3)
    zoneColour(lat, c).toArray(col, i * 3)
  })
  const dotGeo = new THREE.BufferGeometry()
  dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  dotGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: DOT_VERTEX,
    fragmentShader: DOT_FRAGMENT,
    uniforms: { size: { value: 4.2 }, pixelRatio: { value: pr } },
    transparent: true,
    depthWrite: false,
  })
  globe.add(new THREE.Points(dotGeo, dotMat))

  // Atmosphere rim.
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.09, 64, 64),
    new THREE.ShaderMaterial({
      vertexShader: RIM_VERTEX,
      fragmentShader: RIM_FRAGMENT,
      uniforms: { glow: { value: new THREE.Color('#74d3a4') } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  )
  scene.add(rim)

  // Bengaluru: a beacon and expanding rings, tangent to the surface.
  const site = toVec(BENGALURU.lat, BENGALURU.lng)
  const beacon = new THREE.Group()
  beacon.position.copy(site)
  beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), site.clone().normalize())
  globe.add(beacon)
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 8), new THREE.MeshBasicMaterial({ color: '#f6c97c' }))
  stalk.position.y = 0.11
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 16), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }))
  tip.position.y = 0.225
  beacon.add(stalk, tip)
  const rings = [0, 1, 2].map(() => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.028, 0.036, 48),
      new THREE.MeshBasicMaterial({ color: '#ff7b3f', side: THREE.DoubleSide, transparent: true, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.006
    beacon.add(ring)
    return ring
  })

  // Movement: drag with momentum; slow turn on its own; no wheel zoom (it would hijack page scroll).
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableZoom = false
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.rotateSpeed = 0.55
  controls.minPolarAngle = Math.PI * 0.18
  controls.maxPolarAngle = Math.PI * 0.82
  controls.autoRotateSpeed = 0.45
  controls.enabled = fine // on touch the hero must still scroll the page
  if (!fine) renderer.domElement.style.touchAction = 'pan-y'
  renderer.domElement.style.cursor = fine ? 'grab' : 'default'
  const grab = () => (renderer.domElement.style.cursor = 'grabbing')
  const release = () => (renderer.domElement.style.cursor = 'grab')
  controls.addEventListener('start', grab)
  controls.addEventListener('end', release)

  // Face India: rotate the globe so Bengaluru sits a little left of centre, towards the viewer.
  const still = reducedMotion()
  const facing = -THREE.MathUtils.degToRad(BENGALURU.lng + 90) + 0.35
  globe.rotation.y = still ? facing : facing + Math.PI * 1.15
  const intro = still
    ? null
    : gsap.to(globe.rotation, {
        y: facing,
        duration: 2.8,
        delay: 0.3,
        ease: 'power3.out',
        onComplete: () => {
          controls.autoRotate = true
        },
      })
  if (!still) camera.position.multiplyScalar(1.35)
  const zoom = still ? null : gsap.to(camera.position, { x: 0, y: 0.35, z: 4.1, duration: 2.6, delay: 0.3, ease: 'power3.out' })

  const size = () => {
    const w = el.clientWidth
    const h = el.clientHeight
    camera.aspect = w / h
    // Keep the whole globe and its rim in frame on narrow panels.
    camera.fov = w / h < 1 ? 35 / Math.max(0.62, w / h) : 35
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  size()
  const ro = new ResizeObserver(size)
  ro.observe(el)

  const anchor = new THREE.Vector3()
  const worldSite = new THREE.Vector3()
  let t = 0
  const draw = () => {
    t += 1 / 60
    controls.update()
    rings.forEach((ring, i) => {
      const k = (t * 0.55 + i / 3) % 1
      ring.scale.setScalar(1 + k * 3.2)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9
    })
    renderer.render(scene, camera)
    if (labelEl) {
      tip.getWorldPosition(anchor)
      worldSite.copy(anchor).normalize()
      const facingViewer = worldSite.dot(camera.position.clone().normalize())
      anchor.project(camera)
      const x = (anchor.x * 0.5 + 0.5) * el.clientWidth
      const y = (-anchor.y * 0.5 + 0.5) * el.clientHeight
      labelEl.style.transform = `translate(${x + 10}px, ${y}px) translate(0, -50%)`
      labelEl.style.opacity = String(gsap.utils.clamp(0, 1, (facingViewer - 0.15) * 3))
    }
  }

  let frame = 0
  let running = false
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
  draw()
  if (!still) {
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()))
    io.observe(el)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()
    return () => {
      stop()
      intro?.kill()
      zoom?.kill()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      teardown()
    }
  }
  // Still: draw on resize only.
  ro.disconnect()
  const ro2 = new ResizeObserver(() => {
    size()
    draw()
  })
  ro2.observe(el)
  return () => {
    ro2.disconnect()
    teardown()
  }

  function teardown() {
    controls.removeEventListener('start', grab)
    controls.removeEventListener('end', release)
    controls.dispose()
    el.removeChild(renderer.domElement)
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    renderer.dispose()
  }
}

import * as THREE from 'three'
import type { Household } from '../orbitPhysics'
import { latLngToVec, MOSAICS, tileLat, tileLng } from './geo'
import { loadTexture } from './textures'

/*
 * Ward 47 on the globe: two satellite mosaics laid on the sphere (Bengaluru, then the ward itself,
 * fading in as the camera comes down), and the households as points at their own coordinates.
 * Whether a household is called is decided in the shader from its threshold and the heat uniform,
 * the same rule as calls_due (heat index ≥ threshold), so the CPU does nothing per frame.
 */

const PATCH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normalize(position));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const PATCH_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uDim;
uniform vec3 uSun;
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb * 1.25;
  float ndl = max(dot(normalize(vNormalW), normalize(uSun)), 0.0);
  float edge = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  gl_FragColor = vec4(c * (0.22 + 1.05 * ndl) * (1.0 - 0.4 * uDim), uOpacity * edge);
}
`

const POINT_VERT = /* glsl */ `
attribute float aThreshold;
attribute float aKamala;
uniform float uH;
uniform float uSize;
varying float vCalled;
varying float vKamala;
void main() {
  vCalled = smoothstep(aThreshold - 0.4, aThreshold, uH);
  vKamala = aKamala;
  gl_PointSize = uSize * (1.0 + 0.35 * vCalled) * (aKamala > 0.5 ? 1.5 : 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const POINT_FRAG = /* glsl */ `
uniform vec3 uCool;
uniform vec3 uHot;
uniform float uFade;
varying float vCalled;
varying float vKamala;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.42, 0.18, d);
  float glow = exp(-d * d * 3.5) * 0.55;
  vec3 c = mix(uCool, uHot, vCalled);
  c = mix(c, vec3(1.0), core * 0.12);
  float a = clamp(core + glow, 0.0, 1.0) * uFade;
  gl_FragColor = vec4(c, a);
}
`
const PIN_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFade;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float pulse = fract(uTime * 0.55);
  float ring = smoothstep(0.07, 0.0, abs(d - (0.25 + 0.7 * pulse))) * (1.0 - pulse);
  float dot = smoothstep(0.24, 0.16, d);
  float a = max(ring * 0.9, dot) * uFade;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a, a);
}
`

function patch(m: (typeof MOSAICS)[keyof typeof MOSAICS], lift: number, sun: { value: THREE.Vector3 }, dim: { value: number }) {
  const seg = 48
  const lngW = tileLng(m.x0, m.z)
  const lngE = tileLng(m.x1 + 1, m.z)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const v = new THREE.Vector3()
  for (let i = 0; i <= seg; i++) {
    // Rows step evenly in Mercator y, so the image's own rows map straight onto the sphere.
    const lat = tileLat(m.y0 + ((m.y1 + 1 - m.y0) * i) / seg, m.z)
    for (let j = 0; j <= seg; j++) {
      latLngToVec(lat, lngW + ((lngE - lngW) * j) / seg, 1 + lift, v)
      pos.push(v.x, v.y, v.z)
      uv.push(j / seg, 1 - i / seg)
      if (i < seg && j < seg) {
        const a = i * (seg + 1) + j
        idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  const uMap = { value: new THREE.Texture() }
  const uOpacity = { value: 0 }
  const ready = loadTexture(m.src).then((t) => {
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = 8
    uMap.value = t
  }).catch(() => {})
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { uMap, uOpacity, uSun: sun, uDim: dim },
    vertexShader: PATCH_VERT,
    fragmentShader: PATCH_FRAG,
    transparent: true,
    depthWrite: false,
  }))
  return { mesh, uOpacity, uMap, ready }
}

export function createWard(households: Household[], colors: { cool: THREE.Color; hot: THREE.Color }) {
  const group = new THREE.Group()
  const uSun = { value: new THREE.Vector3(1, 0, 0) }
  const uDim = { value: 0 }
  const city = patch(MOSAICS.bengaluru, 0.00004, uSun, uDim)
  const ward = patch(MOSAICS.ward, 0.00008, uSun, uDim)
  city.mesh.renderOrder = 6
  ward.mesh.renderOrder = 7

  // Households, a little above the ground so they never sink into it at an angle.
  const n = households.length
  const local = new Float32Array(n * 3)
  const v = new THREE.Vector3()
  households.forEach((h, i) => {
    latLngToVec(h.lat, h.lng, 1.00012, v)
    local.set([v.x, v.y, v.z], i * 3)
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(local, 3))
  geo.setAttribute('aThreshold', new THREE.BufferAttribute(Float32Array.from(households, (h) => h.threshold), 1))
  geo.setAttribute('aKamala', new THREE.BufferAttribute(Float32Array.from(households, (h) => (h.kamala ? 1 : 0)), 1))
  const pu = {
    uH: { value: 31 },
    uSize: { value: 12 },
    uFade: { value: 0 },
    uCool: { value: colors.cool },
    uHot: { value: colors.hot },
  }
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: pu,
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  points.renderOrder = 8

  // Kamala's pin: a bright dot with a ring that keeps pulsing outward.
  const k = households.findIndex((h) => h.kamala)
  const pinGeo = new THREE.BufferGeometry()
  pinGeo.setAttribute('position', new THREE.BufferAttribute(k >= 0 ? local.slice(k * 3, k * 3 + 3) : new Float32Array(3), 3))
  const pinU = { uTime: { value: 0 }, uFade: { value: 0 }, uSize: { value: 64 }, uH: { value: 0 } }
  const pin = new THREE.Points(pinGeo, new THREE.ShaderMaterial({
    uniforms: pinU,
    vertexShader: /* glsl */ `uniform float uSize; void main() { gl_PointSize = uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: PIN_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  pin.visible = k >= 0
  pin.renderOrder = 9
  group.add(city.mesh, ward.mesh, points, pin)
  // Drawn while hidden (see `prepare` below), so nothing here may be skipped as off screen.
  for (const o of [city.mesh, ward.mesh, points, pin]) o.frustumCulled = false

  return {
    group,
    /** Each household's position on the unit globe (Earth's local frame), for hit-testing. */
    local,
    kamala: k,
    /** Resolves when both mosaics have loaded (or failed). */
    ready: Promise.all([city.ready, ward.ready]),
    /**
     * `prepare`: draw every layer this frame even at zero opacity, which shows nothing but makes the
     * GPU compile the shaders and upload the mosaics now, not as a stutter halfway down the descent.
     */
    update(o: { sunDir: THREE.Vector3; H: number; city: number; ward: number; households: number; t: number; pixelRatio: number; prepare?: boolean }) {
      uSun.value.copy(o.sunDir)
      city.uOpacity.value = o.city
      ward.uOpacity.value = o.ward
      pu.uH.value = o.H
      pu.uFade.value = o.households
      uDim.value = o.households
      pu.uSize.value = 12 * o.pixelRatio
      pinU.uFade.value = o.households
      pinU.uTime.value = o.t
      pinU.uSize.value = 64 * o.pixelRatio
      points.visible = o.prepare || o.households > 0.001
      pin.visible = points.visible && k >= 0
      city.mesh.visible = o.prepare || o.city > 0.001
      ward.mesh.visible = o.prepare || o.ward > 0.001
    },
    dispose() {
      for (const m of [city, ward]) {
        m.mesh.geometry.dispose()
        ;(m.mesh.material as THREE.Material).dispose()
        m.uMap.value.dispose()
      }
      geo.dispose()
      ;(points.material as THREE.Material).dispose()
      pinGeo.dispose()
      ;(pin.material as THREE.Material).dispose()
    },
  }
}

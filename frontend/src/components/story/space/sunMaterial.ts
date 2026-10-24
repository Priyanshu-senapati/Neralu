import * as THREE from 'three'
import { SNOISE } from './glsl'

/*
 * The sun, on the GPU.
 *
 * Photosphere (a sphere): convection granules from ridged 3D noise, carried round by differential
 * rotation (the equator laps the poles: Ω(φ) ∝ 1 − 0.162 sin²φ − 0.121 sin⁴φ), sunspots in the two
 * activity belts, faculae, and quadratic limb darkening, coloured through a blackbody-like ramp.
 *
 * Corona (a billboard that always faces the camera): a soft K-corona, noise-shaped streamers, a
 * wide scattered halo, and prominence loops on the limb whose bright knots drain down the legs
 * (coronal rain). `activity` (the heat, 0–1) makes the disc hotter, the streamers longer, the
 * loops taller and brighter.
 */

const PHOTOSPHERE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uActivity;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
${SNOISE}
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.16, 0.02, 0.0), vec3(0.62, 0.12, 0.02), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(0.95, 0.38, 0.06), smoothstep(0.25, 0.5, t));
  c = mix(c, vec3(1.0, 0.66, 0.2), smoothstep(0.45, 0.7, t));
  c = mix(c, vec3(1.0, 0.86, 0.55), smoothstep(0.65, 0.88, t));
  return mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.86, 1.0, t));
}
void main() {
  vec3 p = normalize(vObj);
  float s2 = p.y * p.y;
  float rot = uTime * 0.05 * (1.0 - 0.162 * s2 - 0.121 * s2 * s2);
  float c = cos(rot), s = sin(rot);
  vec3 q = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  float gran = 1.0 - abs(snoise(q * 22.0 + vec3(0.0, uTime * 0.05, 0.0)));
  gran = gran * gran;
  float fine = snoise(q * 55.0 - uTime * 0.08);
  float big = snoise(q * 4.0 + uTime * 0.02);
  float belt = smoothstep(0.08, 0.2, abs(p.y)) * (1.0 - smoothstep(0.42, 0.55, abs(p.y)));
  float spotN = snoise(q * 3.1 + 7.0);
  float umbra = smoothstep(0.66, 0.74, spotN) * belt;
  float pen = smoothstep(0.55, 0.66, spotN) * belt;
  float I = 0.56 + 0.24 * gran + 0.05 * fine + 0.05 * big;
  I *= 1.0 - 0.38 * pen - 0.82 * umbra; // umbrae are much cooler: near black on the disc
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float k = 1.0 - mu;
  I *= 1.0 - 0.47 * k - 0.23 * k * k;
  I += smoothstep(0.45, 0.6, spotN) * belt * k * 0.25; // faculae, bright toward the limb
  I += 0.02 + 0.06 * uActivity;
  gl_FragColor = vec4(ramp(I) * (1.0 + 0.15 * uActivity), 1.0);
}
`

const CORONA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uActivity;
uniform vec4 uLoops[5]; // angle, span, height, life (0–1, 0 = gone)
varying vec2 vUv;
${SNOISE}
void main() {
  vec2 d = (vUv - 0.5) * 2.0 * 5.0; // in solar radii: the billboard spans ±5 R
  float r = length(d);
  float a = atan(d.y, d.x);
  if (r < 0.985) discard;
  float h = max(r - 1.0, 0.0);
  vec3 col = vec3(0.0);
  // Soft inner corona and a wide halo of scattered light.
  col += vec3(1.0, 0.72, 0.4) * exp(-h * 9.0) * (0.75 + 0.4 * uActivity);
  col += vec3(1.0, 0.55, 0.22) * exp(-h * 1.6) * (0.16 + 0.16 * uActivity);
  // Streamers: noise round the limb, stretched outward.
  float n = snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 0.04)) * 0.6 + snoise(vec3(cos(a) * 9.0, sin(a) * 9.0, uTime * 0.07)) * 0.4;
  float rays = pow(max(n, 0.0), 2.2) * exp(-h / (0.5 + 0.9 * uActivity));
  col += vec3(1.0, 0.8, 0.55) * rays * (0.55 + 0.6 * uActivity);
  // Prominences: loops standing on the limb, with knots of plasma sliding down their legs.
  for (int i = 0; i < 5; i++) {
    vec4 L = uLoops[i];
    if (L.w <= 0.0) continue;
    float da = atan(sin(a - L.x), cos(a - L.x));
    float s = da / L.y + 0.5; // 0–1 along the loop
    if (s < 0.0 || s > 1.0) continue;
    float arc = 1.0 + L.z * sin(3.14159 * s);
    float dist = abs(r - arc);
    float tube = exp(-dist * dist / (0.0016 + 0.0012 * L.z));
    float fall = fract((s < 0.5 ? s : 1.0 - s) * 6.0 + uTime * 0.35 + float(i)); // knots draining toward the feet
    float knots = 0.55 + 0.45 * smoothstep(0.6, 1.0, fall);
    col += vec3(1.0, 0.42, 0.16) * tube * knots * L.w * (0.9 + 0.6 * uActivity);
  }
  float alpha = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`

const PASS_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vObj = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

interface Loop {
  angle: number
  span: number
  height: number
  age: number
  life: number
}

export function createSun(radius: number) {
  const group = new THREE.Group()
  const uniforms = { uTime: { value: 0 }, uActivity: { value: 0 } }
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 64),
    new THREE.ShaderMaterial({ uniforms, vertexShader: PASS_VERT, fragmentShader: PHOTOSPHERE_FRAG }),
  )
  const loopsU = { value: Array.from({ length: 5 }, () => new THREE.Vector4()) }
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 10, radius * 10),
    new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uLoops: loopsU },
      vertexShader: UV_VERT,
      fragmentShader: CORONA_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  corona.renderOrder = -1
  group.add(corona, sphere)

  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const loops: Loop[] = []
  const spawn = (activity: number) =>
    loops.push({ angle: rand() * Math.PI * 2, span: 0.14 + rand() * 0.22, height: (0.12 + rand() * 0.22) * (0.75 + 0.6 * activity), age: 0, life: 8 + rand() * 9 })
  for (let i = 0; i < 3; i++) {
    spawn(0.4)
    loops[i].age = loops[i].life * (0.2 + 0.4 * rand())
  }

  return {
    group,
    /** The photosphere alone, for the god-ray occlusion pass. */
    disc: sphere,
    update(t: number, dt: number, activity: number, camera: THREE.Camera) {
      uniforms.uTime.value = t
      uniforms.uActivity.value = activity
      corona.quaternion.copy(camera.quaternion) // the billboard always faces us
      if (loops.length < 2 + Math.round(3 * activity) && rand() < dt * 0.6) spawn(activity)
      for (let i = loops.length - 1; i >= 0; i--) {
        const L = loops[i]
        L.age += dt
        if (L.age > L.life) loops.splice(i, 1)
      }
      loopsU.value.forEach((v, i) => {
        const L = loops[i]
        if (!L) return v.set(0, 0, 0, 0)
        const k = L.age / L.life
        const grow = Math.min(1, k * 4)
        v.set(L.angle, L.span, L.height * grow, Math.min(1, (1 - k) * 4) * Math.min(1, k * 6))
      })
    },
    dispose() {
      sphere.geometry.dispose()
      ;(sphere.material as THREE.Material).dispose()
      corona.geometry.dispose()
      ;(corona.material as THREE.Material).dispose()
    },
  }
}

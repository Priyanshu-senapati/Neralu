import * as THREE from 'three'

/*
 * The Earth (radius 1), lit by the real direction of the sun.
 *
 * Ground: NASA Blue Marble (May) by day, Black Marble city lights by night, a soft terminator.
 * Light is traced a short way toward the sun through the cloud layer, so clouds cast shadows that
 * move with them. Oceans (found from the day map's colour) carry a GGX highlight of the sun and a
 * Fresnel reflection of the sky at grazing angles.
 *
 * Atmosphere: single scattering, ray-marched per pixel (Rayleigh and Mie, 8 steps along the view
 * ray, 4 toward the sun from each): blue at the limb, red-orange along the terminator, and a thin
 * sunlit haze over the ground on the way down. Drawn on a shell's back faces with additive blending.
 */

const WORLD_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const GROUND_FRAG = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec3 uSun;
uniform float uCloudShift;
uniform float uCloudAmt;
uniform float uReady;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSun);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, L);
  float day = smoothstep(-0.1, 0.22, ndl);
  vec3 albedo = mix(vec3(0.05, 0.09, 0.16), texture2D(uDay, vUv).rgb, uReady);
  // Cloud shadow: step toward the sun across the ground, sample the cloud layer there.
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), N) + 1e-5);
  vec3 north = cross(N, east);
  vec2 toward = vec2(dot(L, east), dot(L, north)) * 0.0035;
  float shadow = texture2D(uClouds, vec2(vUv.x + uCloudShift, vUv.y) + toward).r * uCloudAmt;
  albedo *= 1.0 - 0.42 * shadow * day;
  float ocean = smoothstep(0.015, 0.09, albedo.b - max(albedo.r, albedo.g) * 0.86) * uReady;
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float a2 = 0.075 * 0.075;
  float D = a2 / (3.14159 * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0));
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  vec3 spec = vec3(1.0, 0.9, 0.75) * D * F * ocean * max(ndl, 0.0) * 0.22;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 lit = albedo * (0.04 + 1.15 * max(ndl, 0.0)) + spec + ocean * fres * vec3(0.18, 0.36, 0.75) * day;
  vec3 lights = texture2D(uNight, vUv).rgb * uReady;
  lights = pow(lights, vec3(1.8)) * 2.6 * vec3(1.0, 0.78, 0.5) * (1.0 - day);
  gl_FragColor = vec4(lit * day + lights + albedo * 0.012, 1.0);
}
`

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uClouds;
uniform vec3 uSun;
uniform float uCloudShift;
uniform float uCloudAmt;
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  float c = texture2D(uClouds, vec2(vUv.x + uCloudShift, vUv.y)).r;
  float ndl = dot(normalize(vNormalW), normalize(uSun));
  float lit = smoothstep(-0.15, 0.3, ndl);
  gl_FragColor = vec4(vec3(0.96, 0.97, 1.0) * (0.04 + lit), c * c * 0.9 * uCloudAmt);
}
`

// Units: Earth radii. The atmosphere is drawn 2.5 % thick (about 160 km; the real one is about
// 100 km) so it reads at a distance; scale heights and coefficients are scaled to match.
const ATMOS_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uCenter;
uniform float uStrength;
varying vec3 vPosW;
const float RP = 1.0;
const float RA = 1.025;
const float HR = 0.0021;            // Rayleigh scale height (8 km × 1.6 / 6371 km)
const float HM = 0.00032;           // Mie scale height (1.2 km × 1.6 / 6371 km)
const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6) * 6371e3 / 1.6;
const float BM = 21e-6 * 6371e3 / 1.6;
const float G = 0.76;
vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
void main() {
  vec3 ro = cameraPosition - uCenter;
  vec3 rd = normalize(vPosW - cameraPosition);
  vec2 ta = sphere(ro, rd, RA);
  if (ta.x > ta.y) discard;
  vec2 tp = sphere(ro, rd, RP);
  float t0 = max(ta.x, 0.0);
  float t1 = tp.x > 0.0 ? min(ta.y, tp.x) : ta.y;
  if (t1 <= t0) discard;
  vec3 L = normalize(uSun);
  float mu = dot(rd, L);
  float pr = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
  float pm = 3.0 / (8.0 * 3.14159) * ((1.0 - G * G) * (1.0 + mu * mu)) / ((2.0 + G * G) * pow(1.0 + G * G - 2.0 * mu * G, 1.5));
  float ds = (t1 - t0) / 8.0;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 x = ro + rd * (t0 + ds * (float(i) + 0.5));
    float h = length(x) - RP;
    float dR = exp(-h / HR) * ds;
    float dM = exp(-h / HM) * ds;
    odR += dR;
    odM += dM;
    // Light from the sun to this point: 4 steps out to the top of the atmosphere.
    vec2 tl = sphere(x, L, RA);
    float dl = tl.y / 4.0;
    float lR = 0.0, lM = 0.0;
    bool shade = false;
    for (int j = 0; j < 4; j++) {
      vec3 y = x + L * (dl * (float(j) + 0.5));
      float hy = length(y) - RP;
      if (hy < 0.0) { shade = true; break; }
      lR += exp(-hy / HR) * dl;
      lM += exp(-hy / HM) * dl;
    }
    if (shade) continue;
    vec3 tau = BR * (odR + lR) + BM * 1.1 * (odM + lM);
    vec3 att = exp(-tau);
    sumR += dR * att;
    sumM += dM * att;
  }
  vec3 col = 22.0 * (sumR * BR * pr + sumM * BM * pm) * uStrength;
  col = 1.0 - exp(-col); // tone map
  gl_FragColor = vec4(col, 1.0);
}
`

const dummy = () => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

export function createEarth(renderer: THREE.WebGLRenderer) {
  const group = new THREE.Group()
  const shared = {
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uCloudShift: { value: 0 },
    uCloudAmt: { value: 1 },
  }
  const uDay = { value: dummy() as THREE.Texture }
  const uNight = { value: dummy() as THREE.Texture }
  const uClouds = { value: dummy() as THREE.Texture }
  const uReady = { value: 0 }
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(1, 160, 96),
    new THREE.ShaderMaterial({ uniforms: { ...shared, uDay, uNight, uClouds, uReady }, vertexShader: WORLD_VERT, fragmentShader: GROUND_FRAG }),
  )
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.006, 128, 72),
    new THREE.ShaderMaterial({ uniforms: { ...shared, uClouds }, vertexShader: WORLD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false }),
  )
  const atmosUniforms = { uSun: shared.uSun, uCenter: { value: new THREE.Vector3() }, uStrength: { value: 1 } }
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.025, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: atmosUniforms,
      vertexShader: WORLD_VERT,
      fragmentShader: ATMOS_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  atmosphere.renderOrder = 5
  group.add(ground, clouds, atmosphere)

  // The maps arrive after first paint; until then the globe is a dark sphere with its atmosphere.
  const loader = new THREE.TextureLoader()
  const aniso = renderer.capabilities.getMaxAnisotropy()
  // Sampled as stored (display values): the shaders work in the photographs' own colour space.
  const load = (src: string, slot: { value: THREE.Texture }) =>
    loader.loadAsync(src).then((t) => {
      t.colorSpace = THREE.NoColorSpace
      t.anisotropy = Math.min(8, aniso)
      t.wrapS = THREE.RepeatWrapping
      slot.value = t
    })
  const ready = Promise.all([load('/earth/day.jpg', uDay), load('/earth/night.jpg', uNight), load('/earth/clouds.jpg', uClouds)])
    .then(() => {
      uReady.value = 1
    })
    .catch(() => {})

  return {
    group,
    /** The solid globe alone, for the god-ray occlusion pass. */
    solid: ground,
    ready,
    /** Sun direction in world space; seconds; how much cloud to show (fades as we descend). */
    update(sunDir: THREE.Vector3, t: number, cloudAmount: number) {
      shared.uSun.value.copy(sunDir)
      shared.uCloudShift.value = (t * 0.0012) % 1
      shared.uCloudAmt.value = cloudAmount
      group.getWorldPosition(atmosUniforms.uCenter.value)
    },
    dispose() {
      for (const m of [ground, clouds, atmosphere]) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
      for (const s of [uDay, uNight, uClouds]) s.value.dispose()
    },
  }
}

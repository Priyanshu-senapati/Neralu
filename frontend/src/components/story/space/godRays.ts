import * as THREE from 'three'

/*
 * God rays: volumetric light scattering as a screen-space pass (Mitchell, GPU Gems 3, ch. 13).
 * A quarter-resolution mask holds the sun as white and Earth as black; a radial blur toward the
 * sun's screen position smears the bright disc into shafts of light, broken wherever Earth stands
 * in the way. The result is added over the frame. Skipped whenever the sun is off screen.
 */

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const RAYS_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uSun;
uniform float uStrength;
varying vec2 vUv;
void main() {
  const int N = 32;
  vec2 delta = (vUv - uSun) * (0.92 / float(N));
  vec2 uv = vUv;
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    uv -= delta;
    acc += texture2D(uMask, uv).rgb * illum;
    illum *= 0.955;
  }
  acc *= uStrength / float(N);
  gl_FragColor = vec4(acc * vec3(1.0, 0.72, 0.42), 1.0);
}
`

export function createGodRays() {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true })
  const mask = new THREE.Scene()
  mask.background = new THREE.Color(0x000000)
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }))
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1.03, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }))
  mask.add(sun, earth)
  const uniforms = { uMask: { value: target.texture }, uSun: { value: new THREE.Vector2() }, uStrength: { value: 0 } }
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: RAYS_FRAG, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }),
  )
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCam = new THREE.Camera()
  const sunNdc = new THREE.Vector3()

  return {
    /** Renders the rays over what is already on screen. Returns false when the sun is off screen. */
    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, sunPos: THREE.Vector3, sunRadius: number, earthPos: THREE.Vector3, strength: number) {
      sunNdc.copy(sunPos).project(camera)
      const behind = sunNdc.z > 1
      if (strength <= 0.01 || behind || Math.abs(sunNdc.x) > 1.6 || Math.abs(sunNdc.y) > 1.6) return false
      const size = renderer.getDrawingBufferSize(new THREE.Vector2())
      const w = Math.max(1, Math.round(size.x / 4))
      const h = Math.max(1, Math.round(size.y / 4))
      if (target.width !== w || target.height !== h) target.setSize(w, h)
      sun.position.copy(sunPos)
      sun.scale.setScalar(sunRadius)
      earth.position.copy(earthPos)
      renderer.setRenderTarget(target)
      renderer.render(mask, camera)
      renderer.setRenderTarget(null)
      uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5)
      uniforms.uStrength.value = strength
      renderer.render(quadScene, quadCam)
      return true
    },
    dispose() {
      target.dispose()
      sun.geometry.dispose()
      earth.geometry.dispose()
      ;(sun.material as THREE.Material).dispose()
      ;(earth.material as THREE.Material).dispose()
      quad.geometry.dispose()
      ;(quad.material as THREE.Material).dispose()
    },
  }
}

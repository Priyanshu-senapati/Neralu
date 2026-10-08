import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/*
 * Concentric rings radiating outward, rendered in a fragment shader (adapted from the 21st.dev
 * "Shader Animation" component). For Neralu it is recoloured as heat radiating behind the hero:
 * the shader's three offset channels are mapped onto heat, sun and shade colours instead of RGB.
 *
 * Polite by default: pauses when off-screen or when the tab is hidden, caps the pixel ratio,
 * draws one still frame for prefers-reduced-motion, and falls back to the plain background colour
 * if WebGL is unavailable. Decorative only: hidden from assistive technology.
 */

type RGB = [number, number, number]

interface Props {
  className?: string
  /** Base colour behind the rings (CSS hex). */
  background?: string
  /** Colours for the three ring channels (CSS hex). */
  colors?: [string, string, string]
  /** 0–1: how bright the rings are against the background. */
  intensity?: number
  /** Animation speed multiplier (1 = the original). */
  speed?: number
  /** Where the rings radiate from, in the shader's -1..1-ish space (0,0 = centre). */
  center?: [number, number]
  /** 0–1: fade the rings out towards the left, where text sits. */
  quietSide?: number
}

const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const RGB_RINGS: [string, string, string] = ['#ff0000', '#00ff00', '#0000ff'] // the original look
const ORIGIN: [number, number] = [0, 0]
const START_TIME = 25 // fract(25 * 0.05) = 0.25: rings at ~1.25 units, around the focal point

const VERTEX = /* glsl */ `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform vec3 background;
  uniform vec3 colorA;
  uniform vec3 colorB;
  uniform vec3 colorC;
  uniform float intensity;
  uniform vec2 center;
  uniform float quietSide;

  void main(void) {
    vec2 base = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
    vec2 uv = base - center;
    float t = time * 0.05;
    float lineWidth = 0.002;

    vec3 c = vec3(0.0);
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 5; i++) {
        c[j] += lineWidth * float(i * i) / abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
      }
    }
    // Map the three offset channels onto the palette instead of raw RGB.
    vec3 rings = colorA * c.r + colorB * c.g + colorC * c.b;
    // Soft saturation: the line terms spike towards infinity; ease them into 0..1 instead of clipping.
    rings = 1.0 - exp(-rings * 0.9);
    // Keep the side where text sits calm (quietSide = 1 fades the left of the frame).
    float mask = mix(1.0, smoothstep(-1.1, 0.4, base.x), quietSide);
    gl_FragColor = vec4(background + rings * intensity * mask, 1.0);
  }
`

export function ShaderAnimation({
  className = '',
  background = '#000000',
  colors = RGB_RINGS,
  intensity = 1,
  speed = 1,
  center = ORIGIN,
  quietSide = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
    } catch {
      return // no WebGL: the container's background colour stands in
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)

    const camera = new THREE.Camera()
    camera.position.z = 1
    const scene = new THREE.Scene()
    const geometry = new THREE.PlaneGeometry(2, 2)
    const uniforms = {
      time: { value: START_TIME }, // start with the rings already formed, not the initial stripes
      resolution: { value: new THREE.Vector2() },
      background: { value: new THREE.Vector3(...hex(background)) },
      colorA: { value: new THREE.Vector3(...hex(colors[0])) },
      colorB: { value: new THREE.Vector3(...hex(colors[1])) },
      colorC: { value: new THREE.Vector3(...hex(colors[2])) },
      intensity: { value: intensity },
      center: { value: new THREE.Vector2(center[0], center[1]) },
      quietSide: { value: quietSide },
    }
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT })
    scene.add(new THREE.Mesh(geometry, material))

    const resize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight)
      uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height)
      renderer.render(scene, camera)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let visible = true
    const loop = () => {
      uniforms.time.value += 0.05 * speed
      renderer.render(scene, camera)
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      if (!still && !frame && visible && !document.hidden) frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }


    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    })
    io.observe(container)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      container.removeChild(renderer.domElement)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [background, colors[0], colors[1], colors[2], intensity, speed, center[0], center[1], quietSide]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} aria-hidden="true" className={`overflow-hidden ${className}`} style={{ background }} />
}

import { useEffect, useRef, useState } from 'react'
import { geoBounds, geoGraticule, geoOrthographic, geoPath, timer } from 'd3'
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'

/*
 * 21st.dev "wireframe dotted globe" (d3, 2D canvas), kept for reference; Neralu's hero uses the
 * three.js HeatGlobe built from this design. Changes from the original: reads the bundled land
 * file (no third-party request), colours from props, no console logging, and no wheel zoom
 * (it hijacked page scroll). Drag to rotate.
 */

type Land = FeatureCollection<Polygon | MultiPolygon>

interface RotatingEarthProps {
  width?: number
  height?: number
  className?: string
  ocean?: string
  ink?: string
  dot?: string
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

function inFeature(p: Position, f: Feature<Polygon | MultiPolygon>) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  return polys.some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole)))
}

export default function RotatingEarth({ width = 800, height = 600, className = '', ocean = '#000000', ink = '#ffffff', dot = '#999999' }: RotatingEarthProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const w = Math.min(width, window.innerWidth - 40)
    const h = Math.min(height, window.innerHeight - 100)
    const radius = Math.min(w, h) / 2.5
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    context.scale(dpr, dpr)

    const projection = geoOrthographic().scale(radius).translate([w / 2, h / 2]).clipAngle(90)
    const path = geoPath(projection, context)
    const dots: [number, number][] = []
    let land: Land | null = null

    const render = () => {
      context.clearRect(0, 0, w, h)
      context.beginPath()
      context.arc(w / 2, h / 2, projection.scale(), 0, 2 * Math.PI)
      context.fillStyle = ocean
      context.fill()
      context.strokeStyle = ink
      context.lineWidth = 2
      context.stroke()
      if (!land) return
      context.beginPath()
      path(geoGraticule()())
      context.globalAlpha = 0.25
      context.lineWidth = 1
      context.stroke()
      context.globalAlpha = 1
      context.beginPath()
      land.features.forEach((f) => path(f))
      context.stroke()
      context.fillStyle = dot
      for (const [lng, lat] of dots) {
        const p = projection([lng, lat])
        if (!p) continue
        context.beginPath()
        context.arc(p[0], p[1], 1.2, 0, 2 * Math.PI)
        context.fill()
      }
    }

    const rotation: [number, number] = [0, 0]
    let auto = true
    const spin = timer(() => {
      if (!auto) return
      rotation[0] += 0.5
      projection.rotate(rotation)
      render()
    })

    const onDown = (e: MouseEvent) => {
      auto = false
      const sx = e.clientX
      const sy = e.clientY
      const start = [...rotation]
      const move = (m: MouseEvent) => {
        rotation[0] = start[0] + (m.clientX - sx) * 0.5
        rotation[1] = Math.max(-90, Math.min(90, start[1] - (m.clientY - sy) * 0.5))
        projection.rotate(rotation)
        render()
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        auto = true
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    }
    canvas.addEventListener('mousedown', onDown)

    fetch('/data/land-110m.json')
      .then((r) => (r.ok ? (r.json() as Promise<Land>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        land = data
        for (const f of data.features) {
          const [[x0, y0], [x1, y1]] = geoBounds(f)
          for (let lng = x0; lng <= x1; lng += 1.28)
            for (let lat = y0; lat <= y1; lat += 1.28) if (inFeature([lng, lat], f)) dots.push([lng, lat])
        }
        render()
      })
      .catch(() => setError('Failed to load land map data'))

    return () => {
      spin.stop()
      canvas.removeEventListener('mousedown', onDown)
    }
  }, [width, height, ocean, ink, dot])

  if (error) return <p className={`text-sm text-muted ${className}`}>{error}</p>
  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="h-auto w-full rounded-2xl" style={{ maxWidth: '100%' }} aria-hidden="true" />
      <div className="absolute bottom-4 left-4 rounded-md bg-surface px-2 py-1 text-xs text-muted">Drag to rotate</div>
    </div>
  )
}

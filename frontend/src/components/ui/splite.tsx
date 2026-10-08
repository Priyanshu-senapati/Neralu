import { lazy, Suspense } from 'react'

// Spline's runtime is large: it loads only when a scene is actually rendered.
const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
  /** A published Spline scene URL (https://prod.spline.design/…/scene.splinecode). */
  scene: string
  className?: string
}

/** Renders a Spline 3D scene. Kept for a scene designed for Neralu; the hero uses its own three.js ward. */
export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted" role="status">
          Loading 3D scene…
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}

import { SplineScene } from '@/components/ui/splite'
import { Card } from '@/components/ui/card'
import { Spotlight } from '@/components/ui/spotlight'

/**
 * The original 21st.dev demo, kept for reference and not routed. Its scene is Spline's stock robot,
 * which does not fit Neralu; swap in a scene designed for the product before using this anywhere.
 */
export function SplineSceneBasic() {
  return (
    <Card className="relative h-[500px] w-full overflow-hidden bg-black/[0.96]">
      <Spotlight className="-left-10 -top-40" color="rgba(255,255,255,0.18)" />
      <div className="flex h-full">
        <div className="relative z-10 flex flex-1 flex-col justify-center p-8">
          <h1 className="text-4xl font-bold text-neutral-50 md:text-5xl">Interactive 3D</h1>
          <p className="mt-4 max-w-lg text-neutral-300">
            Bring your UI to life with beautiful 3D scenes. Create immersive experiences that capture attention and
            enhance your design.
          </p>
        </div>
        <div className="relative flex-1">
          <SplineScene scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode" className="h-full w-full" />
        </div>
      </div>
    </Card>
  )
}

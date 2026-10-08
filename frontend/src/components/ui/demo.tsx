import { ShaderAnimation } from '@/components/ui/shader-animation'

/** The component's original demo (not routed). Neralu uses it with heat colours in the story hero. */
export default function DemoOne() {
  return (
    <div className="relative flex h-[650px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border bg-blue-700">
      <ShaderAnimation className="absolute inset-0" />
      <span className="pointer-events-none absolute z-10 whitespace-pre-wrap text-center text-7xl font-semibold leading-none tracking-tighter text-white">
        Shader Animation
      </span>
    </div>
  )
}

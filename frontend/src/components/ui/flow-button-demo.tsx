import { FlowButton } from '@/components/ui/flow-button'

/** The component's original demo, kept for reference (not routed). */
export function FlowButtonDemo() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-4 bg-paper p-4">
      <FlowButton>Flow Button</FlowButton>
      <FlowButton variant="secondary">Flow Button</FlowButton>
    </div>
  )
}

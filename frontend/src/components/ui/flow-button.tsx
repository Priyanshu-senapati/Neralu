import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/*
 * FlowButton (21st.dev), adapted to Neralu. An outlined pill: on hover or keyboard focus a circle
 * of colour grows from the centre to fill it, the corners tighten, the label slides right and the
 * arrow comes round from the left. It says "this takes you somewhere", so it is used for
 * occasional navigation and stage moments, never for controls an officer presses all day.
 *
 * Changes from the original: theme tokens instead of fixed #111 (it works on OLED black and on
 * light), renders a router Link, an <a> or a <button>, the fill is a scaled circle (transform only,
 * covers any label width), the effect also runs on keyboard focus, and reduced motion keeps the
 * colour change without the movement.
 */

type Variant = 'primary' | 'secondary'
type Size = 'md' | 'sm'

interface CommonProps {
  children: ReactNode
  variant?: Variant
  size?: Size
  className?: string
}
type AsLink = CommonProps & { to: string; href?: never; onClick?: never; disabled?: never; type?: never }
type AsAnchor = CommonProps & { href: string; to?: never; onClick?: never; disabled?: never; type?: never }
type AsButton = CommonProps & { onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; to?: never; href?: never }
export type FlowButtonProps = AsLink | AsAnchor | AsButton

const VARIANT: Record<Variant, { shell: string; fill: string; arrow: string }> = {
  // Mint outline that floods mint; label turns dark. (The shell is the group itself, so its own
  // colour uses hover:/focus-visible:; only children use group-hover:.)
  primary: {
    shell: 'border-brand text-brand hover:text-brand-ink focus-visible:text-brand-ink',
    fill: 'bg-brand',
    arrow: 'stroke-brand group-hover:stroke-brand-ink group-focus-visible:stroke-brand-ink',
  },
  // Quiet outline that floods with ink; label turns to the page colour.
  secondary: {
    shell: 'border-line-strong text-ink hover:border-transparent hover:text-paper focus-visible:text-paper',
    fill: 'bg-ink',
    arrow: 'stroke-ink group-hover:stroke-paper group-focus-visible:stroke-paper',
  },
}

const SIZE: Record<Size, { shell: string; arrow: string; left: string; right: string; shift: string }> = {
  md: { shell: 'px-9 py-3 text-base', arrow: 'h-4 w-4', left: 'group-hover:left-4 group-focus-visible:left-4', right: 'right-4', shift: '-translate-x-3 group-hover:translate-x-3 group-focus-visible:translate-x-3' },
  sm: { shell: 'px-7 py-2 text-sm', arrow: 'h-3.5 w-3.5', left: 'group-hover:left-3 group-focus-visible:left-3', right: 'right-3', shift: '-translate-x-2.5 group-hover:translate-x-2.5 group-focus-visible:translate-x-2.5' },
}

const MOVE = 'transition-all duration-[800ms] motion-reduce:transition-colors motion-reduce:duration-200'

export function FlowButton(props: FlowButtonProps) {
  const { children, variant = 'primary', size = 'md', className } = props
  const v = VARIANT[variant]
  const s = SIZE[size]

  const shell = cn(
    'group relative inline-flex items-center gap-1 overflow-hidden whitespace-nowrap rounded-[100px] border-[1.5px] bg-transparent font-semibold',
    'cursor-pointer transition-[border-radius,border-color,color,transform] duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)]',
    'hover:rounded-[12px] focus-visible:rounded-[12px] active:scale-[0.96] motion-reduce:active:scale-100',
    'disabled:pointer-events-none disabled:opacity-50',
    v.shell,
    s.shell,
    className,
  )

  const inner = (
    <>
      {/* Arrow that arrives from the left */}
      <ArrowRight
        aria-hidden="true"
        className={cn('absolute left-[-25%] z-[2] fill-none', s.arrow, s.left, v.arrow, MOVE, 'ease-[cubic-bezier(0.34,1.56,0.64,1)]')}
      />
      <span className={cn('relative z-[1]', s.shift, MOVE, 'ease-out motion-reduce:translate-x-0')}>{children}</span>
      {/* The fill: a small circle scaled up (transform only), big enough for any label */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full opacity-0',
          'group-hover:scale-[45] group-hover:opacity-100 group-focus-visible:scale-[45] group-focus-visible:opacity-100',
          'transition-[transform,opacity] duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] motion-reduce:duration-200',
          v.fill,
        )}
      />
      {/* Arrow that leaves to the right */}
      <ArrowRight
        aria-hidden="true"
        className={cn(
          'absolute z-[2] fill-none group-hover:right-[-25%] group-focus-visible:right-[-25%]',
          s.arrow,
          s.right,
          v.arrow,
          MOVE,
          'ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        )}
      />
    </>
  )

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} className={shell}>
        {inner}
      </Link>
    )
  }
  if ('href' in props && props.href) {
    return (
      <a href={props.href} className={shell}>
        {inner}
      </a>
    )
  }
  const b = props as AsButton
  return (
    <button type={b.type ?? 'button'} onClick={b.onClick} disabled={b.disabled} className={shell}>
      {inner}
    </button>
  )
}

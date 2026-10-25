import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/*
 * Interactive hover button (after 21st.dev's InteractiveHoverButton, MIT, rebuilt on Neralu's
 * tokens): a small dot by the label grows to fill the pill while the label slides out to the right
 * and slides back in with an arrow. Transform and opacity only; works as a router link, a plain
 * link or a button.
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
export type InteractiveHoverButtonProps = AsLink | AsAnchor | AsButton

const VARIANT: Record<Variant, { shell: string; dot: string; hover: string }> = {
  primary: { shell: 'border-brand/60 text-ink', dot: 'bg-brand', hover: 'text-brand-ink' },
  secondary: { shell: 'border-line-strong text-ink', dot: 'bg-ink', hover: 'text-paper' },
}
const SIZE: Record<Size, string> = { md: 'px-7 py-3 text-base', sm: 'px-5 py-2 text-sm' }
const EASE = 'duration-400 ease-[cubic-bezier(0.23,1,0.32,1)]'

export function InteractiveHoverButton(props: InteractiveHoverButtonProps) {
  const { children, variant = 'primary', size = 'md', className } = props
  const v = VARIANT[variant]
  const shell = cn(
    'group relative inline-flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap rounded-full border bg-surface text-center font-semibold',
    'active:scale-[0.97] transition-transform duration-150 disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    v.shell,
    SIZE[size],
    className,
  )
  const inner = (
    <>
      <span className={cn('relative z-[1] inline-flex translate-x-1 items-center gap-2 transition-[transform,opacity] group-hover:translate-x-12 group-hover:opacity-0 group-focus-visible:translate-x-12 group-focus-visible:opacity-0', EASE)}>
        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', v.dot)} />
        {children}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 z-10 flex translate-x-12 items-center justify-center gap-2 opacity-0 transition-[transform,opacity] group-hover:-translate-x-1 group-hover:opacity-100 group-focus-visible:-translate-x-1 group-focus-visible:opacity-100',
          EASE,
          v.hover,
        )}
      >
        <span>{children}</span>
        <ArrowRight className="h-4 w-4" />
      </span>
      {/* The dot that floods the pill (scaled, never resized). */}
      <span
        aria-hidden="true"
        className={cn('absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full transition-transform duration-600 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:scale-[40] group-focus-visible:scale-[40] motion-reduce:duration-150', v.dot)}
      />
    </>
  )
  if ('to' in props && props.to) return <Link to={props.to} className={shell}>{inner}</Link>
  if ('href' in props && props.href) return <a href={props.href} className={shell}>{inner}</a>
  const b = props as AsButton
  return (
    <button type={b.type ?? 'button'} onClick={b.onClick} disabled={b.disabled} className={shell}>
      {inner}
    </button>
  )
}

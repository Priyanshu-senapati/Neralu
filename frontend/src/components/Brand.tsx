/**
 * Neralu (ನೆರಳು, "shade"). The mark is a canopy over a person: the one idea the product is about.
 * Drawn, not an icon-font glyph, so it holds at every size.
 */
export function Mark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M3.5 14C8.2 6.6 23.8 6.6 28.5 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 9.2V4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="20.5" r="3.6" fill="currentColor" />
      <path d="M10 28.5c1.3-2.8 3.4-4.2 6-4.2s4.7 1.4 6 4.2" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

const SIZES = {
  sm: { mark: 'h-[22px] w-[22px]', text: 'text-[1.0625rem]', kn: 'text-[0.8125rem]', gap: 'gap-2' },
  md: { mark: 'h-7 w-7', text: 'text-[1.3125rem]', kn: 'text-[0.9375rem]', gap: 'gap-2.5' },
  lg: { mark: 'h-9 w-9', text: 'text-[1.75rem]', kn: 'text-lg', gap: 'gap-3' },
}

/** Mark centred on the cap height; English and Kannada names share one baseline. */
export function Wordmark({ size = 'md', kannada = true, onDark = false }: { size?: keyof typeof SIZES; kannada?: boolean; onDark?: boolean }) {
  const s = SIZES[size]
  return (
    <span className={`inline-flex items-center ${s.gap}`}>
      <Mark className={`${s.mark} shrink-0 ${onDark ? 'text-brand-ink' : 'text-brand'}`} />
      <span className="inline-flex items-baseline gap-2 leading-none">
        <span className={`${s.text} font-semibold tracking-[-0.02em] ${onDark ? 'text-brand-ink' : 'text-ink'}`}>Neralu</span>
        {kannada && (
          <span className={`kn ${s.kn} leading-none ${onDark ? 'text-brand-ink/65' : 'text-muted'}`} lang="kn">
            ನೆರಳು
          </span>
        )}
      </span>
    </span>
  )
}

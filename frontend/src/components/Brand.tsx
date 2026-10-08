/**
 * Neralu (ನೆರಳು, "shade"). The mark is a canopy over a person: the one idea the product is about.
 * Drawn, not an icon-font glyph, so it holds at every size.
 */
export function Mark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M4 14.5C8.5 7.5 23.5 7.5 28 14.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 9.6V5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="21.5" r="3.4" fill="currentColor" />
      <path d="M10.5 28.5c1.2-2.6 3.2-3.9 5.5-3.9s4.3 1.3 5.5 3.9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ size = 'md', kannada = true }: { size?: 'sm' | 'md' | 'lg'; kannada?: boolean }) {
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'
  const mark = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  return (
    <span className="inline-flex items-center gap-2 text-brand">
      <Mark className={mark} />
      <span className={`${text} font-semibold tracking-[-0.01em] text-ink`}>Neralu</span>
      {kannada && (
        <span className="kn text-sm text-muted" lang="kn">
          ನೆರಳು
        </span>
      )}
    </span>
  )
}

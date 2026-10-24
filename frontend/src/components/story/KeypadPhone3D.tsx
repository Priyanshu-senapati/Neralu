import type { CSSProperties } from 'react'

/*
 * A plain keypad phone, built in CSS 3D: Neralu works on any phone, so the story shows the
 * cheapest one. The body is a stack of layers (a solid edge with rounded corners), a small
 * screen and a 12-key grid. No images. CallOnScroll animates it through data attributes:
 * data-caption, data-status, data-tint, data-key-call, data-key="1".."#", data-ring.
 */

const KEYS: [string, string][] = [
  ['1', ''], ['2', 'abc'], ['3', 'def'],
  ['4', 'ghi'], ['5', 'jkl'], ['6', 'mno'],
  ['7', 'pqrs'], ['8', 'tuv'], ['9', 'wxyz'],
  ['*', ''], ['0', '+'], ['#', ''],
]
const DEPTH = 14 // px of body thickness
const LAYERS = 7

const face: CSSProperties = { position: 'absolute', inset: 0, borderRadius: 34 }

export default function KeypadPhone3D({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-[440px] w-[216px] [transform-style:preserve-3d] ${className}`} data-phone data-ui>
      {/* The edge: layers stepping back give the body depth with its rounded corners intact. */}
      {Array.from({ length: LAYERS }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            ...face,
            transform: `translateZ(${-((i + 1) * DEPTH) / LAYERS}px)`,
            background: 'var(--phone-edge)',
          }}
        />
      ))}

      <div style={{ ...face, background: 'var(--phone-body)', boxShadow: 'inset 0 1px 0 var(--phone-shine), inset 0 0 0 1px var(--phone-line)' }}>
        <div aria-hidden="true" className="mx-auto mt-4 h-1 w-12 rounded-full" style={{ background: 'var(--phone-line)' }} />

        {/* Screen */}
        <div className="relative mx-[22px] mt-3 h-[152px] overflow-hidden rounded-[8px] border" style={{ background: 'var(--phone-screen)', borderColor: 'var(--phone-line)' }}>
          <div data-tint aria-hidden="true" className="absolute inset-0 bg-alert-bg opacity-0" />
          <div className="relative flex h-full flex-col px-3 py-2.5 text-[var(--phone-text)]">
            <div className="flex items-center justify-between font-mono text-[10px] opacity-70">
              <span className="flex items-end gap-[2px]" aria-hidden="true">
                {[3, 5, 7, 9].map((h) => (
                  <span key={h} className="w-[3px] rounded-[1px] bg-current" style={{ height: h }} />
                ))}
              </span>
              <span data-clock>11:02</span>
            </div>
            <div className="mt-1.5 text-center">
              <div data-status className="font-mono text-[10px] uppercase tracking-[0.08em] opacity-75">Incoming call</div>
              <div className="text-[17px] font-semibold leading-tight">Neralu</div>
              <div className="text-[10.5px] opacity-75">Ward 47 office</div>
            </div>
            <p data-caption aria-hidden="true" className="mt-2 min-h-[3.6em] text-center text-[11px] leading-[1.3]" />
          </div>
        </div>

        {/* Soft keys and the round navigation key */}
        <div className="mx-[22px] mt-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3" aria-hidden="true">
          <span data-key-call className="h-3 rounded-full" style={{ background: 'var(--phone-key)', boxShadow: 'inset 0 -2px 0 var(--ok)' }} />
          <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: 'var(--phone-key)', boxShadow: 'inset 0 0 0 1px var(--phone-line)' }}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: 'var(--phone-body)' }} />
          </span>
          <span className="h-3 rounded-full" style={{ background: 'var(--phone-key)', boxShadow: 'inset 0 -2px 0 var(--alert)' }} />
        </div>

        {/* Keypad */}
        <div className="mx-[22px] mt-3.5 grid grid-cols-3 gap-x-2.5 gap-y-2" aria-hidden="true">
          {KEYS.map(([k, letters]) => (
            <span
              key={k}
              data-key={k}
              className="relative flex h-[38px] flex-col items-center justify-center rounded-[11px] leading-none"
              style={{ background: 'var(--phone-key)', boxShadow: 'inset 0 -2px 0 var(--phone-key-shadow)', color: 'var(--phone-key-text)' }}
            >
              <span data-ring className="absolute -inset-[3px] rounded-[13px] border-2 border-brand opacity-0" />
              <span className="font-mono text-[15px] font-medium">{k}</span>
              {letters && <span className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em] opacity-55">{letters}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

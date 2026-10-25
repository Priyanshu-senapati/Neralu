import { useLayoutEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EASE, gsap } from '../../motion'
import KeypadPhone3D from './KeypadPhone3D'

/*
 * Kamala's call, played by the reader's scroll: the section pins and its scroll progress p (0–1)
 * drives one timeline. The phone rises and rings, each keypad answer drops into the card on the
 * left, the published rule decides on the right, and a case card slides out of the phone. Every
 * state is a pure function of p, so scrolling back plays it backwards exactly.
 *
 * Kamala's answers give RED by Rule R3 (backend/app/rules.py: symptoms and no water). Captions
 * are the English meaning of the Kannada prompts (backend/scripts/prompts.py).
 */

interface Question {
  label: string
  caption: string
  key: string
  answer: string
  /** One of the two answers Rule R3 matched. */
  cause?: boolean
}

const QUESTIONS: Question[] = [
  { label: 'Water in the last hour', caption: 'Have you had water in the last hour? Press 1 for yes, 2 for no.', key: '2', answer: 'No', cause: true },
  { label: 'Dizzy, weak or confused', caption: 'Do you feel dizzy, weak or confused? Press 1 for yes, 2 for no.', key: '1', answer: 'Yes', cause: true },
  { label: 'Room very hot', caption: 'Is your room very hot right now? Press 1 for yes, 2 for no.', key: '1', answer: 'Yes' },
  { label: 'Fan or cooler working', caption: 'Is your fan or cooler working? Press 1 for yes, 2 for no.', key: '1', answer: 'Yes' },
  { label: 'What day is it today?', caption: 'Which day is it today? Press 1 for Monday, up to 7 for Sunday.', key: '5', answer: 'Friday, correct' },
  { label: 'Okay, or needs help', caption: 'If you need help now, press 2. If you are okay, press 1.', key: '1', answer: 'Okay' },
]
const GREETING = "This is Neralu, from your ward office. Your family's code word is Mallige."
const CLOSING = 'Please drink a glass of water now, and stay in the coolest part of your home. Thank you.'
const CALL_SECONDS = 72

// The scroll script, as fractions of the pinned scroll.
const RISE: [number, number] = [0.08, 0.28]
const RING: [number, number] = [0.28, 0.34]
const CONNECT: [number, number] = [0.34, 0.4]
const ASK: [number, number] = [0.4, 0.8]
const VERDICT: [number, number] = [0.8, 0.92]
const CASE: [number, number] = [0.92, 1]
const PER_Q = (ASK[1] - ASK[0]) / QUESTIONS.length

/** What the phone screen says at scroll progress p: typed over the first 60 % of each line's slot. */
function screenAt(p: number): { caption: string; status: string } {
  const typed = (text: string, from: number, len: number) => text.slice(0, Math.round(text.length * Math.min(1, Math.max(0, (p - from) / (len * 0.6)))))
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const talk = Math.min(1, Math.max(0, (p - CONNECT[0]) / (VERDICT[0] - CONNECT[0])))
  if (p < CONNECT[0]) return { caption: '', status: 'Incoming call' }
  if (p >= VERDICT[0]) return { caption: typed(CLOSING, VERDICT[0], VERDICT[1] - VERDICT[0]), status: `Call ended · ${clock(CALL_SECONDS)}` }
  const status = `Connected · ${clock(talk * CALL_SECONDS)}`
  if (p < ASK[0]) return { caption: typed(GREETING, CONNECT[0], CONNECT[1] - CONNECT[0]), status }
  const q = Math.min(QUESTIONS.length - 1, Math.floor((p - ASK[0]) / PER_Q))
  return { caption: typed(QUESTIONS[q].caption, ASK[0] + q * PER_Q, PER_Q), status }
}

export default function CallOnScroll() {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    let offPointer = () => {}
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(el)
      const caption = q('[data-caption]')[0] as HTMLElement
      const status = q('[data-status]')[0] as HTMLElement
      // Pin the stage, not the root: React keeps owning the root while the pin moves the stage.
      const stage = q('[data-stage]')[0] as HTMLElement
      const shake = q('[data-shake]')[0] as HTMLElement
      // While it waits the phone floats a little, and it leans toward the pointer (transforms only).
      gsap.to('[data-float]', { y: -7, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 })
      const tiltY = gsap.quickTo('[data-tilt]', 'rotationY', { duration: 0.85, ease: 'power3.out' })
      const tiltX = gsap.quickTo('[data-tilt]', 'rotationX', { duration: 0.85, ease: 'power3.out' })
      const lean = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return
        const r = stage.getBoundingClientRect()
        tiltY(((e.clientX - r.left) / r.width - 0.5) * 16)
        tiltX(-((e.clientY - r.top) / r.height - 0.5) * 10)
      }
      const rest = () => {
        tiltY(0)
        tiltX(0)
      }
      stage.addEventListener('pointermove', lean)
      stage.addEventListener('pointerleave', rest)
      offPointer = () => {
        stage.removeEventListener('pointermove', lean)
        stage.removeEventListener('pointerleave', rest)
      }
      let lastCaption = ''
      let lastStatus = ''
      const render = (p: number) => {
        const s = screenAt(p)
        if (s.caption !== lastCaption) caption.textContent = lastCaption = s.caption
        if (s.status !== lastStatus) status.textContent = lastStatus = s.status
      }

      // The headline sharpens in as the section arrives, before the pin takes over.
      // (Its own element: the pinned timeline below fades the outer one, so the two never fight.)
      gsap.fromTo(
        '[data-headline-in]',
        { opacity: 0, filter: 'blur(14px)', scale: 1.04 },
        { opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'top 15%', scrub: 1 } },
      )

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate: () => render(tl.progress()),
        scrollTrigger: { trigger: stage, pin: true, start: 'top top', end: '+=500%', scrub: 1, anticipatePin: 1 },
      })
      tl.set({}, {}, 1) // the timeline runs exactly 0 → 1, so positions read as scroll progress

      // 0–0.12: the headline blurs away.
      tl.fromTo('[data-headline]', { autoAlpha: 1, filter: 'blur(0px)', scale: 1 }, { autoAlpha: 0, filter: 'blur(14px)', scale: 0.94, duration: 0.06, immediateRender: false }, 0.06)
      // 0.08–0.28: the phone rises from below, tips up to face us and lands; its shadow gathers under it.
      tl.fromTo('[data-phone-rise]', { y: '58vh', rotateX: 26, scale: 0.86 }, { y: 0, rotateX: 0, scale: 1, ease: 'expo.out', duration: RISE[1] - RISE[0] }, RISE[0])
      tl.fromTo('[data-phone-turn]', { rotateY: -20 }, { rotateY: -7, duration: 1 - RISE[0] }, RISE[0])
      tl.fromTo('[data-contact]', { opacity: 0 }, { opacity: 1, ease: 'expo.out', duration: RISE[1] - RISE[0] }, RISE[0])
      // The light on its glossy body slides across as it turns.
      tl.fromTo('[data-sheen]', { xPercent: -28 }, { xPercent: 26, duration: 1 - RISE[0] }, RISE[0])
      tl.fromTo('[data-side]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, ease: EASE, duration: 0.08 }, RISE[1] - 0.06)
      // 0.28–0.34: it rings, a shake that decays: x = 6 sin(2π·9t) e^(−3t), on scroll, not on the clock;
      // a neon halo breathes behind it, and the green key blinks.
      const ring = { t: 0 }
      tl.to(ring, {
        t: 1,
        duration: RING[1] - RING[0],
        onUpdate: () => gsap.set(shake, { x: 6 * Math.sin(2 * Math.PI * 9 * ring.t) * Math.exp(-3 * ring.t) }),
      }, RING[0])
      tl.fromTo('[data-halo]', { opacity: 0 }, { opacity: 1, duration: (RING[1] - RING[0]) / 2 }, RING[0])
      tl.to('[data-halo]', { opacity: 0.3, duration: 0.05 }, RING[1])
      tl.to('[data-halo]', { opacity: 0.7, duration: 0.05 }, VERDICT[0])
      tl.fromTo('[data-key-call]', { opacity: 0.35 }, { opacity: 1, duration: 0.02, repeat: 2, yoyo: true }, RING[0])

      // 0.40–0.80: six questions. The key goes down, then the answer drops into the card.
      QUESTIONS.forEach((qn, i) => {
        const at = ASK[0] + i * PER_Q
        const key = `[data-key="${qn.key}"]`
        tl.to(`[data-row="${i}"]`, { opacity: 0.75, duration: 0.008 }, at)
        tl.to(key, { scale: 0.9, duration: 0.008 }, at + PER_Q * 0.6)
        tl.to(`${key} [data-ring]`, { opacity: 1, duration: 0.006 }, at + PER_Q * 0.6)
        tl.to(key, { scale: 1, duration: 0.012 }, at + PER_Q * 0.6 + 0.008)
        tl.to(`${key} [data-ring]`, { opacity: 0, duration: 0.016 }, at + PER_Q * 0.6 + 0.012)
        tl.to(`[data-row="${i}"]`, { opacity: 1, duration: 0.008 }, at + PER_Q * 0.66)
        tl.fromTo(`[data-answer="${i}"]`, { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, ease: EASE, duration: 0.02 }, at + PER_Q * 0.66)
      })

      // 0.80–0.92: the rule decides. The stamp lands, the two answers it matched light up, the screen tints.
      tl.fromTo('[data-verdict]', { scale: 1.15, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, ease: EASE, duration: 0.05 }, VERDICT[0])
      tl.to('[data-cause]', { opacity: 1, duration: 0.03 }, VERDICT[0] + 0.02)
      tl.fromTo('[data-tint]', { opacity: 0 }, { opacity: 0.92, duration: 0.05 }, VERDICT[0])
      tl.fromTo('[data-why]', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, ease: EASE, duration: 0.04 }, VERDICT[0] + 0.05)
      // 0.92–1: a case card slides out from behind the phone.
      tl.fromTo('[data-case]', { xPercent: -55, autoAlpha: 0, scale: 0.96 }, { xPercent: 0, autoAlpha: 1, scale: 1, ease: EASE, duration: CASE[1] - CASE[0] }, CASE[0])

      render(0)
    }, el)
    return () => {
      offPointer()
      ctx.revert()
    }
  }, [])

  return (
    <div ref={root}>
      <div data-stage className="relative flex h-svh flex-col justify-center overflow-hidden">
        <div data-headline className="pointer-events-none absolute inset-x-0 top-[16vh] z-20 px-5 text-center">
          <div data-headline-in>
          <h2 className="display text-[2.4rem] font-medium leading-[1.05] sm:text-[3.6rem]">
            Then Neralu calls <span className="italic neon-mint">Kamala.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[1.0625rem] text-ink/80">Keep scrolling: her call plays as you go, one keypad answer at a time.</p>
          </div>
        </div>

        <p className="sr-only">
          An example call, with demo data. Neralu calls Kamala R., 74, who lives alone, in Kannada. She answers on the
          keypad: no water in the last hour; yes, dizzy, weak or confused; yes, the room is very hot; yes, the fan is
          working; she knows the day; and she is okay. Rule R3, symptoms and no water, makes the call RED, so a
          volunteer nearby is asked to go to her door.
        </p>
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-y-3 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-14">
          {/* Answers, left on a wide screen, under the phone on a narrow one */}
          <div data-side aria-hidden="true" className="order-2 lg:order-1">
            <AnswerCard />
          </div>

          <div className="order-1 flex justify-center [perspective:1400px] lg:order-2">
            <div data-phone-rise aria-hidden="true" className="relative h-[256px] [transform-style:preserve-3d] sm:h-[440px]">
              <div data-halo className="pointer-events-none absolute -inset-16 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand)_30%,transparent),transparent)] opacity-0 blur-2xl" />
              <div className="origin-top scale-[0.58] [transform-style:preserve-3d] sm:scale-100">
                <div data-phone-turn className="[transform-style:preserve-3d]">
                  <div data-tilt className="[transform-style:preserve-3d]">
                    <div data-shake className="[transform-style:preserve-3d]">
                      <div data-float className="[transform-style:preserve-3d]">
                        <KeypadPhone3D />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* The decision, and the person it sends */}
          <div className="order-3 space-y-3">
            <div aria-hidden="true">
              <Verdict />
            </div>
            <CaseCard />
          </div>
        </div>
      </div>
    </div>
  )
}

function AnswerCard() {
  return (
    <figure data-rim className="rounded-[8px] border border-line bg-surface">
      <figcaption className="border-b border-line px-4 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Kamala R.</span>
          <span className="shrink-0 rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted">Example · demo data</span>
        </div>
        <div className="text-sm text-muted">74 · lives alone · sheet roof · Kannada</div>
      </figcaption>
      <ol className="px-4 py-1">
        {QUESTIONS.map((qn, i) => (
          <li key={qn.label} data-row={i} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-line py-1 text-[0.8125rem] opacity-35 last:border-0 sm:py-2 sm:text-[0.9375rem]">
            {qn.cause && <span data-cause aria-hidden="true" className="absolute -inset-x-2 inset-y-0.5 rounded-[4px] bg-alert-bg opacity-0" />}
            <span className="num relative text-xs text-muted">{i + 1}</span>
            <span className="relative">{qn.label}</span>
            <span data-answer={i} className={`relative text-right ${qn.cause ? 'font-semibold text-alert' : ''}`}>
              {qn.answer}
              <span className="ml-1.5 font-mono text-[0.6875rem] font-normal text-muted">key {qn.key}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}

function Verdict() {
  return (
    <div>
      <div data-verdict className="inline-flex max-w-full flex-wrap items-center gap-x-2.5 rounded-[6px] border-[0.4px] border-ink bg-alert-bg px-3.5 py-2 text-alert">
        <span className="font-semibold neon-alert">RED</span>
        <span className="num text-sm">· Rule R3 ·</span>
        <span className="font-semibold">Symptoms and no water</span>
      </div>
      <p data-why className="mt-2.5 hidden max-w-sm sm:block text-[0.9375rem] leading-relaxed text-ink/85">
        They reported dizziness, weakness or confusion, and had no water in the last hour. Together these signal heat
        distress. <span className="text-muted">Decided by a fixed rule, not by AI.</span>
      </p>
    </div>
  )
}

function CaseCard() {
  return (
    <div data-case data-rim className="rounded-[8px] border border-alert/50 bg-surface px-4 py-3.5 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.7)]">
      <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-alert">Case opened · 11:03</div>
      <p className="mt-1 font-semibold leading-snug">A volunteer nearby is asked to go to the door</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">Her son is told. Her address is shown only to the person who accepts.</p>
      <Link to="/ward" className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
        See it in the ward console <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

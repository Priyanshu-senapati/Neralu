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
const RISE: [number, number] = [0.04, 0.24]
const RING: [number, number] = [0.24, 0.32]
const CONNECT: [number, number] = [0.32, 0.4]
const ASK: [number, number] = [0.4, 0.8]
const VERDICT: [number, number] = [0.8, 0.92]
const CASE: [number, number] = [0.92, 1]
const PER_Q = (ASK[1] - ASK[0]) / QUESTIONS.length

/** The published rules (backend/app/rules.py), in the order they are checked: the first match decides. */
const LADDER: [string, string, string][] = [
  ['R0', 'No valid answer on the call', 'bg-ink/60'],
  ['R1', 'Asked for help', 'bg-alert'],
  ['R2', 'Symptoms with possible confusion', 'bg-alert'],
  ['R3', 'Symptoms and no water', 'bg-alert'],
  ['R4', 'Reported dizziness, weakness or confusion', 'bg-watch'],
  ['R5', 'Did not know the day', 'bg-watch'],
  ['R6', 'No water in the last hour', 'bg-watch'],
  ['R7', 'Orientation answer unclear', 'bg-watch'],
  ['R8', 'Several questions unanswered', 'bg-watch'],
  ['R9', 'All checks fine', 'bg-ok'],
]
const MATCH = 3 // R3

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
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(el)
      const caption = q('[data-caption]')[0] as HTMLElement
      const status = q('[data-status]')[0] as HTMLElement
      const shake = q('[data-shake]')[0] as HTMLElement
      // Pin the stage, not the root: React keeps owning the root while the pin moves the stage.
      const stage = q('[data-stage]')[0] as HTMLElement
      let lastCaption = ''
      let lastStatus = ''
      const render = (p: number) => {
        const s = screenAt(p)
        if (s.caption !== lastCaption) caption.textContent = lastCaption = s.caption
        if (s.status !== lastStatus) status.textContent = lastStatus = s.status
      }

      // The headline sharpens in as the section arrives, before the pin takes over.
      gsap.fromTo(
        '[data-headline]',
        { opacity: 0, filter: 'blur(14px)', scale: 1.04 },
        { opacity: 1, filter: 'blur(0px)', scale: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'top 15%', scrub: 0.8 } },
      )

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate: () => render(tl.progress()),
        scrollTrigger: { trigger: stage, pin: true, start: 'top top', end: '+=400%', scrub: 0.8, anticipatePin: 1 },
      })
      tl.set({}, {}, 1) // the timeline runs exactly 0 → 1, so positions read as scroll progress

      // 0–0.12: the headline blurs away.
      tl.fromTo('[data-headline]', { autoAlpha: 1, filter: 'blur(0px)', scale: 1 }, { autoAlpha: 0, filter: 'blur(14px)', scale: 0.94, duration: 0.06, immediateRender: false }, 0.1)
      // 0.08–0.28: the phone rises and lands with a little overshoot.
      tl.fromTo('[data-phone-rise]', { y: '55vh', rotateX: 22 }, { y: 0, rotateX: 0, ease: 'back.out(1.4)', duration: RISE[1] - RISE[0] }, RISE[0])
      tl.fromTo('[data-phone-turn]', { rotateY: -18 }, { rotateY: -6, duration: 1 - RISE[0] }, RISE[0])
      tl.fromTo('[data-side]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, ease: EASE, duration: 0.08 }, RISE[1] - 0.06)
      // 0.28–0.34: it rings, a shake that decays: x = 6 sin(2π·9t) e^(−3t), on scroll, not on the clock.
      const ring = { t: 0 }
      tl.to(ring, {
        t: 1,
        duration: RING[1] - RING[0],
        onUpdate: () => gsap.set(shake, { x: 6 * Math.sin(2 * Math.PI * 9 * ring.t) * Math.exp(-3 * ring.t) }),
      }, RING[0])
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

      // 0.80–0.92: the rule decides. The rules are checked in order: those before R3 do not match, R3
      // does, and the rest are never reached. Then the stamp lands and the two answers it matched light up.
      LADDER.forEach((_, i) => {
        if (i === MATCH) tl.to(`[data-rung="${i}"] [data-rung-hl]`, { opacity: 1, duration: 0.012 }, VERDICT[0] + i * 0.004)
        tl.to(`[data-rung="${i}"]`, { opacity: i === MATCH ? 1 : 0.3, duration: 0.01 }, VERDICT[0] + Math.min(i, MATCH) * 0.004)
      })
      tl.fromTo('[data-verdict]', { scale: 1.15, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, ease: EASE, duration: 0.05 }, VERDICT[0])
      tl.to('[data-cause]', { opacity: 1, duration: 0.03 }, VERDICT[0] + 0.02)
      tl.fromTo('[data-tint]', { opacity: 0 }, { opacity: 0.92, duration: 0.05 }, VERDICT[0])
      tl.fromTo('[data-why]', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, ease: EASE, duration: 0.04 }, VERDICT[0] + 0.05)
      // 0.92–1: a case card slides out from behind the phone.
      tl.fromTo('[data-case]', { xPercent: -55, autoAlpha: 0, scale: 0.96 }, { xPercent: 0, autoAlpha: 1, scale: 1, ease: EASE, duration: CASE[1] - CASE[0] }, CASE[0])

      render(0)
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root}>
      <div data-stage className="relative flex h-svh flex-col justify-center overflow-hidden">
        <div data-headline className="pointer-events-none absolute inset-x-0 top-[16vh] z-20 px-5 text-center">
          <h2 className="display text-[2.4rem] font-medium leading-none tracking-[-0.025em] sm:text-[clamp(3rem,5vw,4.5rem)]">
            Then Neralu calls Kamala.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[1.125rem] text-ink">Keep scrolling: her call plays as you go, one keypad answer at a time.</p>
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
            <div data-phone-rise aria-hidden="true" className="h-[256px] [transform-style:preserve-3d] sm:h-[440px] lg:h-[506px]">
              <div data-phone-turn className="origin-top scale-[0.58] [transform-style:preserve-3d] sm:scale-100 lg:scale-[1.15]">
                <div data-shake className="[transform-style:preserve-3d]">
                  <KeypadPhone3D />
                </div>
              </div>
            </div>
          </div>

          {/* The decision, and the person it sends */}
          <div className="order-3 space-y-3">
            <div aria-hidden="true">
              <RuleLadder />
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
    <figure data-ui className="rounded-[8px] border border-line bg-surface">
      <figcaption className="border-b border-line px-4 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Kamala R.</span>
          <span className="shrink-0 text-[0.8125rem] text-muted">Example, demo data</span>
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

function RuleLadder() {
  return (
    <div data-side data-ui className="mb-4 hidden rounded-[8px] bg-surface px-4 py-3 lg:block">
      <p className="text-[0.875rem] text-muted">The published rules, checked in order. The first that matches decides.</p>
      <ol className="mt-2">
        {LADDER.map(([id, text, dot], i) => (
          <li key={id} data-rung={i} className="relative grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 py-[3px] text-[0.875rem] opacity-60">
            {i === MATCH && <span data-rung-hl aria-hidden="true" className="absolute -inset-x-2 inset-y-0 rounded-[4px] bg-alert-bg opacity-0" />}
            <span className="num relative font-medium">{id}</span>
            <span className="relative truncate">{text}</span>
            <span className={`relative h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
          </li>
        ))}
      </ol>
    </div>
  )
}

function Verdict() {
  return (
    <div>
      <div data-verdict data-ui className="inline-flex max-w-full flex-wrap items-center gap-x-2.5 rounded-[6px] border-[0.4px] border-ink bg-alert-bg px-3.5 py-2 text-alert">
        <span className="font-semibold">RED</span>
        <span className="num text-sm">· Rule R3 ·</span>
        <span className="font-semibold">Symptoms and no water</span>
      </div>
      <p data-why className="mt-3 hidden max-w-sm text-[1rem] leading-relaxed text-ink sm:block">
        They reported dizziness, weakness or confusion, and had no water in the last hour. Together these signal heat
        distress. <span className="text-muted">Decided by a fixed rule, not by AI.</span>
      </p>
    </div>
  )
}

function CaseCard() {
  return (
    <div data-case data-ui className="rounded-[8px] border border-alert/50 bg-surface px-4 py-3.5">
      <div className="text-[0.875rem] text-alert">Case opened at <span className="num">11:03</span></div>
      <p className="mt-1 font-semibold leading-snug">A volunteer nearby is asked to go to the door</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">Her son is told. Her address is shown only to the person who accepts.</p>
      <Link to="/ward" className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
        See it in the ward console <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

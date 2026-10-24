import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Brand'
import { FlowButton } from '@/components/ui/flow-button'
import { EASE, gsap, reducedMotion, ScrollTrigger } from '../motion'
import { api } from '../api'
import { Reveal, RevealLines } from '../components/Reveal'
import caseRecord from '@/assets/story/case-record.webp'
import familyView from '@/assets/story/family-view.webp'
import volunteerPhone from '@/assets/story/volunteer-phone.webp'
import wardConsole from '@/assets/story/ward-console.webp'
import { EXAMPLE_HEAT, personalThreshold } from '@/heat'
import type { ElderListItem } from '@/types'
import { useRuleBook } from '../rules'
import CallOnScroll from '../components/story/CallOnScroll'
import { countCalled, exampleHouseholds, H_END, H_START, householdsFrom, type Household } from '../components/story/orbitPhysics'
import { heat, useHeatValue } from '../components/story/useScrollHeat'

/*
 * The product, explained with the product's own logic. Every number on this page comes from
 * Neralu's rules (backend/app/risk.py, rules.py) or is labelled as an example. No metrics, logos
 * or quotes are invented: there is no deployment yet, and the page says so.
 */

// Canvas-heavy pieces load after first paint, on this page only.
const WardDiorama = lazy(() => import('@/components/WardDiorama'))
const SunOrbits = lazy(() => import('../components/story/SunOrbits'))
const HeatHaze = lazy(() => import('../components/story/HeatHaze'))

export default function Story() {
  const still = reducedMotion()
  const [elders, setElders] = useState<ElderListItem[] | null>(null)
  useEffect(() => {
    api.elders().then(setElders).catch(() => setElders([]))
  }, [])
  // The live ward when it loads; until then, or if it fails, a labelled example ward.
  const example = !elders?.length
  const households = useMemo(() => (elders?.length ? householdsFrom(elders) : exampleHouseholds()), [elders])
  // Scroll scenes measure the page: measure again once the web fonts have set the text.
  useEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh())
  }, [])
  return (
    // isolate: the haze canvas paints above the page colour and below everything else.
    <div id="top" className="relative isolate min-h-dvh bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[4px] focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-ink">
        Skip to content
      </a>
      {!still && (
        <Suspense fallback={null}>
          <HeatHaze />
        </Suspense>
      )}
      <Hero households={households} example={example} />

      <main id="main">
        <Statement elders={elders} />
        <TheCall />
        <Rules />
        <WhoGoes />
        <Phones />
        <Honesty />
      </main>

      <Footer />
    </div>
  )
}

/** The ward's state in words: it changes as the reader scrolls the heat up. */
function bandFor(called: number, total: number): string {
  const share = called / Math.max(1, total)
  if (share < 0.03) return 'A normal afternoon: almost nobody is over their own threshold.'
  if (share < 0.4) return 'A hot afternoon: the most at risk are over their threshold, and get a call.'
  if (share < 0.8) return 'Most of the ward is over its own threshold now.'
  return 'A heatwave: nearly every household gets a call.'
}

function Hero({ households, example }: { households: Household[]; example: boolean }) {
  const still = reducedMotion()
  const section = useRef<HTMLElement>(null)
  const heatLabel = useRef<HTMLSpanElement>(null)
  const countLabel = useRef<HTMLSpanElement>(null)
  const live = useRef<HTMLParagraphElement>(null)
  const called = useHeatValue((H) => countCalled(households, H))

  // Scrolling the pinned hero turns a normal afternoon (31 °C) into a heatwave (38 °C).
  useLayoutEffect(() => {
    const write = () => heatLabel.current && (heatLabel.current.textContent = heat.H.toFixed(1))
    write()
    const off = heat.subscribe(write)
    if (still) return off
    const ctx = gsap.context(() => {
      const proxy = { H: H_START }
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section.current,
          pin: true,
          start: 'top top',
          end: '+=180%',
          scrub: 0.6,
          onLeave: () => heat.settle(true),
          onEnterBack: () => heat.settle(false),
        },
      })
      tl.to(proxy, { H: H_END, duration: 1, onUpdate: () => heat.set(proxy.H) }, 0)
    }, section)
    return () => {
      off()
      ctx.revert()
    }
  }, [still])

  // The count ticks to its new value; the polite live line repeats it only when it changes.
  const shown = useRef(called)
  useEffect(() => {
    const el = countLabel.current
    if (live.current) live.current.textContent = `At ${heat.H.toFixed(1)} °C, ${called} of ${households.length} households get a call.`
    if (!el) return
    if (still) {
      el.textContent = String(called)
      return
    }
    const tween = gsap.to(shown, {
      current: called,
      duration: 0.35,
      ease: EASE,
      onUpdate: () => (el.textContent = String(Math.round(shown.current))),
    })
    return () => {
      tween.kill()
    }
  }, [called, households.length, still])

  // The wrapper is React's: pinning moves the section into a spacer, and React must not lose track of it.
  return (
    <div>
      <section ref={section} className="relative flex h-svh min-h-[640px] flex-col overflow-hidden">
        {/* The orbits sit beside the copy on a wide screen and under it on a phone: never behind the title. */}
        <div className="absolute inset-x-0 bottom-0 top-[56%] sm:top-[52%] lg:inset-y-0 lg:left-[44%] lg:top-0">
          <Suspense fallback={null}>
            <SunOrbits households={households} className="h-full w-full" />
          </Suspense>
        </div>
        <header className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-8">
          <Wordmark />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.9375rem] text-muted">
            <a href="#call" className="hover:text-ink hover:underline">The call</a>
            <a href="#rules" className="hover:text-ink hover:underline">The rules</a>
            <Link to="/responsible" className="hover:text-ink hover:underline">Responsible by design</Link>
            <Link to="/register" className="hover:text-ink hover:underline">Register someone</Link>
          </nav>
        </header>

        <div className="relative mx-auto w-full max-w-6xl flex-1 px-5 pt-7 sm:px-8 sm:pt-10 lg:flex lg:items-center lg:pt-0">
          <div className="lg:max-w-[26rem]">
            <h1 className="display text-[2.6rem] font-medium leading-none tracking-[-0.025em] text-ink sm:text-[3.5rem] lg:text-[clamp(3rem,4.6vw,4.25rem)]">
              <RevealLines delay={0.1}>
                <span>Neralu checks who's safe.</span>
              </RevealLines>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-[1.55] text-ink sm:mt-7 sm:text-[1.125rem]">
              Heat warnings tell a city what's coming. When the heat crosses an older person's own threshold, Neralu
              phones them, and sends someone to the door if an answer is worrying.
            </p>

            <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-1 sm:mt-8">
              <p className="leading-none text-heat">
                <span ref={heatLabel} className="num text-[2.5rem] font-medium tracking-[-0.03em] sm:text-[3rem]">{H_START.toFixed(1)}</span>
                <span className="num ml-1 text-xl">°C</span>
              </p>
              <p className="pb-1 text-[1.0625rem] leading-snug">
                <span ref={countLabel} className="num font-semibold text-heat">{called}</span> of{' '}
                <span className="num">{households.length}</span> households get a call
                {example && <span className="text-muted"> (example data)</span>}
              </p>
            </div>
            <p className="mt-2 text-[0.875rem] text-muted">Heat index on an example afternoon</p>
            <p className="mt-4 hidden text-[1.0625rem] leading-snug text-ink sm:block">{bandFor(called, households.length)}</p>
            <p ref={live} aria-live="polite" className="sr-only" />
            <p className="mt-1.5 hidden text-[0.875rem] leading-relaxed text-muted sm:block">
              {still ? 'Shown at the heatwave, 38 °C.' : 'Scroll to raise the heat.'} A warm night (26 °C or more) lowers
              every threshold by 1 °C.
            </p>

            <div className="mt-5 sm:mt-8">
              <FlowButton to="/ward">Open the ward console</FlowButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/** A picture of one of Neralu's own screens, on a slightly lifted surface like the device it runs on. */
function Shot({ src, alt, caption, width, height, phone = false, crop = '', className = '' }: {
  src: string; alt: string; caption: string; width: number; height: number; phone?: boolean
  /** Classes that crop the picture to its subject, e.g. an aspect ratio with object-cover. */
  crop?: string; className?: string
}) {
  return (
    <figure className={className}>
      <div className={`bg-sunken ${phone ? 'rounded-[22px] p-2' : 'rounded-[10px] p-2 sm:p-3'}`}>
        <img src={src} alt={alt} width={width} height={height} decoding="async" className={`block h-auto w-full ${phone ? 'rounded-[15px]' : 'rounded-[6px]'} ${crop}`} />
      </div>
      <figcaption className="mt-3 text-[0.875rem] leading-relaxed text-muted">{caption}</figcaption>
    </figure>
  )
}

const H2 = 'display text-[2.1rem] font-medium leading-[1.04] tracking-[-0.025em] sm:text-[clamp(2.5rem,3.9vw,3.5rem)]'

/**
 * Kamala's call as a finished card: what reduced motion (and '?still') shows in place of the
 * scroll scene. Same call, same answers and the same rule (R3) as CallOnScroll.
 */
const REPLAY: { q: string; a: string; concern?: boolean; via?: string }[] = [
  { q: 'Water in the last hour', a: 'No', concern: true },
  { q: 'Dizzy, weak or confused', a: 'Yes', concern: true },
  { q: 'Room very hot', a: 'Yes' },
  { q: 'Fan or cooler working', a: 'Yes' },
  { q: 'What day is it today?', a: 'Friday', via: 'pressed 5' },
  { q: 'Okay, or needs help', a: 'Okay' },
]

function CallReplay() {
  return (
    <figure data-ui className="relative rounded-[8px] border border-line bg-surface text-ink">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-xs">
        <span className="inline-flex items-center gap-2 text-ink">
          <span className="inline-flex h-2 w-2 rounded-full bg-line-strong" aria-hidden="true" />
          Call ended · 1 min 12 s
        </span>
        <span className="text-muted">Example, demo data</span>
      </figcaption>

      <div className="flex items-baseline justify-between gap-4 px-5 pt-4">
        <div>
          <div className="text-xl font-semibold tracking-[-0.01em]">Kamala R.</div>
          <div className="text-sm text-muted">74 · lives alone · sheet roof · Kannada</div>
        </div>
        <div className="num text-right text-sm text-muted">
          11:02
          <span className="block text-xs">attempt 1</span>
        </div>
      </div>

      <ol className="mx-5 mt-4 border-t border-line">
        {REPLAY.map((r, i) => (
          <li key={r.q} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-line py-2 text-[0.9375rem]">
            <span className="num text-xs text-muted">{i + 1}</span>
            <span>{r.q}</span>
            <span className={`text-right ${r.concern ? 'font-semibold text-alert' : ''}`}>
              {r.a}
              {r.via && <span className="ml-1 text-xs text-muted">{r.via}</span>}
            </span>
          </li>
        ))}
      </ol>

      <div className="px-5 pb-5 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-[4px] bg-alert-bg px-2 py-1 text-sm font-semibold leading-none text-alert">RED · Needs a person</span>
          <span className="num text-xs leading-none text-muted">Rule R3</span>
        </div>
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed">
          Dizzy, and no water in the last hour: together these signal heat distress. The call ended with advice to drink a
          glass of water now.
        </p>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed">
          <span className="font-semibold">Next:</span> her son is told, and a volunteer nearby is asked to go to her door.
        </p>
        <div className="mt-3 border-t border-line pt-3 text-xs text-muted">Decided by a fixed rule, not by AI</div>
      </div>
    </figure>
  )
}

function Statement({ elders }: { elders: ElderListItem[] | null }) {
  const called = elders?.filter((e) => personalThreshold(e.risk_score) <= EXAMPLE_HEAT).length ?? 0
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
      <Reveal>
        <h2 className="display text-[1.9rem] font-medium leading-[1.04] tracking-[-0.025em] sm:text-[clamp(2.5rem,4.4vw,4rem)]">
          A broadcast tells. A call checks.<br className="max-sm:hidden" /> A person goes.
        </h2>
      </Reveal>
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] items-center gap-x-14 gap-y-10 lg:mt-14 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <Reveal delay={0.08}>
          <p className="text-[1.1875rem] leading-[1.55] text-ink sm:text-[1.25rem]">
            Heat alerts already reach phones across the city. What nobody does is check that Kamala, 74, alone under a
            sheet roof, is actually all right. That is the gap Neralu fills.
          </p>
        </Reveal>
        <figure>
          <div className="relative h-[340px] sm:h-[460px]">
            {elders && elders.length > 0 && (
              <Suspense fallback={null}>
                <WardDiorama elders={elders} heat={EXAMPLE_HEAT} className="h-full w-full" />
              </Suspense>
            )}
          </div>
          <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-muted">
            <span>Ward 47 at <span className="num">{EXAMPLE_HEAT}</span> °C: <span className="num font-semibold text-heat">{called}</span> of {elders?.length ?? '—'} homes get a call. Height is heat risk. Demo data.</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#e8622e]" />Called, high risk</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#ee9a45]" />Called</span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

function TheCall() {
  const steps: [string, string][] = [
    ['The heat crosses her threshold', 'The forecast is checked against every registered person. Only those over their own threshold are called, once or twice depending on how far over.'],
    ['Neralu phones her', 'A recorded voice in her language. The call opens with a code word her family chose, and says Neralu never asks for money, OTP, Aadhaar or bank details.'],
    ['Four questions on the keypad', 'Water in the last hour, dizziness or weakness, a very hot room, a working fan. Press 1 for yes, 2 for no. Silence gets one repeat. The call ends with: press 2 if you need help now.'],
    ['The day check', '"What day is it today?" Pressed on the keypad (1 for Monday to 7 for Sunday), or spoken where the line can record. Heat can confuse people who still say they are fine, so the answer is checked, not trusted.'],
    ['Fixed rules decide', 'GREEN, AMBER or RED, from the published rules below. A picked-up call with no answers is never counted as safe.'],
    ['A person responds', 'Her family is told. If the check is RED, or she does not answer twice, someone nearby is asked to go to her door.'],
  ]
  const still = reducedMotion()
  const list = (
    <ol className={still ? 'mt-2' : 'mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3'}>
      {steps.map(([title, body], i) => (
        <li key={title} className={`grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 ${still ? 'pb-8 last:pb-0' : ''}`}>
          <span className="display text-[2.1rem] font-medium leading-none text-brand">{i + 1}</span>
          <div className="pt-1">
            <h3 className="text-[1.125rem] font-semibold">{title}</h3>
            <p className="mt-1.5 text-[1.0625rem] leading-relaxed text-ink">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
  // Moving: the call plays as a pinned scroll scene, then the steps. Still: the finished call beside them.
  if (!still)
    return (
      <section id="call" className="scroll-mt-6">
        <CallOnScroll />
        <div className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:px-8 lg:pb-32">
          <Reveal>
            <h2 className={H2}>How every call works</h2>
          </Reveal>
          {list}
        </div>
      </section>
    )
  return (
    <section id="call" className="scroll-mt-6 bg-shade">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <h2 className={H2}>How every call works</h2>
            <div className="mt-8">
              <CallReplay />
            </div>
          </div>
          {list}
        </div>
      </div>
    </section>
  )
}

const RULE_OUTCOME: Record<string, { label: string; dot: string; text: string }> = {
  R0: { label: 'Not reached', dot: 'bg-ink/60', text: 'text-ink' },
  R1: { label: 'RED', dot: 'bg-alert', text: 'text-alert' },
  R2: { label: 'RED', dot: 'bg-alert', text: 'text-alert' },
  R3: { label: 'RED', dot: 'bg-alert', text: 'text-alert' },
  R4: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  R5: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  R6: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  R7: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  R8: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  R9: { label: 'GREEN', dot: 'bg-ok', text: 'text-ok' },
  S1: { label: 'Support', dot: 'bg-support', text: 'text-support' },
  E1: { label: 'RED', dot: 'bg-alert', text: 'text-alert' },
  E3: { label: 'RED', dot: 'bg-alert', text: 'text-alert' },
  E7: { label: 'Call again', dot: 'bg-watch', text: 'text-watch' },
  C0: { label: 'Not reached', dot: 'bg-ink/60', text: 'text-ink' },
  C1: { label: 'RED', dot: 'bg-alert', text: 'text-alert' },
  C2: { label: 'RED', dot: 'bg-alert', text: 'text-alert' },
  C3: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  C4: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  C5: { label: 'AMBER', dot: 'bg-watch', text: 'text-watch' },
  C6: { label: 'GREEN', dot: 'bg-ok', text: 'text-ok' },
}

function Rules() {
  const book = useRuleBook()
  return (
    <section id="rules" className="scroll-mt-6 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:py-32">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <Reveal>
            <h2 className={H2}>Rules decide. AI only listens.</h2>
          </Reveal>
          <p className="mt-6 text-[1.0625rem] leading-relaxed text-ink">
            Where the day is spoken rather than pressed, speech-to-text turns it into a word. That is all the AI does.
            Whether someone is safe is decided by these rules, in this order; the first one that matches wins.
          </p>
          <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink">"I'm okay" never overrides another warning sign. Anything unclear is followed up, not assumed fine.</p>
          <p className="mt-6 text-[0.875rem] text-muted">Loaded live from the Neralu server: the same rules the console uses.</p>
        </div>
        <div>
          {!book && <p className="text-[1.0625rem] text-muted">Loading the rule book…</p>}
          {book && (
            <table className="w-full text-[1rem]">
              <caption className="sr-only">Neralu's safety rules</caption>
              <thead className="text-left text-[0.875rem] text-muted">
                <tr className="border-b border-ink">
                  <th scope="col" className="pb-2 pr-4 font-normal">Rule</th>
                  <th scope="col" className="pb-2 pr-4 font-normal">Result</th>
                  <th scope="col" className="pb-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.entries(book.explain).map(([id, text]) => {
                  const o = RULE_OUTCOME[id]
                  return (
                    <tr key={id} className="align-baseline">
                      <th scope="row" className="num py-3 pr-4 font-medium">{id}</th>
                      <td className={`whitespace-nowrap py-3 pr-4 font-semibold ${o?.text ?? ''}`}>
                        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${o?.dot ?? ''}`} aria-hidden="true" />
                        {o?.label}
                      </td>
                      <td className="py-3 leading-relaxed text-ink">{text}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}

function WhoGoes() {
  const tiers: [string, string][] = [
    ['Neighbour', 'If the family gave a neighbour’s number, they are asked first.'],
    ['RWA volunteer', 'Volunteers on duty nearby get the case on their phone and accept it.'],
    ['ASHA worker', 'If no volunteer accepts in time, the case moves to the area’s health worker.'],
    ['Ward officer', 'If nobody accepts, the case is flagged on the ward console for the officer to act.'],
  ]
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div>
          <Reveal>
            <h2 className={H2}>Who goes to the door</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mt-6 max-w-xl text-[1.125rem] leading-relaxed text-ink">
              A RED case goes to people, one step at a time, each with a timer. Whoever is asked sees why, and sees the
              address only after accepting.
            </p>
          </Reveal>
          <ol className="mt-10 space-y-7">
            {tiers.map(([who, what], i) => (
              <li key={who} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4">
                <span className="num grid h-11 w-11 place-items-center rounded-full bg-brand-tint text-[1.0625rem] font-medium text-brand">{i + 1}</span>
                <div className="pt-1.5">
                  <h3 className="text-[1.125rem] font-semibold">{who}</h3>
                  <p className="mt-1 text-[1.0625rem] leading-relaxed text-ink">{what}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-xl text-[1.0625rem] leading-relaxed text-ink">
            <span className="font-semibold">Neralu never calls an ambulance on its own.</span> Only a person who has seen or
            heard the emergency records "called 108".
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          <Reveal delay={0.12}>
            <Shot src={volunteerPhone} width={780} height={1688} phone alt="Neralu's volunteer page on a phone: Kamala's RED case accepted, with her address, a call button and the ways to record the visit." caption="Priya’s phone once she accepts: only now does Kamala’s address appear." />
          </Reveal>
          <Reveal delay={0.2}>
            <Shot src={familyView} width={780} height={1688} phone className="mt-16" alt="Kamala's family's private page on a phone: checked in person and safe, with today's timeline of calls and the visit." caption="Her family’s private page: the day so far, without any volunteer’s name." />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/** A drawn keypad phone: the device Neralu is designed for. 1 and 2 are the keys that matter. */
function KeypadPhone() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
  return (
    <svg viewBox="0 0 160 300" className="h-auto w-[150px]" role="img" aria-label="A keypad phone showing an incoming Neralu call: press 1 for yes, 2 for no">
      <rect x="4" y="4" width="152" height="292" rx="26" fill="#17302A" stroke="#F3F1EA" strokeOpacity="0.25" />
      <rect x="22" y="26" width="116" height="96" rx="6" fill="#F3F1EA" />
      <text x="80" y="54" textAnchor="middle" fontFamily="Public Sans" fontSize="11" fill="#5F625B">Incoming call</text>
      <text x="80" y="76" textAnchor="middle" fontFamily="Public Sans" fontWeight="600" fontSize="17" fill="#1F3D33">Neralu</text>
      <text x="80" y="96" textAnchor="middle" fontFamily="Public Sans" fontSize="10.5" fill="#5F625B">Code word: Mallige</text>
      <text x="80" y="112" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#5F625B">1 = yes · 2 = no</text>
      {keys.map((k, i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        const hot = k === '1' || k === '2'
        return (
          <g key={k}>
            <rect x={22 + col * 40} y={140 + row * 36} width="34" height="28" rx="9" fill={hot ? '#F3F1EA' : '#24453B'} />
            <text x={39 + col * 40} y={159 + row * 36} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="13" fontWeight={hot ? 600 : 400} fill={hot ? '#1F3D33' : '#F3F1EA'} fillOpacity={hot ? 1 : 0.7}>
              {k}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Phones() {
  const facts: [string, string][] = [
    ['Any phone', 'A normal voice call to a keypad phone. Nothing to install, no smartphone, no data plan.'],
    ['Their language', 'Kannada, Tamil, Telugu, Urdu or Hindi, chosen by the family. This demo speaks English and Hindi; Kannada recordings by a native speaker are next.'],
    ['A reason to pick up', 'Scam calls have taught people not to answer strangers. The family code word is how they know it is Neralu.'],
    ['Registered by family', 'A son or daughter registers a parent from any phone, with the parent’s permission. The address is shown only to the volunteer who accepts a case.'],
  ]
  return (
    <section className="bg-brand-tint text-ink">
      <div className="mx-auto grid max-w-6xl items-center gap-x-16 gap-y-12 px-5 py-24 sm:px-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:py-32">
        <div className="flex justify-center lg:justify-start">
          <KeypadPhone />
        </div>
        <div>
          <Reveal>
            <h2 className={H2}>Built for any phone</h2>
          </Reveal>
          <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {facts.map(([t, d]) => (
              <div key={t}>
                <dt className="text-[1.125rem] font-semibold">{t}</dt>
                <dd className="mt-1.5 text-[1.0625rem] leading-relaxed text-ink">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

function Honesty() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
      <Reveal>
        <h2 className={H2}>What is real in this demo</h2>
      </Reveal>
      <Reveal delay={0.08}>
        <p className="mt-6 max-w-2xl text-[1.125rem] leading-relaxed text-ink">
          Ward 47 is a demo ward. The call, the rules, the escalation and the volunteer’s phone are real; the weather,
          the clock and the other 400 residents are simulated, and every screen says so.
        </p>
      </Reveal>
      <Reveal delay={0.14}>
        <Shot
          className="mt-12"
          src={wardConsole}
          width={1440}
          height={900}
          alt="The Neralu ward console during a demo heatwave: heat index 43.4 °C, round 1 in progress, a 3D map of Ward 47 with Kamala's home marked RED, and her call decided RED by Rule R3."
          caption="The ward console a minute after Kamala’s call: Rule R3 made it RED and the three nearest volunteers were alerted. Demo data."
        />
      </Reveal>
      <div className="mt-16 grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        <div>
          <h3 className="text-[1.25rem] font-semibold">Real in this demo</h3>
          <ul className="mt-3 space-y-3 text-[1.0625rem] leading-relaxed text-ink">
            <li>The call to Kamala, on a real phone or, where the network blocks it, on the browser phone. Her keypad answers, including the day.</li>
            <li>The rules that classify the call, and the escalation that follows.</li>
            <li>The volunteer accepting the case on a real phone, and the live ward console.</li>
          </ul>
        </div>
        <div>
          <h3 className="text-[1.25rem] font-semibold">Simulated, and labelled</h3>
          <ul className="mt-3 space-y-3 text-[1.0625rem] leading-relaxed text-ink">
            <li>The weather, set from the demo controls.</li>
            <li>The clock, which runs 60 times faster so a day fits in minutes.</li>
            <li>The other 400 residents of Ward 47 and their answers, and messages to families.</li>
          </ul>
          <p className="mt-4 text-[0.875rem] text-muted">Neralu has not been deployed yet. There are no user numbers on this page because there are none to show.</p>
        </div>
        <Shot
          src={caseRecord}
          width={1440}
          height={900}
          crop="aspect-[4/5] object-cover object-top"
          alt="A printable Neralu case record for Kamala R.: closed, safe and confirmed in person, with her heat risk factors and the rule that opened the case."
          caption="Every case can be printed as a record: who was called, what they answered, which rule fired, who went."
        />
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-surface">
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-20 sm:px-8">
        <p className="display text-[clamp(4.5rem,17vw,14rem)] font-medium leading-[0.85] tracking-[-0.045em]">Neralu</p>
        <div className="mt-10 grid items-end gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <p className="max-w-sm text-[1.0625rem] leading-relaxed text-ink">
            <span className="kn" lang="kn">ನೆರಳು</span> (neralu) means shade in Kannada. Welfare checks for the people a
            heatwave hurts first.
          </p>
          <div className="text-[1.0625rem]">
            <p className="leading-relaxed text-ink">Hack4SDG prototype. SDG targets 11.5, 3.d and 13.1.</p>
            <Link to="/responsible" className="mt-2 inline-block text-muted underline underline-offset-4 hover:text-ink">
              Responsible by design: data, consent and risks
            </Link>
          </div>
          <a href="#top" className="inline-flex items-center gap-1.5 text-[1.0625rem] font-semibold text-muted hover:text-ink">
            Back to top
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  )
}

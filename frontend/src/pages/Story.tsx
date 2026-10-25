import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Brand'
import { FlowButton } from '@/components/ui/flow-button'
import { AnimatedThemeToggle } from '@/components/ui/animated-theme-toggle'
import { useTheme } from '@/theme'
import { Spotlight } from '@/components/ui/spotlight'
import { EASE, gsap, reducedMotion, ScrollTrigger } from '../motion'
import { api } from '../api'
import { Reveal, RevealLines } from '../components/Reveal'
import type { PublicHousehold } from '@/types'
import { useRuleBook } from '../rules'
import CallOnScroll from '../components/story/CallOnScroll'
import { countCalled, exampleHouseholds, H_START, householdsFrom, type Household } from '../components/story/orbitPhysics'
import { heatAt } from '../components/story/space/cameraPath'
import { heat, useHeatValue } from '../components/story/useScrollHeat'
import { useRimLight } from '../components/story/useRimLight'
import { smoothWheel } from '../components/story/smoothWheel'

/*
 * The product, explained with the product's own logic. Every number on this page comes from
 * Neralu's rules (backend/app/risk.py, rules.py) or is labelled as an example. No metrics, logos
 * or quotes are invented: there is no deployment yet, and the page says so.
 */

// Canvas-heavy pieces load after first paint, on this page only.
const HeroSpace = lazy(() => import('../components/story/HeroSpace'))
const HeatHaze = lazy(() => import('../components/story/HeatHaze'))

export default function Story() {
  const still = reducedMotion()
  const page = useRef<HTMLDivElement>(null)
  useRimLight(page)
  const [elders, setElders] = useState<PublicHousehold[] | null>(null)
  useEffect(() => {
    api.households().then(setElders).catch(() => setElders([]))
  }, [])
  // The live ward when it loads; until then, or if it fails, a labelled example ward.
  const example = !elders?.length
  const households = useMemo(() => (elders?.length ? householdsFrom(elders) : exampleHouseholds()), [elders])
  // Scroll scenes measure the page: measure again once the web fonts have set the text.
  useEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh())
  }, [])
  // A notched mouse wheel (Windows) glides instead of stepping through the scroll-played scenes.
  useEffect(() => smoothWheel(), [])
  return (
    // isolate: the haze canvas paints above the page colour and below everything else.
    <div id="top" ref={page} className="skin relative isolate min-h-dvh bg-paper text-ink">
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
        <Statement />
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

function Hero({ households, example }: { households: Household[]; example: boolean }) {
  const still = reducedMotion()
  const theme = useTheme()
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
      const proxy = { p: 0 }
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section.current,
          pin: true,
          start: 'top top',
          end: '+=420%', // an unhurried flight
          scrub: 1, // the scene catches up with the scroll over a second, so it glides
          onLeave: () => heat.settle(true),
          onEnterBack: () => heat.settle(false),
        },
      })
      // One progress value drives the camera's flight (space/cameraPath.ts) and the heat with it.
      tl.to(proxy, { p: 1, duration: 1, onUpdate: () => (heat.setProgress(proxy.p), heat.set(heatAt(proxy.p))) }, 0)
      // The headline turns from the problem to the answer as the heat rises.
      tl.fromTo('[data-line-a]', { opacity: 1 }, { opacity: 0.38, duration: 0.3 }, 0.12)
      tl.fromTo('[data-line-b]', { opacity: 0.22, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.3 }, 0.2)
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
      duration: 0.5,
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
      {/* Dark: deep space. Light: the same scene on a daylight sky, with the page's light tokens. */}
      <section ref={section} className={`${theme === 'dark' ? 'space-dark ' : ''}relative flex h-svh min-h-[600px] flex-col overflow-hidden bg-paper`}>
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <HeroSpace households={households} className="h-full w-full" />
          </Suspense>
          {/* The light that follows the cursor across the hero. */}
          <Spotlight className="z-[1]" color="rgba(255, 200, 140, 0.14)" size={520} />
          {/* A shade over the copy's side, so the text reads over space and the sun. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--paper)_88%,transparent)_0%,color-mix(in_srgb,var(--paper)_55%,transparent)_38%,transparent_62%)] max-lg:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--paper)_85%,transparent)_0%,color-mix(in_srgb,var(--paper)_40%,transparent)_45%,transparent_70%)]" />
        </div>
        <header className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-8">
          <Wordmark />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            <a href="#call" className="hover:text-ink hover:underline">The call</a>
            <a href="#rules" className="hover:text-ink hover:underline">The rules</a>
            <Link to="/responsible" className="hover:text-ink hover:underline">Responsible by design</Link>
            <Link to="/register" className="hover:text-ink hover:underline">Register someone</Link>
            <AnimatedThemeToggle />
          </nav>
        </header>

        <div className="pointer-events-none relative mx-auto w-full max-w-6xl flex-1 px-5 pt-6 sm:px-8 lg:flex lg:items-center lg:pt-0">
          <div className="max-w-[34rem] [&_a]:pointer-events-auto">
            <h1 className="display text-[2.2rem] font-medium leading-[1.05] text-ink sm:text-[3rem] xl:text-[3.4rem]">
              <RevealLines delay={0.15}>
                <span data-line-a className="block">Heat warnings tell a city what's coming.</span>
                <span data-line-b className="mt-1 block"><span className="italic neon-gradient">Neralu checks who's safe.</span></span>
              </RevealLines>
            </h1>
            <p className="mt-5 text-base leading-[1.6] text-ink/85 sm:mt-6 sm:text-[1.0625rem]">
              When the heat crosses an older person's own threshold, Neralu calls them on whatever phone they have, in their
              language. If an answer is worrying, or nobody picks up, a person nearby is asked to go to the door.
            </p>

            <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-line pt-4">
              <div>
                <div className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted">Heat index · example afternoon</div>
                <div className="mt-1 leading-none text-heat">
                  <span ref={heatLabel} className="num neon-heat text-[2.6rem] font-medium tracking-[-0.04em] sm:text-[3.1rem]">{H_START.toFixed(1)}</span>
                  <span className="num ml-1 text-lg">°C</span>
                </div>
              </div>
              <p className="pb-1 text-[1.0625rem] leading-snug">
                <span ref={countLabel} className="num font-semibold neon-heat">{called}</span> of{' '}
                <span className="num">{households.length}</span> households
                <br />
                get a call
                {example && <span className="ml-2 rounded-[3px] border border-line-strong px-1.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted">example data</span>}
              </p>
            </div>
            <p ref={live} aria-live="polite" className="sr-only" />
            <p className="mt-2 hidden text-xs leading-relaxed text-muted sm:block">
              {still ? 'Ward 47 at the heatwave, 38 °C.' : 'Scroll to fly down to Ward 47; the heat rises when you arrive.'} A warm
              night (26 °C or more) lowers every threshold by 1 °C.
            </p>

            <div className="mt-6 hidden sm:block">
              <FlowButton to="/ward">Open the ward console</FlowButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

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
    <figure data-rim className="relative rounded-[8px] border border-line bg-surface text-ink shadow-[0_1px_2px_rgba(27,29,26,0.05),0_24px_48px_-24px_rgba(0,0,0,0.55)]">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-xs">
        <span className="inline-flex items-center gap-2 text-ink">
          <span className="inline-flex h-2 w-2 rounded-full bg-line-strong" aria-hidden="true" />
          Call ended · 1 min 12 s
        </span>
        <span className="rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted">
          Example · demo data
        </span>
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

function Statement() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div>
        <p className="display max-w-4xl text-[2.4rem] font-medium leading-[1.12] sm:text-[3.4rem]">
          <RevealLines stagger={0.35}>
            <span>A broadcast tells.</span>
            <span>A call checks.</span>
            <span className="italic neon-mint">A person goes.</span>
          </RevealLines>
        </p>
        <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink/80">
          Heat alerts already reach phones across the city. What nobody does is check that Kamala, 74, alone under a
          sheet roof, is actually all right. That is the gap Neralu fills.
        </p>
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
    <ol className={still ? 'relative' : 'mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3'}>
      {steps.map(([title, body], i) => (
        <li key={title} className="relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 pb-9 last:pb-0">
          {still && i < steps.length - 1 && <span className="absolute left-[1.05rem] top-11 bottom-1 w-px bg-line-strong" aria-hidden="true" />}
          <span className="display text-[2.1rem] font-medium leading-none text-brand">{i + 1}</span>
          <div className="pt-1">
            <h3 className="text-[1.0625rem] font-semibold">{title}</h3>
            <p className="mt-1.5 leading-relaxed text-ink/80">{body}</p>
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
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8">
          <Reveal blur={false}>
            <h2 className="display max-w-3xl text-[2.4rem] font-medium leading-[1.05]">
              One unanswered call is enough to send <span className="italic neon-mint">someone to the door.</span>
            </h2>
          </Reveal>
          {list}
        </div>
      </section>
    )
  return (
    <section id="call" className="scroll-mt-6 border-y border-line bg-shade">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <h2 className="display text-[2.4rem] font-medium leading-[1.05]">
              One unanswered call is enough to send <span className="italic neon-mint">someone to the door.</span>
            </h2>
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
  E8: { label: 'Officer', dot: 'bg-alert', text: 'text-alert' },
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
    <section id="rules" className="scroll-mt-6 border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <Reveal blur={false}>
            <h2 className="display text-[2.4rem] font-medium leading-[1.05]">
              Rules decide. <span className="italic neon-mint">AI only listens.</span>
            </h2>
          </Reveal>
          <p className="mt-5 leading-relaxed text-ink/80">
            Where the day is spoken rather than pressed, speech-to-text turns it into a word. That is all the AI does. Whether someone is safe is decided
            by these rules, in this order; the first one that matches wins.
          </p>
          <p className="mt-3 leading-relaxed text-ink/80">"I'm okay" never overrides another warning sign. Anything unclear is followed up, not assumed fine.</p>
          <p className="mt-6 text-xs text-muted">Loaded live from the Neralu server: the same rules the console uses.</p>
        </div>
        <div>
          {!book && <p className="text-sm text-muted">Loading the rule book…</p>}
          {book && (
            <table className="w-full text-[0.875rem]">
              <caption className="sr-only">Neralu's safety rules</caption>
              <thead className="text-left text-xs text-muted">
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
                      <td className="py-3 leading-relaxed text-ink/85">{text}</td>
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
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <Reveal blur={false}>
        <h2 className="display max-w-3xl text-[2.4rem] font-medium leading-[1.05]">
          Escalation goes to people, <span className="italic neon-mint">one step at a time.</span>
        </h2>
      </Reveal>
      <ol className="mt-12 grid gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map(([who, what], i) => (
          <li key={who} className="relative pr-6">
            <div className="flex items-center">
              <span className="display grid h-11 w-11 shrink-0 place-items-center rounded-full border border-brand text-lg font-medium text-brand">{i + 1}</span>
              {i < tiers.length - 1 && <span className="ml-3 hidden h-px flex-1 bg-line-strong lg:block" aria-hidden="true" />}
            </div>
            <h3 className="mt-4 text-[1.0625rem] font-semibold">{who}</h3>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink/80">{what}</p>
          </li>
        ))}
      </ol>
      <div className="mt-12 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <p className="leading-relaxed text-ink/85">
          <span className="font-semibold text-ink">Neralu never calls an ambulance on its own.</span> Only a person who
          has seen or heard the emergency records "called 108".
        </p>
        <p className="leading-relaxed text-ink/85">
          <span className="font-semibold text-ink">Addresses stay private.</span> A volunteer sees someone’s address
          only after accepting their case.
        </p>
      </div>
    </section>
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
    <section className="border-y border-line bg-brand-tint text-ink">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div>
          <Reveal blur={false}>
            <h2 className="display text-[2.4rem] font-medium leading-[1.05]">
              Built for the phones <span className="italic">people actually have.</span>
            </h2>
          </Reveal>
          <dl className="mt-10 grid gap-x-12 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map(([t, d]) => (
              <div key={t} className="border-t border-line pt-4">
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-1.5 leading-relaxed text-muted">{d}</dd>
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
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <Reveal blur={false}>
        <h2 className="display max-w-3xl text-[2.4rem] font-medium leading-[1.05]">
          What you are looking at <span className="italic neon-mint">is a working prototype.</span>
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div className="border-t border-ink pt-5">
          <h3 className="font-semibold">Real in this demo</h3>
          <ul className="mt-3 space-y-2.5 leading-relaxed text-ink/80">
            <li>The call to Kamala, on a real phone or, where the network blocks it, on the browser phone. Her keypad answers, including the day.</li>
            <li>The rules that classify the call, and the escalation that follows.</li>
            <li>The volunteer accepting the case on a real phone, and the live ward console.</li>
          </ul>
        </div>
        <div className="border-t border-line-strong pt-5">
          <h3 className="font-semibold">Simulated, and labelled as such</h3>
          <ul className="mt-3 space-y-2.5 leading-relaxed text-ink/80">
            <li>The weather, set from the demo controls.</li>
            <li>The clock, which runs 60 times faster so a day fits in minutes.</li>
            <li>The other 400 residents of Ward 47 and their answers, and messages to families.</li>
          </ul>
          <p className="mt-4 text-sm text-muted">Neralu has not been deployed yet. There are no user numbers on this page because there are none to show.</p>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl items-end gap-8 px-5 py-10 sm:px-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            <span className="kn" lang="kn">ನೆರಳು</span> (neralu) means shade in Kannada. Welfare checks for the people a
            heatwave hurts first.
          </p>
        </div>
        <div className="text-sm">
          <div className="font-semibold">Context</div>
          <p className="mt-2 leading-relaxed text-muted">Hack4SDG prototype. SDG targets 11.5, 3.d and 13.1.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Earth: NASA Blue Marble and Black Marble (public domain). Bengaluru and Ward 47: Sentinel-2 cloudless 2016 by
            EOX IT Services GmbH, contains modified Copernicus Sentinel data 2016, CC BY 4.0.
          </p>
          <Link to="/responsible" className="mt-2 inline-block text-muted underline underline-offset-2 hover:text-ink">
            Responsible by design: data, consent and risks
          </Link>
        </div>
        <a href="#top" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          Back to top
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </footer>
  )
}

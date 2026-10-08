import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Brand'
import { FlowButton } from '@/components/ui/flow-button'
import { gsap, reducedMotion } from '../motion'
import { api } from '../api'
import { HeatExplorer } from '../components/HeatExplorer'
import { Reveal, RevealLines } from '../components/Reveal'
import { Spotlight } from '@/components/ui/spotlight'
import { EXAMPLE_HEAT, personalThreshold } from '@/heat'
import { useTheme } from '@/theme'
import type { ElderListItem } from '@/types'
import { useRuleBook } from '../rules'

/*
 * The product, explained with the product's own logic. Every number on this page comes from
 * Neralu's rules (backend/app/risk.py, rules.py) or is labelled as an example. No metrics, logos
 * or quotes are invented: there is no deployment yet, and the page says so.
 */

// three.js is heavy: load the shader only on this page, after first paint.
const ShaderAnimation = lazy(() => import('@/components/ui/shader-animation').then((m) => ({ default: m.ShaderAnimation })))
const WardDiorama = lazy(() => import('@/components/WardDiorama'))
const HeatGlobe = lazy(() => import('@/components/HeatGlobe'))

// Hero backdrop: deep shade, rings in heat, sun and a little shade green.

const HEAT_RINGS: [string, string, string] = ['#e8743b', '#f2b84b', '#5fa38a']
const RING_CENTER: [number, number] = [0.85, 0.05] // behind the call card

export default function Story() {
  const theme = useTheme()
  const [elders, setElders] = useState<ElderListItem[] | null>(null)
  useEffect(() => {
    api.elders().then(setElders).catch(() => setElders([]))
  }, [])
  const heroBg = theme === 'light' ? '#f7f6f1' : '#000000' // matches --paper; the shader needs a concrete colour
  return (
    <div id="top" className="min-h-dvh bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[4px] focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-ink">
        Skip to content
      </a>
      {/* Heat radiating behind the opening: the shader is the hero's backdrop and nothing else. */}
      <div className="relative isolate overflow-hidden bg-paper text-ink">
        <Suspense fallback={null}>
          <ShaderAnimation className="absolute inset-0 -z-10" background={heroBg} colors={HEAT_RINGS} intensity={0.32} speed={0.4} center={RING_CENTER} quietSide={1} />
        </Suspense>
        <Spotlight className="-z-[5]" />
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Wordmark />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <a href="#call" className="hover:text-ink hover:underline">The call</a>
            <a href="#rules" className="hover:text-ink hover:underline">The rules</a>
            <Link to="/register" className="hover:text-ink hover:underline">Register someone</Link>
          </nav>
        </header>
        <Hero elders={elders} />
      </div>

      <main id="main">
        <HeatExplorer />
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

function Hero({ elders }: { elders: ElderListItem[] | null }) {
  const called = elders?.filter((e) => personalThreshold(e.risk_score) <= EXAMPLE_HEAT).length ?? 0

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-x-10 gap-y-8 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:pb-20 lg:pt-10">
      <div>
        <h1 className="display text-[2.4rem] font-medium leading-[1.05] text-ink sm:text-[3rem] xl:text-[3.4rem]">
          <RevealLines delay={0.15}>
            <span className="block lg:whitespace-nowrap">Heat warnings tell a city</span>
            <span className="block">what's coming.</span>
            <span className="oled mt-1 block italic text-sun lg:whitespace-nowrap">Neralu checks who's safe.</span>
          </RevealLines>
        </h1>
        <p className="mt-7 max-w-[34rem] text-[1.125rem] leading-[1.65] text-ink/85">
          When the heat crosses a person's own threshold, Neralu calls them on whatever phone they have, in their
          language. If an answer is worrying, or nobody picks up, a person nearby is asked to go to the door.
        </p>
        {elders && elders.length > 0 && (
          <p className="mt-6 max-w-[34rem] text-[1.0625rem] leading-relaxed text-ink/90">
            On a <span className="num">{EXAMPLE_HEAT}</span>°C afternoon,{' '}
            <span className="num oled font-semibold text-sun">{called}</span> of <span className="num">{elders.length}</span> households in
            Ward 47 get a call. The rest are below their own threshold.
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
          <FlowButton to="/ward">Open the ward console</FlowButton>
        </div>
        <p className="mt-10 max-w-[34rem] border-t border-line pt-4 text-sm leading-relaxed text-muted">
          Ward 47 is a demo ward: its residents, weather and most call outcomes are simulated and labelled.
          The rules, the escalation and the live call are real.
        </p>
      </div>

      <figure className="relative">
        <div className="relative h-[380px] sm:h-[460px] lg:h-[540px]">
          <Suspense fallback={null}>
            <HeatGlobe className="h-full w-full" />
          </Suspense>
        </div>
        <figcaption className="mt-1 text-center text-xs text-muted">
          Dot colour shows broad climate zones, hot to cool. Illustrative, not live temperatures.
        </figcaption>
      </figure>
    </section>
  )
}

/**
 * Kamala's call, replayed once: the page's one authored motion. It follows the real rules (R6), is
 * labelled demo data, and with reduced motion it simply shows the finished call.
 */
const REPLAY: { q: string; a: string; concern?: boolean; via?: string }[] = [
  { q: 'Water in the last hour', a: 'No', concern: true },
  { q: 'Dizzy, weak or confused', a: 'No' },
  { q: 'Room very hot', a: 'Yes' },
  { q: 'Fan or cooler working', a: 'Yes' },
  { q: 'What day is it today?', a: 'Friday', via: 'pressed 5' },
  { q: 'Okay, or needs help', a: 'Okay' },
]

function CallReplay() {
  const root = useRef<HTMLDivElement>(null)
  const status = useRef<HTMLSpanElement>(null)
  const [done, setDone] = useState(false)
  const tl = useRef<gsap.core.Timeline | null>(null)

  const play = useCallback((autoplay = true) => {
    const el = root.current
    if (!el) return
    tl.current?.kill()
    setDone(false)
    const say = (t: string) => () => status.current && (status.current.textContent = t)
    const rows = el.querySelectorAll('[data-row]')
    const answers = el.querySelectorAll('[data-answer]')
    // Pending parts stay visible but quiet, so the card never shows an empty block.
    gsap.set(rows, { opacity: 0.35 })
    gsap.set(answers, { opacity: 0, x: 6 })
    gsap.set(el.querySelector('[data-verdict]'), { opacity: 0.18 })
    if (status.current) status.current.textContent = 'Ringing'
    const t = gsap.timeline({ delay: 0.4, paused: !autoplay, onComplete: () => setDone(true) })
    t.call(say('Ringing'))
      .call(say('Connected · code word Mallige played'), [], '+=0.7')
    rows.forEach((row, i) => {
      t.call(say(`Question ${i + 1} of ${rows.length}`), [], '+=0.25')
        .to(row, { opacity: 1, duration: 0.2 }, '<')
        .to(answers[i], { opacity: 1, x: 0, duration: 0.3 }, '+=0.4')
    })
    t.call(say('Assessing with the published rules'), [], '+=0.3')
      .call(say('Call ended · 1 min 12 s'), [], '+=0.55')
      .to('[data-verdict]', { opacity: 1, duration: 0.45 }, '<')
    tl.current = t
  }, [])

  useLayoutEffect(() => {
    if (reducedMotion()) {
      setDone(true)
      if (status.current) status.current.textContent = 'Call ended · 1 min 12 s'
      return
    }
    // Set the call up as pending, and play it the first time the card scrolls into view.
    const ctx = gsap.context(() => play(false), root)
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        tl.current?.play()
        io.disconnect()
      },
      { threshold: 0.4 },
    )
    if (root.current) io.observe(root.current)
    return () => {
      io.disconnect()
      ctx.revert()
    }
  }, [play])

  return (
    <figure
      ref={root}
      className="relative rounded-[8px] border border-line bg-surface text-ink shadow-[0_1px_2px_rgba(27,29,26,0.05),0_24px_48px_-24px_rgba(0,0,0,0.55)]"
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-xs">
        <span className="inline-flex items-center gap-2 text-ink">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {!done && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${done ? 'bg-line-strong' : 'bg-ok'}`} />
          </span>
          <span ref={status} aria-live="polite">Call ended · 1 min 12 s</span>
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
          <li key={r.q} data-row className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-line py-2 text-[0.9375rem]">
            <span className="num text-xs text-muted">{i + 1}</span>
            <span>{r.q}</span>
            <span data-answer className={`text-right ${r.concern ? 'font-semibold text-alert' : ''}`}>
              {r.a}
              {r.via && <span className="ml-1 text-xs text-muted">{r.via}</span>}
            </span>
          </li>
        ))}
      </ol>

      <div data-verdict className="px-5 pb-5 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-[4px] bg-watch-bg px-2 py-1 text-sm font-semibold leading-none text-watch">AMBER · Follow-up</span>
          <span className="num text-xs leading-none text-muted">Rule R6</span>
        </div>
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed">
          No water in the last hour, so the call ended with advice to drink a glass of water now.
        </p>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed">
          <span className="font-semibold">Next:</span> her son is told, and Neralu calls again in 30 minutes. A second
          worrying call sends a person.
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
          <span>Decided by a fixed rule, not by AI</span>
          {done && !reducedMotion() && (
            <button onClick={() => play()} className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Replay
            </button>
          )}
        </div>
      </div>
    </figure>
  )
}

function Statement({ elders }: { elders: ElderListItem[] | null }) {
  const called = elders?.filter((e) => personalThreshold(e.risk_score) <= EXAMPLE_HEAT).length ?? 0
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-x-12 gap-y-10 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="display max-w-4xl text-[2.4rem] font-medium leading-[1.12] sm:text-[3.4rem]">
          <RevealLines stagger={0.35}>
            <span>A broadcast tells.</span>
            <span>A call checks.</span>
            <span className="oled italic text-brand">A person goes.</span>
          </RevealLines>
        </p>
        <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink/80">
          Heat alerts already reach phones across the city. What nobody does is check that Kamala, 74, alone under a
          sheet roof, is actually all right. That is the gap Neralu fills.
        </p>
      </div>
      <figure>
        <div className="relative h-[340px] sm:h-[420px]">
          {elders && elders.length > 0 && (
            <Suspense fallback={null}>
              <WardDiorama elders={elders} heat={EXAMPLE_HEAT} className="h-full w-full" />
            </Suspense>
          )}
        </div>
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>Ward 47 at {EXAMPLE_HEAT}°C: <span className="num font-semibold text-heat">{called}</span> of {elders?.length ?? '—'} homes get a call · height is heat risk</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#e8622e]" />Called, high risk</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#ee9a45]" />Called</span>
          <span className="rounded-[3px] border border-line-strong px-1.5 font-mono text-[0.625rem] uppercase tracking-[0.08em]">demo data</span>
        </figcaption>
      </figure>
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
  return (
    <section id="call" className="scroll-mt-6 border-y border-[#d5e0d8] bg-shade">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Reveal>
              <h2 className="display text-[2.4rem] font-medium leading-[1.05]">
                One unanswered call is enough to send <span className="italic text-brand">someone to the door.</span>
              </h2>
            </Reveal>
            <div className="mt-8">
              <CallReplay />
            </div>
          </div>
          <ol className="relative">
            {steps.map(([title, body], i) => (
              <li key={title} className="relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 pb-9 last:pb-0">
                {i < steps.length - 1 && <span className="absolute left-[1.05rem] top-11 bottom-1 w-px bg-line-strong" aria-hidden="true" />}
                <span className="display text-[2.1rem] font-medium leading-none text-brand">{i + 1}</span>
                <div className="pt-1">
                  <h3 className="text-[1.0625rem] font-semibold">{title}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink/80">{body}</p>
                </div>
              </li>
            ))}
          </ol>
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
}

function Rules() {
  const book = useRuleBook()
  return (
    <section id="rules" className="scroll-mt-6 border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <Reveal>
            <h2 className="display text-[2.4rem] font-medium leading-[1.05]">
              Rules decide. <span className="italic text-brand">AI only listens.</span>
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
      <Reveal>
        <h2 className="display max-w-3xl text-[2.4rem] font-medium leading-[1.05]">
          Escalation goes to people, <span className="italic text-brand">one step at a time.</span>
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
    <section className="border-y border-line bg-brand-tint text-ink">
      <div className="mx-auto grid max-w-6xl items-center gap-x-14 gap-y-12 px-5 py-20 sm:px-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex justify-center lg:justify-start">
          <KeypadPhone />
        </div>
        <div>
          <Reveal>
            <h2 className="display text-[2.4rem] font-medium leading-[1.05]">
              Built for the phones <span className="italic">people actually have.</span>
            </h2>
          </Reveal>
          <dl className="mt-10 grid gap-x-12 gap-y-7 sm:grid-cols-2">
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
      <Reveal>
        <h2 className="display max-w-3xl text-[2.4rem] font-medium leading-[1.05]">
          What you are looking at <span className="italic text-brand">is a working prototype.</span>
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
        </div>
        <a href="#top" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          Back to top
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </footer>
  )
}

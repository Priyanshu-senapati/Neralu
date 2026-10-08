import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mark, Wordmark } from '../components/Brand'
import { gsap, reducedMotion } from '../motion'
import { useRuleBook } from '../rules'

/*
 * The product, explained with the product's own logic. Every number on this page comes from
 * Neralu's rules (backend/app/risk.py, rules.py) or is labelled as an example. No metrics, logos
 * or quotes are invented: there is no deployment yet, and the page says so.
 */

// Risk is personal: computed with risk.py for a 35 °C / 35 % day with a 25 °C night (heat index 35.8 °C).
const HEAT_INDEX = 35.8
const SCALE = { min: 30, max: 41 }
const PEOPLE = [
  {
    name: 'Kamala R., 74',
    factors: ['Age 74 (+20)', 'Lives alone (+20)', 'Sheet roof (+15)', 'Heat-sensitive medicines (+15)'],
    score: 70,
    threshold: 33.0,
  },
  {
    name: 'A 63-year-old living with family',
    factors: ['Age 63 (+10)', 'Concrete roof, working fan'],
    score: 10,
    threshold: 39.0,
  },
]

const RULE_OUTCOME: Record<string, { label: string; cls: string }> = {
  R0: { label: 'Not reached', cls: 'text-ink' },
  R1: { label: 'RED', cls: 'text-alert' },
  R2: { label: 'RED', cls: 'text-alert' },
  R3: { label: 'RED', cls: 'text-alert' },
  R4: { label: 'AMBER', cls: 'text-watch' },
  R5: { label: 'AMBER', cls: 'text-watch' },
  R6: { label: 'AMBER', cls: 'text-watch' },
  R7: { label: 'AMBER', cls: 'text-watch' },
  R8: { label: 'AMBER', cls: 'text-watch' },
  R9: { label: 'GREEN', cls: 'text-ok' },
  S1: { label: 'Support', cls: 'text-support' },
  E1: { label: 'RED', cls: 'text-alert' },
  E3: { label: 'RED', cls: 'text-alert' },
}

export default function Story() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Wordmark />
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <a href="#call" className="hover:underline">The call</a>
          <a href="#rules" className="hover:underline">The rules</a>
          <Link to="/register" className="hover:underline">Register someone</Link>
          <Link to="/ward" className="press rounded-[4px] bg-brand px-3.5 py-2 font-semibold text-brand-ink hover:bg-brand/90">
            Open the ward console
          </Link>
        </nav>
      </header>

      <main>
        <Hero />
        <RiskIsPersonal />
        <TheCall />
        <Rules />
        <WhoGoes />
        <Phones />
        <Honesty />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-muted sm:px-8">
          <span className="inline-flex items-center gap-2">
            <Mark className="h-5 w-5 text-brand" />
            <span>
              <span className="kn" lang="kn">ನೆರಳು</span> (neralu) means shade in Kannada.
            </span>
          </span>
          <span>Hack4SDG prototype · SDG targets 11.5, 3.d and 13.1</span>
        </div>
      </footer>
    </div>
  )
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14 lg:pt-16">
      <div>
        <h1 className="display text-[2.4rem] font-medium leading-[1.05] text-ink sm:text-[3rem] xl:text-[3.55rem]">
          <span className="block lg:whitespace-nowrap">Heat warnings tell a city</span>
          <span className="block">what's coming.</span>
          <span className="mt-1 block italic text-brand lg:whitespace-nowrap">Neralu checks who's safe.</span>
        </h1>
        <p className="mt-7 max-w-[34rem] text-[1.125rem] leading-[1.65] text-ink/80">
          When the heat crosses a person's own threshold, Neralu calls them on whatever phone they have, in their
          language. If an answer is worrying, or nobody picks up, a person nearby is asked to go to the door.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
          <Link to="/ward" className="press inline-flex items-center gap-2 rounded-[5px] bg-brand px-5 py-3 font-semibold text-brand-ink shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_6px_16px_-8px_rgba(31,61,51,0.6)] hover:bg-brand/92">
            Open the ward console
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <a href="#call" className="font-semibold text-ink underline decoration-line-strong decoration-2 underline-offset-[6px] hover:decoration-brand">
            How a call works
          </a>
        </div>
        <p className="mt-10 max-w-[34rem] border-t border-line pt-4 text-sm leading-relaxed text-muted">
          Ward 47 is a demo ward: its residents, weather and most call outcomes are simulated and labelled.
          The rules, the escalation and the live call are real.
        </p>
      </div>
      <CallReplay />
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
  { q: 'What day is it today?', a: '"Friday"', via: 'spoken' },
  { q: 'Okay, or needs help', a: 'Okay' },
]

function CallReplay() {
  const root = useRef<HTMLDivElement>(null)
  const status = useRef<HTMLSpanElement>(null)
  const [done, setDone] = useState(false)
  const tl = useRef<gsap.core.Timeline | null>(null)

  const play = useCallback(() => {
    const el = root.current
    if (!el) return
    tl.current?.kill()
    setDone(false)
    const say = (t: string) => () => status.current && (status.current.textContent = t)
    const rows = el.querySelectorAll('[data-row]')
    const answers = el.querySelectorAll('[data-answer]')
    const t = gsap.timeline({ delay: 0.4, onComplete: () => setDone(true) })
    // Pending parts stay visible but quiet, so the card never shows an empty block.
    t.set(rows, { opacity: 0.35 })
      .set(answers, { opacity: 0, x: 6 })
      .set('[data-verdict]', { opacity: 0.18 })
      .call(say('Ringing'))
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
    const ctx = gsap.context(play, root)
    return () => ctx.revert()
  }, [play])

  return (
    <figure
      ref={root}
      className="relative rounded-[8px] border border-line bg-surface shadow-[0_1px_2px_rgba(27,29,26,0.05),0_24px_48px_-24px_rgba(27,29,26,0.28)]"
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-xs">
        <span className="inline-flex items-center gap-2 text-ink">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {!done && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${done ? 'bg-line-strong' : 'bg-ok'}`} />
          </span>
          <span ref={status} aria-live="polite">Call ended · 1 min 12 s</span>
        </span>
        <span className="rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
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
          <li key={r.q} data-row className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-line py-2 text-[15px]">
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
        <p className="mt-2.5 text-[15px] leading-relaxed">
          No water in the last hour, so the call ended with advice to drink a glass of water now.
        </p>
        <p className="mt-1.5 text-[15px] leading-relaxed">
          <span className="font-semibold">Next:</span> her son is told, and Neralu calls again in 30 minutes. A second
          worrying call sends a person.
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
          <span>Decided by a fixed rule, not by AI</span>
          {done && !reducedMotion() && (
            <button onClick={play} className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Replay
            </button>
          )}
        </div>
      </div>
    </figure>
  )
}

function pos(c: number) {
  return `${((c - SCALE.min) / (SCALE.max - SCALE.min)) * 100}%`
}

function RiskIsPersonal() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <h2 className="display text-[1.9rem] font-medium leading-tight">Heat warnings are city‑wide. Risk is personal.</h2>
          <p className="mt-3 text-ink/85">
            The same afternoon is ordinary for one person and dangerous for another. Neralu gives everyone a threshold
            from things a family already knows: age, living alone, the roof, a fan, medicines that make heat harder.
          </p>
          <p className="mt-3 text-sm text-muted">
            Computed with Neralu's risk rules for a 35°C afternoon at 35% humidity. Thresholds are starting values,
            to be calibrated in a pilot.
          </p>
        </div>
        <div>
          <div className="relative h-14" aria-hidden="true">
            <div className="absolute inset-x-0 top-7 h-px bg-line-strong" />
            {Array.from({ length: SCALE.max - SCALE.min + 1 }, (_, i) => SCALE.min + i).map((t) => (
              <div key={t} className="absolute top-[1.55rem] -translate-x-1/2 text-center" style={{ left: pos(t) }}>
                <div className="mx-auto h-2 w-px bg-line-strong" />
                {t % 2 === 1 && <div className="num mt-1 text-[11px] text-muted">{t}</div>}
              </div>
            ))}
            <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: pos(HEAT_INDEX) }}>
              <div className="num whitespace-nowrap text-xs font-semibold text-heat">Today {HEAT_INDEX}°C</div>
              <div className="mx-auto h-9 w-0.5 bg-heat" />
            </div>
          </div>
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {PEOPLE.map((p) => {
              const called = HEAT_INDEX >= p.threshold
              return (
                <li key={p.name} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-muted">{p.factors.join(' · ')}</div>
                  </div>
                  <div className="sm:text-right">
                    <div className="num text-sm">
                      Score {p.score} · threshold {p.threshold.toFixed(1)}°C
                    </div>
                    <div className={`text-sm font-semibold ${called ? 'text-heat' : 'text-muted'}`}>
                      {called ? `${(HEAT_INDEX - p.threshold).toFixed(1)}°C over: Neralu calls today` : 'Below threshold: no call'}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}

function TheCall() {
  const steps: [string, string][] = [
    ['The heat crosses her threshold', 'The forecast is checked against every registered person. Only those over their own threshold are called, once or twice depending on how far over.'],
    ['Neralu phones her', 'A recorded voice in her language. The call opens with a code word her family chose, and says Neralu never asks for money, OTP, Aadhaar or bank details.'],
    ['Four questions on the keypad', 'Water in the last hour, dizziness or weakness, a very hot room, a working fan. Press 1 for yes, 2 for no. Silence gets one repeat. The call ends with: press 2 if you need help now.'],
    ['One spoken answer', '"What day is it today?" Heat can confuse people who still say they are fine, so the answer is checked, not trusted.'],
    ['Fixed rules decide', 'GREEN, AMBER or RED, from the published rules below. A picked-up call with no answers is never counted as safe.'],
    ['A person responds', 'Her family is told. If the check is RED, or she does not answer twice, someone nearby is asked to go to her door.'],
  ]
  return (
    <section id="call" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 sm:px-8">
      <h2 className="display max-w-2xl text-[1.9rem] font-medium leading-tight">
        One unanswered call is enough to send someone to the door.
      </h2>
      <ol className="mt-8 grid gap-x-12 lg:grid-cols-2">
        {steps.map(([title, body], i) => (
          <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t border-line py-4">
            <span className="num pt-0.5 text-sm text-muted">{i + 1}</span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-ink/85">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Rules() {
  const book = useRuleBook()
  return (
    <section id="rules" className="scroll-mt-6 border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="display text-[1.9rem] font-medium leading-tight">Rules decide. AI only listens.</h2>
          <p className="mt-3 text-ink/85">
            Speech-to-text turns the spoken day into a word. That is all the AI does. Whether someone is safe is
            decided by these rules, in this order, and the first one that matches wins.
          </p>
          <p className="mt-3 text-ink/85">
            "I'm okay" never overrides another warning sign. Anything unclear is followed up, not assumed fine.
          </p>
        </div>
        <div>
          {!book && <p className="text-sm text-muted">Loading the rule book from the Neralu server…</p>}
          {book && (
            <table className="w-full border-y border-line text-sm">
              <caption className="sr-only">Neralu's safety rules</caption>
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-normal">Rule</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Result</th>
                  <th scope="col" className="py-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.entries(book.explain).map(([id, text]) => (
                  <tr key={id} className="align-baseline">
                    <th scope="row" className="num py-2.5 pr-3 font-medium">{id}</th>
                    <td className={`whitespace-nowrap py-2.5 pr-3 font-semibold ${RULE_OUTCOME[id]?.cls ?? ''}`}>
                      {RULE_OUTCOME[id]?.label}
                    </td>
                    <td className="py-2.5">{text}</td>
                  </tr>
                ))}
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
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <h2 className="display max-w-2xl text-[1.9rem] font-medium leading-tight">Escalation goes to people, one step at a time.</h2>
      <ol className="mt-8 grid border-l border-line sm:grid-cols-2 sm:border-l-0 lg:grid-cols-4">
        {tiers.map(([who, what], i) => (
          <li key={who} className="relative border-line py-3 pl-5 sm:border-t sm:pl-0 sm:pr-6 sm:pt-5">
            <span className="absolute -left-[4.5px] top-[1.15rem] h-2 w-2 rounded-full bg-brand sm:-top-[4.5px] sm:left-0" aria-hidden="true" />
            <span className="num text-xs text-muted">Step {i + 1}</span>
            <h3 className="font-semibold">{who}</h3>
            <p className="mt-1 text-sm text-ink/85">{what}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 max-w-3xl border-t border-line pt-4 text-ink/85">
        Neralu never calls an ambulance on its own. Only a person who has seen or heard the emergency records
        "called 108". A volunteer sees someone’s address only after accepting their case.
      </p>
    </section>
  )
}

function Phones() {
  const facts: [string, string][] = [
    ['Any phone', 'A normal voice call to a keypad phone. Nothing to install, no smartphone, no data plan.'],
    ['Their language', 'Kannada, Tamil, Telugu, Urdu or Hindi, chosen by the family. Prompts are recorded human voices, not machine speech; this demo has one prompt set.'],
    ['A reason to pick up', 'Scam calls have taught people not to answer strangers. The family code word is how they know it is Neralu.'],
    ['Registered by family', 'A son or daughter registers a parent from any phone, with the parent’s permission. The address is shown only to the volunteer who accepts a case.'],
  ]
  return (
    <section className="border-y border-line bg-brand text-brand-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <h2 className="display text-[1.9rem] font-medium leading-tight">Built for the phones people actually have.</h2>
        <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {facts.map(([t, d]) => (
            <div key={t}>
              <dt className="font-semibold">{t}</dt>
              <dd className="mt-1 text-brand-ink/80">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Honesty() {
  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2">
      <div>
        <h2 className="display text-[1.9rem] font-medium leading-tight">What is real in this demo</h2>
        <ul className="mt-4 space-y-2 text-ink/85">
          <li>The call to Kamala, on a real phone or, where the network blocks it, on the browser phone. Her keypad answers and her spoken answer.</li>
          <li>The rules that classify the call, and the escalation that follows.</li>
          <li>The volunteer accepting the case on a real phone, and the live ward console.</li>
        </ul>
      </div>
      <div>
        <h2 className="display text-[1.9rem] font-medium leading-tight">What is simulated</h2>
        <ul className="mt-4 space-y-2 text-ink/85">
          <li>The weather, set from the demo controls.</li>
          <li>The clock, which runs 60 times faster so a day fits in minutes.</li>
          <li>The other 400 residents of Ward 47 and their answers, and messages to families.</li>
        </ul>
        <p className="mt-4 text-sm text-muted">
          Neralu has not been deployed yet. There are no user numbers on this page because there are none to show.
        </p>
      </div>
    </section>
  )
}

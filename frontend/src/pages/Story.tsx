import { Link } from 'react-router-dom'
import { Mark, Wordmark } from '../components/Brand'
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
    <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14 lg:pt-14">
      <div>
        <h1 className="text-balance text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[2.9rem]">
          Heat warnings tell a city what's coming. Neralu checks who's safe.
        </h1>
        <p className="mt-5 max-w-[38rem] text-lg leading-relaxed text-ink/85">
          When the heat crosses a person's own risk threshold, Neralu phones them on whatever phone they have,
          in their language. Four safety questions on the keypad, one spoken answer, and a key for "I need help".
          If something is wrong, or nobody picks up, a person nearby is asked to go to the door.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link to="/ward" className="press rounded-[4px] bg-brand px-4 py-2.5 font-semibold text-brand-ink hover:bg-brand/90">
            Open the ward console
          </Link>
          <a href="#call" className="font-semibold underline decoration-line-strong hover:decoration-ink">
            See what happens on a call
          </a>
        </div>
        <p className="mt-6 max-w-[38rem] text-sm text-muted">
          Ward 47 is a demo ward. Its residents, weather and most call outcomes are simulated and labelled as such.
          The rules, the escalation and the live call are real.
        </p>
      </div>
      <ExampleCall />
    </section>
  )
}

/** One call as the ward officer sees it. An example, and it follows the real rules (R6). */
function ExampleCall() {
  const rows: [string, string, boolean?][] = [
    ['Water in the last hour', 'No', true],
    ['Dizzy, weak or confused', 'No'],
    ['Room very hot', 'Yes'],
    ['Fan or cooler working', 'Yes'],
    ['Knew what day it is', 'Yes (spoken)'],
    ['Okay, or needs help', 'Okay'],
  ]
  return (
    <figure className="self-start border border-line-strong bg-surface">
      <figcaption className="flex items-baseline justify-between border-b border-line px-4 py-2.5 text-xs text-muted">
        <span>Example welfare check</span>
        <span className="rounded-[3px] border border-line px-1 font-mono uppercase tracking-wide">demo data</span>
      </figcaption>
      <div className="px-4 pt-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold">Kamala R.</span>
          <span className="num text-sm text-muted">11:02 · attempt 1</span>
        </div>
        <p className="text-sm text-muted">74 · lives alone · sheet roof · Kannada</p>
        <p className="mt-2 text-sm">
          Call opens with her family's code word <span className="font-semibold">Mallige</span>.
        </p>
      </div>
      <dl className="mx-4 mt-3 divide-y divide-line border-y border-line text-sm">
        {rows.map(([q, a, concern]) => (
          <div key={q} className="flex justify-between gap-4 py-1.5">
            <dt>{q}</dt>
            <dd className={concern ? 'font-semibold text-alert' : ''}>{a}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1.5 px-4 py-3.5 text-sm">
        <p>
          <span className="rounded-[3px] bg-watch-bg px-1.5 py-0.5 font-semibold text-watch">AMBER · Follow-up</span>{' '}
          <span className="num text-xs text-muted">Rule R6</span>
        </p>
        <p>No water in the last hour. The call ends with advice to drink a glass of water now.</p>
        <p>
          <span className="font-semibold">Next:</span> her son is informed and Neralu calls again in 30 minutes. A second
          concerning call sends a person.
        </p>
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
          <h2 className="text-2xl font-semibold tracking-[-0.01em]">Heat warnings are city-wide. Risk is personal.</h2>
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
      <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.01em]">
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
          <h2 className="text-2xl font-semibold tracking-[-0.01em]">Rules decide. AI only listens.</h2>
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
      <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.01em]">Escalation goes to people, one step at a time.</h2>
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
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">Built for the phones people actually have.</h2>
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
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">What is real in this demo</h2>
        <ul className="mt-4 space-y-2 text-ink/85">
          <li>The call to Kamala, on a real phone or, where the network blocks it, on the browser phone. Her keypad answers and her spoken answer.</li>
          <li>The rules that classify the call, and the escalation that follows.</li>
          <li>The volunteer accepting the case on a real phone, and the live ward console.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">What is simulated</h2>
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

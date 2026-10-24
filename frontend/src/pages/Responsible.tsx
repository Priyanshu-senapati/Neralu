import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Brand'

/*
 * Responsible by design: what Neralu stores, who sees what, consent, the DPDP Act, accessibility, and
 * the known risks with what we do about each. Every claim here describes something the code does;
 * what is not built yet is said plainly.
 */

const STORE: [string, string][] = [
  ['From the family, at registration', 'Name, age, phone, language, address, whether they live alone, roof type, fan, heat-sensitive medicines, hearing or memory difficulty, a family contact, an optional neighbour, and a code word the household chose.'],
  ['From each call', 'The keypad answers, the call times and status, and the decision with the rule that made it.'],
  ['From a spoken answer', 'Only the weekday it named, for example "Thursday". Never the words. If a recording was made it is deleted 7 days after the call.'],
  ['From each visit', 'Who accepted, when, and what they recorded at the door.'],
  ['Not stored', 'No Aadhaar, no bank details, no location tracking, no contacts list. No medical records or diagnoses: the only health details are yes / no answers (heat-sensitive medicines, hearing or memory difficulty), which are sensitive and treated that way.'],
]

const WHO: [string, string][] = [
  ['Ward officer (console)', 'Every registered person, their risk factors, call answers, decisions and cases. The address only once a volunteer has accepted a visit.'],
  ['Volunteer or ASHA worker', 'Why someone needs a visit and roughly how far away they are. Address and phone appear only after they accept that one case.'],
  ['Family', 'A private link with that one person\'s status today. Nothing about anyone else, and no address, code word or volunteer\'s name. They can replace the link or turn it off.'],
  ['Nobody', 'The erasure code and the family link\'s secret: each is shown once to the family and kept only in a scrambled form (a hash).'],
]

const DPDP: [string, string][] = [
  ['Consent and notice', 'Registration says what is stored and why, and cannot finish without the person\'s permission being confirmed.'],
  ['Purpose limitation', 'The data is used for one thing: checking on that person during heat.'],
  ['Data minimisation', 'Only what the check needs (see above). The spoken day is reduced to one word; recordings are not kept beyond 7 days.'],
  ['Right to erasure', 'The family can delete the person and everything recorded about them at any time with their erasure code, from the confirmation screen or the status link.'],
  ['Security', 'Random, unguessable family links and erasure codes, both stored only as hashes; the link\'s secret is kept out of server logs; addresses hidden until needed.'],
]

const ACCESS: string[] = [
  'Works on any phone, including basic keypad phones. No app, no smartphone, no internet needed by the person called.',
  'Answers are single key presses. No reading, no typing.',
  'Kannada, Hindi and English, chosen at the start of every call (1, 2 or 3), in a slowed-down voice for older listeners.',
  'A question with no answer is asked again before moving on.',
  'People with memory difficulty are checked through their caregiver rather than asked questions they cannot fairly answer.',
  'The console has a light mode for weak projectors, and is built with labels, keyboard focus and spoken status updates for screen readers.',
]

const RISKS: { risk: string; mitigation: string; residual?: string }[] = [
  {
    risk: 'False reassurance: someone says they are fine when they are not',
    mitigation: '"I\'m okay" never overrides another warning sign. The day question catches confusion. Anything unclear is followed up, never assumed fine. A call picked up with no answers counts as not reached. After a visit, Neralu calls again an hour later.',
    residual: 'A phone check cannot see the person. Thresholds are starting values to calibrate in a pilot.',
  },
  {
    risk: 'Digital exclusion: the people most at risk are least connected',
    mitigation: 'A plain phone call on any phone. Families, ASHA workers or resident associations can register someone. Caregiver calls for people with memory difficulty.',
    residual: 'People with no phone at all, and no one to register them, are not reached. ASHA and resident lists are the way to find them.',
  },
  {
    risk: 'Scam impersonation: a fake "welfare call" asking for money',
    mitigation: 'Every call opens with the code word the household chose. Neralu never asks for money, OTP, Aadhaar or bank details, and every message says so.',
    residual: 'A code word can leak. Families should pick one only the household knows.',
  },
  {
    risk: 'Volunteer safety and burden',
    mitigation: 'Volunteers choose to accept, can say "Can\'t go" at any time, and go on or off duty. The case moves to the next person, so no one is pressured. Guidance at the door: call 108 first in an emergency. The what-if planner shows a shortfall before the day, not during it.',
    residual: 'No check-in for the volunteer\'s own safety during a visit yet.',
  },
  {
    risk: 'A missed emergency, or the system failing',
    mitigation: 'Every case has a timer: neighbour, then volunteer, then ASHA worker, then the ward officer. A case is never left with nobody asked. The console shows a live check that calls, the scheduler and the public link are working. Neralu never replaces 108: a person decides to call it.',
  },
  {
    risk: 'An AI making life-or-death calls',
    mitigation: 'No AI decides anything. A published table of fixed rules does, and it has automated tests. Speech recognition only turns a spoken day into a word, and an unclear result is treated as a warning sign.',
  },
]

export default function Responsible() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/" aria-label="Neralu home"><Wordmark /></Link>
          <nav aria-label="Main" className="flex gap-5 text-sm text-muted">
            <Link to="/" className="hover:text-ink hover:underline">About</Link>
            <Link to="/ward" className="hover:text-ink hover:underline">Ward console</Link>
            <Link to="/register" className="hover:text-ink hover:underline">Register someone</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <h1 className="display text-[2.2rem] font-medium leading-tight">Responsible by design</h1>
        <p className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-ink/80">
          Neralu calls older people who live alone during a heatwave and sends a person when something is wrong. That
          means holding sensitive information about vulnerable people. This page says what we keep, who sees it, and
          what can go wrong.
        </p>

        <Section title="What Neralu stores">
          <Pairs rows={STORE} />
        </Section>

        <Section title="Who sees what">
          <Pairs rows={WHO} />
        </Section>

        <Section title="India's Digital Personal Data Protection Act, 2023">
          <p className="mb-3 text-sm text-muted">
            How the design lines up with the Act's main duties. This is our reading as a student team, not a legal
            review; a pilot would need one.
          </p>
          <Pairs rows={DPDP} />
          <p className="mt-3 text-sm text-muted">
            Not built yet: the person themselves confirming on their first call that they want these calls, and a
            written retention period for call records beyond recordings.
          </p>
        </Section>

        <Section title="Accessibility">
          <ul className="list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed">
            {ACCESS.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </Section>

        <Section title="Known risks and what we do about them">
          <div className="space-y-4">
            {RISKS.map((r) => (
              <article key={r.risk} className="rounded-ui border border-line bg-surface px-4 py-3">
                <h3 className="font-semibold">{r.risk}</h3>
                <p className="mt-1 text-[0.9375rem] leading-relaxed">{r.mitigation}</p>
                {r.residual && <p className="mt-1.5 text-sm text-muted">Still a risk: {r.residual}</p>}
              </article>
            ))}
          </div>
        </Section>

        <Section title="In this demo">
          <p className="text-[0.9375rem] leading-relaxed">
            Ward 47 and its ~400 residents are fictional, and their answers are simulated; the weather presets, the
            faster clock and family messages are simulated too. Each is labelled where it appears. The call to the
            demo phone, its answers, the rules, the escalation and the volunteer's phone are real.
          </p>
        </Section>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="mb-4 text-[1.35rem] font-medium">{title}</h2>
      {children}
    </section>
  )
}

function Pairs({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
          <dt className="font-semibold">{k}</dt>
          <dd className="text-[0.9375rem] leading-relaxed text-ink/85">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

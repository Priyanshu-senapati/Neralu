import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Wordmark } from '../components/Brand'
import { AnswerTable } from '../components/AnswerTable'
import { CALL_STATUS, LANG } from '../components/CaseDrawer'
import { RuleExplanation } from '../components/RuleExplanation'
import { SimTag } from '../components/StatusPill'
import { TIER_LABEL } from '../status'
import { fmtTime } from '../time'
import type { CaseRecord as Record_, CheckInOut } from '../types'

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
})

/*
 * The case record for the ward office: one page to print or save as PDF. Everything on it comes
 * from what Neralu logged. Like the console, it never shows a phone number, and shows the address
 * only once someone accepted the visit.
 */
export default function CaseRecord() {
  const { id } = useParams()
  const [r, setR] = useState<Record_ | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A record is a paper document: light on screen and in print, whatever the console theme.
  // Not remembered, and put back when leaving, so the console keeps its own choice.
  useEffect(() => {
    const root = document.documentElement
    const was = root.dataset.theme
    root.dataset.theme = 'light'
    return () => {
      if (was) root.dataset.theme = was
      else delete root.dataset.theme
    }
  }, [])

  useEffect(() => {
    api.caseRecord(Number(id))
      .then((x) => {
        setR(x)
        document.title = `Neralu case ${x.case_id} · ${x.person.name}`
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404
        ? 'No case with this number in the current run.'
        : 'Could not load the case record. Check the server and reload.'))
    return () => {
      document.title = 'Neralu'
    }
  }, [id])

  return (
    <div className="min-h-dvh bg-paper text-ink print:bg-white">
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8 print:max-w-none print:p-0">
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/ward" className="text-sm text-muted underline underline-offset-2 hover:text-ink">Back to the ward console</Link>
          {r && (
            <button type="button" onClick={() => window.print()} className="press min-h-11 rounded-full bg-ink px-5 font-semibold text-paper">
              Print or save as PDF
            </button>
          )}
        </div>
        {error && <p role="alert" className="rounded-ui bg-alert-bg px-3 py-2 text-sm text-alert">{error}</p>}
        {!r && !error && <div className="h-60 animate-pulse rounded-ui bg-line" />}
        {r && <Body r={r} />}
      </div>
    </div>
  )
}

function Body({ r }: { r: Record_ }) {
  const p = r.person
  const first = p.name.split(' ')[0]
  const red = r.level === 'red'
  const status = r.closure ? `Closed · ${r.closure.label}` : r.acceptance ? 'Accepted · visit under way' : r.overdue ? 'Open · ward officer action needed' : `Open · waiting for a ${TIER_LABEL[r.tier].toLowerCase()}`
  return (
    <article>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-3">
        <div>
          <Wordmark size="sm" />
          <h1 className="mt-2 text-[1.6rem] font-semibold leading-tight">Case record · {p.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Case <span className="num">#{r.case_id}</span> · Ward 47 (demo ward) · {red ? 'RED: needs a person now' : 'Needs support'}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-sm">
          <dt className="text-muted">Status</dt>
          <dd className="font-semibold">{status}</dd>
          <dt className="text-muted">Opened</dt>
          <dd className="num">{fmtTime(r.trigger.opened_scenario)}</dd>
          <dt className="text-muted">Printed</dt>
          <dd className="num">{dateTime.format(new Date(r.generated_scenario))}</dd>
        </dl>
      </header>

      {(p.is_simulated || p.source === 'demo' || r.demo_clock) && (
        <p className="mt-3 rounded-ui border border-line-strong px-3 py-2 text-sm">
          Demo record.{' '}
          {p.is_simulated ? 'This resident and their answers are simulated. ' : ''}
          {p.source === 'demo' ? `${first}'s details were written for the demo; the call went to a real phone. ` : ''}
          {r.demo_clock ? 'Times are on the demo clock, which runs faster than real time.' : ''}
        </p>
      )}

      <Section n={1} title="Person">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-muted">Name, age</dt>
          <dd>{p.name}, <span className="num">{p.age}</span></dd>
          <dt className="text-muted">Language</dt>
          <dd>{LANG[p.language] ?? p.language}</dd>
          <dt className="text-muted">Living situation</dt>
          <dd>{p.lives_alone ? 'Lives alone' : 'Lives with others'}{p.caregiver_route ? ' · checked through their caregiver' : ''}</dd>
          <dt className="text-muted">Family contact</dt>
          <dd>{p.family_name ?? 'Not named'}</dd>
          <dt className="text-muted">Address</dt>
          <dd>{p.address ?? 'Not shown: only once a volunteer accepts a visit'}</dd>
          <dt className="text-muted">Details from</dt>
          <dd>{p.source_label}</dd>
        </dl>
        <table className="mt-3 w-full text-sm">
          <caption className="mb-1 text-left text-xs text-muted">Heat risk factors (each from: {p.source_label.split(':')[0].toLowerCase()})</caption>
          <tbody className="divide-y divide-line border-y border-line">
            {p.risk_breakdown.map(([label, pts]) => (
              <tr key={label}><td className="py-1">{label}</td><td className="num py-1 text-right">+{pts}</td></tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1">Vulnerability score</td>
              <td className="num py-1 text-right">{Math.min(100, p.risk_breakdown.reduce((a, [, n]) => a + n, 0))}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-sm">
          Personal threshold <span className="num">{p.threshold_c.toFixed(1)} °C</span> · heat index today{' '}
          <span className="num">{p.heat_index_c.toFixed(1)} °C</span>
          {p.weather_source && <span className="text-muted"> ({p.weather_source})</span>}
        </p>
      </Section>

      <Section n={2} title="What opened the case">
        <p className="mb-2 text-sm">
          Opened at <span className="num">{fmtTime(r.trigger.opened_scenario)}</span>
          {r.trigger.checkin_id ? `, from the answers on the call marked below.` : '.'}
        </p>
        <RuleExplanation ruleId={r.trigger.rule_id} reason={r.trigger.reason} note={false} />
        <p className="mt-2 text-xs text-muted">{r.trigger.decided_by}</p>
      </Section>

      <Section n={3} title="Calls and answers">
        {r.calls.length === 0 ? (
          <p className="text-sm text-muted">No calls recorded.</p>
        ) : (
          <ol className="space-y-4">
            {r.calls.map((c) => <Call key={c.id} c={c} trigger={c.id === r.trigger.checkin_id} />)}
          </ol>
        )}
      </Section>

      <Section n={4} title="Escalation">
        <Timeline items={r.escalation.map((e) => ({ id: e.id, time: e.ts_scenario, text: e.message, sim: e.simulated }))} empty="No escalation steps recorded." />
      </Section>

      <Section n={5} title="Acceptance">
        {r.acceptance ? (
          <p className="text-sm">
            {r.acceptance.name} ({r.acceptance.role.toLowerCase()}) accepted at{' '}
            <span className="num">{fmtTime(r.acceptance.accepted_scenario)}</span>
            {r.acceptance.is_simulated && <> <SimTag /></>}
          </p>
        ) : (
          <p className="text-sm text-muted">Nobody has accepted yet.</p>
        )}
      </Section>

      <Section n={6} title="Closure">
        {r.closure ? (
          <p className="text-sm">
            <span className="font-semibold">{r.closure.label}</span> at <span className="num">{fmtTime(r.closure.resolved_scenario)}</span>
            {r.closure.note && <> · note from the visit: "{r.closure.note}"</>}
          </p>
        ) : (
          <p className="text-sm text-muted">Still open at the time of printing.</p>
        )}
      </Section>

      <Section n={7} title="Who was told what">
        <Timeline
          items={r.family_told.map((e) => ({
            id: e.id,
            time: e.ts_scenario,
            text: `To the ${e.data.recipient === 'neighbour' ? 'neighbour' : `family${p.family_name ? ` (${p.family_name})` : ''}`}: "${String(e.data.text ?? e.message)}" · ${e.data.channel === 'sms' ? 'sent by SMS' : 'simulated, not sent'}`,
            sim: false,
          }))}
          empty="No message to the family or a neighbour recorded."
        />
      </Section>

      <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
        Every decision above was made by a fixed, published rule, not by AI. Neralu never calls 108 itself; a person
        decides that. This record leaves out phone numbers. Case #{r.case_id} · run {r.run_id}.
      </footer>
    </article>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="mb-2 border-b border-line pb-1 text-base font-semibold">
        <span className="num mr-2 text-muted">{n}</span>{title}
      </h2>
      {children}
    </section>
  )
}

function Call({ c, trigger }: { c: CheckInOut; trigger: boolean }) {
  const answered = Object.keys(c.answers).length > 0
  return (
    <li className={`break-inside-avoid ${trigger ? 'border-l-4 border-alert pl-3' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">
          <span className="num">{fmtTime(c.at_scenario)}</span> · round {c.round_no} ·{' '}
          {c.requested ? 'callback after a missed call' : c.is_recall ? 'follow-up call' : `attempt ${c.attempt}`}
          {c.callee === 'caregiver' && ' · to the caregiver'}
          {c.is_simulated && <> <SimTag /></>}
        </span>
        <span>
          {c.call_status ? CALL_STATUS[c.call_status] ?? c.call_status : 'Scheduled'}
          {c.outcome && <> · <span className="font-semibold">{c.outcome}</span> <span className="font-mono">{c.rule_id}</span></>}
        </span>
      </div>
      {trigger && <p className="text-xs font-semibold text-alert">This call opened the case</p>}
      {c.reason && c.outcome && c.outcome !== 'GREEN' && <p className="text-sm text-muted">{c.reason}</p>}
      {answered && <div className="mt-1"><AnswerTable c={c} /></div>}
      {c.transcript && <p className="mt-1 text-xs text-muted">Day heard: {c.transcript}</p>}
    </li>
  )
}

function Timeline({ items, empty }: { items: { id: number; time: string; text: string; sim: boolean }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ol className="divide-y divide-line border-y border-line text-sm">
      {items.map((x) => (
        <li key={x.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 py-1">
          <span className="num text-muted">{fmtTime(x.time)}</span>
          <span>{x.text}{x.sim && <> <SimTag /></>}</span>
        </li>
      ))}
    </ol>
  )
}

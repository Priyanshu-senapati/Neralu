import { useLayoutEffect, useRef, useState } from 'react'
import { FLASH, Flip, gsap, reducedMotion } from '../motion'
import { elderStatus, TIER_LABEL, whyLine } from '../status'
import type { ElderListItem } from '../types'
import { SimTag, StatusPill } from './StatusPill'
import { WaitingTimer } from './WaitingTimer'

function since(e: ElderListItem): string | null {
  if (e.open_case) return e.open_case.opened_scenario
  if (e.last_resolution) return e.last_resolution.resolved_scenario
  if (e.current_call?.started && !e.is_simulated) return e.current_call.scheduled_scenario
  return e.latest.at_scenario ?? e.current_call?.scheduled_scenario ?? null
}

export function attentionRows(elders: ElderListItem[]) {
  return elders
    .map((e) => ({ e, s: elderStatus(e) }))
    .filter((r) => r.s.group !== null)
    .sort((a, b) => {
      if (a.s.group !== b.s.group) return (a.s.group ?? 9) - (b.s.group ?? 9)
      if (a.e.is_simulated !== b.e.is_simulated) return a.e.is_simulated ? 1 : -1
      return (since(a.e) ?? '').localeCompare(since(b.e) ?? '') // longest waiting first
    })
}

type TabKey = 'all' | 'person' | 'follow' | 'calls'
// Groups come from status.ts: 0 overdue RED, 1 RED, 2 follow-up, 3 support, 3.5 RED accepted,
// 4 calling or not reached, 5 closed by a person.
const TABS: { key: TabKey; label: string; match: (g: number | null) => boolean }[] = [
  { key: 'all', label: 'All', match: (g) => g !== null },
  { key: 'person', label: 'Need a person', match: (g) => g === 0 || g === 1 || g === 3 || g === 3.5 },
  { key: 'follow', label: 'Follow-up', match: (g) => g === 2 },
  { key: 'calls', label: 'Calls', match: (g) => g === 4 || g === 5 },
]
const EMPTY: Record<TabKey, string> = {
  all: 'No one needs attention right now',
  person: 'No open cases. Nobody is waiting for a person.',
  follow: 'No follow-up calls pending',
  calls: 'No calls in progress or unanswered',
}

interface Props {
  elders: ElderListItem[]
  now: Date | null
  selectedId: number | null
  onSelect: (id: number) => void
  loading: boolean
}

export function AttentionList({ elders, now, selectedId, onSelect, loading }: Props) {
  const rows = attentionRows(elders)
  const [tab, setTab] = useState<TabKey>('all')
  const visible = rows.filter((r) => TABS.find((t) => t.key === tab)!.match(r.s.group))
  const listRef = useRef<HTMLUListElement>(null)
  const committedGroup = useRef<Map<number, number | null> | null>(null)
  const before = useRef<{ ids: number[]; state: Flip.FlipState } | null>(null)
  const prevTone = useRef<Map<number, string> | null>(null)

  // Only a real resident whose status changed travels (Kamala going from "Calling" to RED).
  // Simulated rows update instantly: during a round they change every refresh, and a list that
  // is always moving explains nothing.
  const movers = committedGroup.current
    ? rows.filter((r) => !r.e.is_simulated && committedGroup.current!.has(r.e.id) &&
        committedGroup.current!.get(r.e.id) !== r.s.group).map((r) => r.e.id)
    : []
  if (movers.length && listRef.current && !before.current) {
    // Measure where they are right before React moves them.
    const els = movers.map((id) => listRef.current!.querySelector(`[data-flip-id="${id}"]`)).filter(Boolean) as Element[]
    if (els.length) before.current = { ids: movers, state: Flip.getState(els, { simple: true }) }
  }

  useLayoutEffect(() => {
    const list = listRef.current
    const animate = !reducedMotion()
    const pending = before.current
    before.current = null
    if (list && pending && animate) {
      const targets = pending.ids.map((id) => list.querySelector(`[data-flip-id="${id}"]`)).filter(Boolean) as Element[]
      Flip.killFlipsOf(targets)
      Flip.from(pending.state, { targets, duration: 0.7, simple: true, zIndex: 2 })
    }
    committedGroup.current = new Map(rows.map((r) => [r.e.id, r.s.group]))

    // A row that has just turned RED gets one soft flash: the moment a judge should look at.
    const tones = new Map(elders.map((e) => [e.id, elderStatus(e).tone as string]))
    if (list && animate && prevTone.current) {
      for (const [id, tone] of tones) {
        const was = prevTone.current.get(id)
        if (tone !== 'alert' || was === undefined || was === 'alert') continue
        const el = list.querySelector(`[data-flip-id="${id}"] > button`)
        if (el) gsap.fromTo(el, { backgroundColor: FLASH.alert }, { backgroundColor: 'rgba(251,233,229,0)', duration: 1.6, delay: 0.2, clearProps: 'backgroundColor' })
      }
    }
    prevTone.current = tones
  })

  return (
    <section aria-label="Residents needing attention" className="flex min-h-0 flex-1 flex-col bg-surface">
      <div role="tablist" aria-label="Filter residents" className="flex gap-4 border-b border-line px-4">
        {TABS.map((t) => {
          const count = rows.filter((r) => t.match(r.s.group)).length
          const on = tab === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 py-2 text-sm transition-colors ${on ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {t.label} <span className={`num text-xs ${t.key === 'person' && count ? 'text-alert' : 'text-muted'}`}>{count}</span>
            </button>
          )
        })}
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {loading && rows.length === 0 && <Skeleton />}
        {!loading && visible.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted">{EMPTY[tab]}</li>
        )}
        {visible.map(({ e, s }) => {
          const c = e.open_case
          const unaccepted = c && c.state === 'open'
          return (
            <li key={e.id} data-flip-id={e.id} className="relative bg-surface">
              <button
                onClick={() => onSelect(e.id)}
                aria-current={selectedId === e.id ? 'true' : undefined}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line px-4 py-2 text-left hover:bg-paper ${selectedId === e.id ? 'bg-paper' : ''}`}
              >
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-semibold">{e.name}</span>
                    <span className="num text-xs text-muted">{e.age}</span>
                    {e.is_simulated && <SimTag />}
                  </span>
                  <span className="block truncate text-xs text-muted">{whyLine(e)}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <StatusPill tone={s.tone} label={s.label} />
                  <span className="text-right text-xs text-muted">
                    {c ? (
                      unaccepted ? (
                        c.overdue ? (
                          <span className="font-semibold text-alert">Officer action needed</span>
                        ) : (
                          <>{TIER_LABEL[c.tier]} · not accepted <WaitingTimer since={c.tier_started_scenario} now={now} /></>
                        )
                      ) : (
                        <>{TIER_LABEL[c.tier]} accepted</>
                      )
                    ) : (
                      <WaitingTimer since={since(e)} now={now} />
                    )}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Skeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="border-b border-line px-4 py-3">
          <div className="h-3 w-1/3 animate-pulse rounded-ui bg-line" />
          <div className="mt-2 h-2.5 w-2/3 animate-pulse rounded-ui bg-line/70" />
        </li>
      ))}
    </>
  )
}

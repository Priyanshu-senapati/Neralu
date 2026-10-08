import { elderStatus, TIER_LABEL, whyLine } from '../status'
import type { ElderListItem } from '../types'
import { SimTag, StatusPill } from './StatusPill'
import { WaitingTimer } from './WaitingTimer'

function since(e: ElderListItem): string | null {
  if (e.open_case) return e.open_case.opened_scenario
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

interface Props {
  elders: ElderListItem[]
  now: Date | null
  selectedId: number | null
  onSelect: (id: number) => void
  loading: boolean
}

export function AttentionList({ elders, now, selectedId, onSelect, loading }: Props) {
  const rows = attentionRows(elders)
  return (
    <section className="flex min-h-0 flex-col rounded-ui border border-line bg-surface">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-2">
        <h2 className="text-sm font-semibold">Needs attention</h2>
        <span className="font-mono text-xs text-muted tabular-nums">{rows.length}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_5.5rem_8rem] gap-x-3 border-b border-line px-4 py-1.5 text-[11px] text-muted">
        <span>Resident</span>
        <span>Status</span>
        <span className="text-right">Waiting</span>
        <span>Tier</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {loading && rows.length === 0 && <Skeleton />}
        {!loading && rows.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted">No one needs attention right now</li>
        )}
        {rows.map(({ e, s }) => {
          const c = e.open_case
          const unaccepted = c && c.state === 'open'
          return (
            <li key={e.id}>
              <button
                onClick={() => onSelect(e.id)}
                className={`grid w-full grid-cols-[1fr_auto_5.5rem_8rem] items-center gap-x-3 border-b border-line px-4 py-2 text-left hover:bg-paper ${selectedId === e.id ? 'bg-paper' : ''}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{e.name}</span>
                    <span className="font-mono text-xs text-muted">{e.age}</span>
                    {e.is_simulated && <SimTag />}
                  </span>
                  <span className="block truncate text-xs text-muted">{whyLine(e)}</span>
                </span>
                <StatusPill tone={s.tone} label={s.label} />
                <WaitingTimer since={since(e)} now={now} className="text-right text-sm" />
                <span className="text-xs leading-tight">
                  {c ? (
                    <>
                      <span className="block">{TIER_LABEL[c.tier]}</span>
                      {unaccepted && (
                        <span className={`block ${c.overdue ? 'text-alert' : 'text-muted'}`}>
                          {c.overdue ? 'Ward officer action needed' : <>not accepted · <WaitingTimer since={c.tier_started_scenario} now={now} /></>}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
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

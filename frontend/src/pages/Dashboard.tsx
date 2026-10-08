import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { AttentionList } from '../components/AttentionList'
import { CaseDrawer } from '../components/CaseDrawer'
import { ActivityFeed } from '../components/ActivityFeed'
import { LiveCall } from '../components/LiveCall'
import { SituationBar } from '../components/SituationBar'
import { DemoControls } from '../components/DemoControls'
import { TopBar } from '../components/TopBar'
import { WardMap } from '../components/WardMap'
import { useScenarioNow } from '../time'
import type { ElderListItem, NeraluEvent, Summary } from '../types'
import { useEventStream } from '../useEventStream'

const REFETCH_GAP_MS = 700

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [elders, setElders] = useState<ElderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [drawerKey, setDrawerKey] = useState(0)
  const [events, setEvents] = useState<NeraluEvent[]>([])
  const timer = useRef<number | undefined>(undefined)
  const lastFetch = useRef(0)
  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selected

  const fetchAll = useCallback(async () => {
    lastFetch.current = Date.now()
    try {
      const [s, e, ev] = await Promise.all([api.summary(), api.elders(), api.events(40)])
      setSummary(s)
      setElders(e)
      setEvents(ev)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  /** Coalesce bursts of events (hundreds of simulated calls) into at most one refetch per gap. */
  const scheduleFetch = useCallback(() => {
    if (timer.current !== undefined) return
    const wait = Math.max(0, REFETCH_GAP_MS - (Date.now() - lastFetch.current))
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      fetchAll()
      setDrawerKey((k) => k + 1)
    }, wait)
  }, [fetchAll])

  const onEvent = useCallback(
    (ev: NeraluEvent) => {
      if (ev.kind === 'run_reset') setSelected(null)
      scheduleFetch()
    },
    [scheduleFetch],
  )

  const stream = useEventStream(onEvent, scheduleFetch)
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const now = useScenarioNow(summary?.scenario_now, summary?.demo_speed ?? 1)
  const closeDrawer = useCallback(() => setSelected(null), [])

  if (!summary) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted">
        {error ? 'Cannot reach the Neralu backend · retrying' : 'Loading ward…'}
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <TopBar summary={summary} now={now} stream={stream} />
      {stream !== 'live' && (
        <div role="status" className="bg-watch-bg px-5 py-1 text-xs text-watch">
          Live updates interrupted. Reconnecting; the ward refreshes when the connection is back.
        </div>
      )}
      <SituationBar summary={summary} elders={elders} />
      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)_minmax(0,11.5rem)]">
        {/* Urgent column first in the DOM: on a phone it is what the officer needs before the map. */}
        <div className="flex min-h-0 flex-col border-line lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l">
          <LiveCall elders={elders} refreshKey={drawerKey} onOpen={setSelected} />
          <AttentionList elders={elders} now={now} selectedId={selected} onSelect={setSelected} loading={loading} />
        </div>
        <div className="flex h-[55vh] min-h-0 flex-col border-t border-line lg:col-start-1 lg:row-start-1 lg:h-auto lg:border-t-0">
          <WardMap elders={elders} selectedId={selected} onSelect={setSelected} />
        </div>
        <div className="flex h-72 min-h-0 flex-col lg:col-start-1 lg:row-start-2 lg:h-auto">
          <ActivityFeed events={events} onSelect={setSelected} />
        </div>
      </main>
      {selected !== null && <CaseDrawer elderId={selected} refreshKey={drawerKey} now={now} onClose={closeDrawer} />}
      <DemoControls onChanged={scheduleFetch} />
    </div>
  )
}

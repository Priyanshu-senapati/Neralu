import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { AttentionList } from '../components/AttentionList'
import { CaseDrawer } from '../components/CaseDrawer'
import { CountCards } from '../components/CountCards'
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
  const timer = useRef<number | undefined>(undefined)
  const lastFetch = useRef(0)
  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selected

  const fetchAll = useCallback(async () => {
    lastFetch.current = Date.now()
    try {
      const [s, e] = await Promise.all([api.summary(), api.elders()])
      setSummary(s)
      setElders(e)
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
      <div className="flex h-screen items-center justify-center text-sm text-muted">
        {error ? 'Cannot reach the Neralu backend · retrying' : 'Loading ward…'}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar summary={summary} now={now} stream={stream} />
      {stream !== 'live' && (
        <div className="bg-watch-bg px-5 py-1 text-xs text-watch">Live updates interrupted · reconnecting, data refreshes when back</div>
      )}
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <CountCards counts={summary.counts} />
        <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-3">
          <AttentionList elders={elders} now={now} selectedId={selected} onSelect={setSelected} loading={loading} />
          <WardMap elders={elders} selectedId={selected} onSelect={setSelected} />
        </div>
      </main>
      {selected !== null && <CaseDrawer elderId={selected} refreshKey={drawerKey} now={now} onClose={closeDrawer} />}
      <DemoControls onChanged={scheduleFetch} />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { NeraluEvent } from './types'

export type StreamStatus = 'connecting' | 'live' | 'reconnecting'

/**
 * Subscribes to /api/stream. Calls onEvent for each event and onReconnect after every
 * (re)connection so callers can refetch state they may have missed while offline.
 */
export function useEventStream(
  onEvent: (e: NeraluEvent) => void,
  onReconnect: () => void,
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const handlers = useRef({ onEvent, onReconnect })
  handlers.current = { onEvent, onReconnect }

  useEffect(() => {
    let source: EventSource | null = null
    let retry: number | undefined
    let closed = false
    let delay = 1000
    let lastSeen = Date.now()

    const reconnect = () => {
      source?.close()
      if (closed) return
      setStatus('reconnecting')
      window.clearTimeout(retry)
      retry = window.setTimeout(connect, delay)
      delay = Math.min(delay * 2, 8000)
    }

    // The server sends a heartbeat every 10 s; silence means a dead connection that never errored.
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastSeen > STALE_MS) {
        lastSeen = Date.now()
        reconnect()
      }
    }, 5000)

    const connect = () => {
      lastSeen = Date.now()
      source = new EventSource('/api/stream')
      source.onopen = () => {
        delay = 1000
        setStatus('live')
        handlers.current.onReconnect()
      }
      source.onerror = reconnect
      source.addEventListener('heartbeat', () => {
        lastSeen = Date.now()
      })
      const listener = (msg: MessageEvent) => {
        lastSeen = Date.now()
        try {
          handlers.current.onEvent(JSON.parse(msg.data) as NeraluEvent)
        } catch {
          /* ignore malformed frames */
        }
      }
      for (const kind of EVENT_KINDS) source.addEventListener(kind, listener)
    }
    connect()
    return () => {
      closed = true
      window.clearTimeout(retry)
      window.clearInterval(watchdog)
      source?.close()
    }
  }, [])

  return status
}

const STALE_MS = 25000

const EVENT_KINDS = [
  'run_reset', 'sim_weather_set', 'round_started', 'call_placed', 'call_ringing', 'call_answered',
  'answer_recorded', 'call_ended', 'attempt_failed', 'retry_scheduled', 'checkin_classified',
  'recall_scheduled', 'case_opened', 'tier_alerted', 'tier_skipped', 'tier_overdue',
  'case_accepted', 'case_resolved', 'family_notified', 'elder_registered',
]

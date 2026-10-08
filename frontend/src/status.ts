import type { ElderListItem, Tier } from './types'

export type Tone = 'ok' | 'watch' | 'support' | 'alert' | 'neutral'

export interface ElderStatus {
  tone: Tone
  label: string
  /** Attention-list group: lower sorts first. null = not on the attention list. */
  group: number | null
}

export const TIER_LABEL: Record<Tier, string> = {
  neighbour: 'Neighbour',
  volunteer: 'Volunteer',
  asha: 'ASHA worker',
}

export const TONE_HEX: Record<Tone, string> = {
  ok: '#2B764A', // keep in sync with styles/tokens.css
  watch: '#985A0E',
  support: '#2B6CB0',
  alert: '#B83A26',
  neutral: '#9A988F',
}

export function elderStatus(e: ElderListItem): ElderStatus {
  const c = e.open_case
  if (c?.level === 'red') {
    if (c.overdue) return { tone: 'alert', label: 'RED · overdue', group: 0 }
    if (c.state === 'assigned') return { tone: 'alert', label: 'RED · accepted', group: 3.5 }
    return { tone: 'alert', label: 'RED', group: 1 }
  }
  const call = e.current_call
  const calling = call?.started && !e.is_simulated
  if (calling) {
    return { tone: 'neutral', label: `${call.is_recall ? 'Recall' : 'Calling'} · attempt ${call.attempt}`, group: 4 }
  }
  const r = e.last_resolution
  if (r && !c) {
    if (r.resolution === 'called_108') return { tone: 'alert', label: 'Called 108 · by volunteer', group: 5 }
    const label = r.resolution === 'support_delivered' ? 'Resolved · support delivered' : 'Resolved · safe in person'
    return { tone: 'ok', label, group: e.is_simulated ? null : 5 }
  }
  if (e.latest.outcome === 'AMBER') return { tone: 'watch', label: 'Follow-up', group: 2 }
  if (c?.level === 'support') {
    return { tone: 'support', label: c.state === 'assigned' ? 'Support · accepted' : 'Needs support', group: 3 }
  }
  if (e.latest.outcome === 'UNREACHED') {
    return { tone: 'neutral', label: `No answer ×${e.latest.attempt ?? 1}`, group: 4 }
  }
  if (e.latest.outcome === 'GREEN') return { tone: 'ok', label: 'Fine', group: null }
  if (call && !e.is_simulated) return { tone: 'neutral', label: 'Call scheduled', group: 4 }
  if (call) return { tone: 'neutral', label: 'Calling', group: null }
  return { tone: 'neutral', label: e.due_calls > 0 ? 'Due today' : 'Not due', group: null }
}

export function whyLine(e: ElderListItem): string {
  const reason = e.open_case?.reason ?? (e.latest.outcome && e.latest.outcome !== 'GREEN' ? e.latest.reason : null)
  const factors = e.risk_factors.slice(0, 3).join(', ')
  return [reason, factors].filter(Boolean).join(' · ')
}

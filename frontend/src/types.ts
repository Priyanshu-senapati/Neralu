export type Outcome = 'GREEN' | 'AMBER' | 'RED' | 'UNREACHED'
export type CaseState = 'open' | 'assigned' | 'resolved'
export type Tier = 'neighbour' | 'volunteer' | 'asha'
export type WeatherLevel = 'normal' | 'caution' | 'severe_for_vulnerable'

export interface Weather {
  temp_c: number
  humidity_pct: number
  heat_index_c: number
  night_min_c: number
  level: WeatherLevel
  /** false only when set from today's real forecast */
  simulated: boolean
  source: 'simulated' | 'open-meteo'
  /** forecast hour used, for 'open-meteo' */
  observed_at: string | null
}

export interface Summary {
  run_id: string
  scenario_now: string
  demo_speed: number
  max_attempts: number
  weather: Weather
  round_no: number | null
  telephony_mode?: 'twilio' | 'browser'
  counts: {
    registered: number
    due_today: number
    fine: number
    follow_up: number
    escalated: number
    unreached_now: number
    support: number
    calls_active: number
  }
  impact: { checks_completed: number; people_checked: number; people_helped: number }
}

export interface Latest {
  outcome: Outcome | null
  rule_id: string | null
  reason: string | null
  attempt: number | null
  at_scenario: string | null
  needs_support: boolean
  call_status: string | null
}

export interface CurrentCall {
  checkin_id: number
  attempt: number
  is_recall: boolean
  started: boolean
  call_status: string | null
  round_no: number
  scheduled_scenario: string
}

export interface CaseBrief {
  id: number
  level: 'red' | 'support'
  tier: Tier
  state: CaseState
  opened_scenario: string
  overdue: boolean
  tier_started_scenario: string
  rule_id: string
  reason: string
}

export interface ElderListItem {
  id: number
  name: string
  age: number
  language: string
  lives_alone: boolean
  roof_type: string
  risk_score: number
  risk_factors: string[]
  threshold_c: number
  caregiver_route: boolean
  due_calls: number
  has_neighbour: boolean
  lat: number
  lng: number
  is_simulated: boolean
  latest: Latest
  current_call: CurrentCall | null
  open_case: CaseBrief | null
  last_resolution: {
    case_id: number
    level: 'red' | 'support'
    resolution: string
    resolved_scenario: string
  } | null
}

export interface RoundSummary {
  round_no: number
  started_scenario: string
  called: number
  called_real: number
  called_simulated: number
  caregiver_route: number
  outcomes: Record<Outcome, number>
  in_progress: number
  red_cases: number
  support_cases: number
  accepted: number
  overdue: number
  as_of_scenario: string
}

export interface NeraluEvent {
  id: number
  kind: string
  ts_scenario: string
  actor: string
  message: string
  elder_id: number | null
  case_id: number | null
  checkin_id: number | null
  data: Record<string, unknown>
  simulated: boolean
}

export interface CheckInOut {
  id: number
  round_no: number
  attempt: number
  is_recall: boolean
  call_status: string | null
  answers: Record<string, string>
  transcript: string | null
  recording_url: string | null
  outcome: Outcome | null
  rule_id: string | null
  reason: string | null
  needs_support: boolean
  is_simulated: boolean
  at_scenario: string | null
  classified: boolean
  rule_explanation?: string | null
}

export interface RiskDetail {
  risk_breakdown: [string, number][]
  threshold_c: number
  heat_index_c: number
  night_min_c: number
}

export interface ElderDetail extends ElderListItem, RiskDetail {
  address: string | null
  code_word: string
  family_name: string | null
  checkins: CheckInOut[]
  events: NeraluEvent[]
}

export interface CaseListItem extends CaseBrief {
  elder: ElderListItem
}

export interface CaseDetail {
  id: number
  level: 'red' | 'support'
  state: CaseState
  tier: Tier
  overdue: boolean
  rule_id: string
  reason: string
  opened_scenario: string
  tier_started_scenario: string
  resolved_scenario: string | null
  resolution: string | null
  resolution_note: string | null
  assignee_id: number | null
  elder: ElderListItem & RiskDetail & { address: string | null; phone?: string | null; maps_url?: string | null }
  checkins: CheckInOut[]
  events: NeraluEvent[]
  mine?: boolean
  distance_km?: number
  /** this volunteer is one of the nearest alerted first */
  alerted_you?: boolean
}

export interface VolunteerMe {
  volunteer: { id: number; name: string; role: 'volunteer' | 'asha' }
  cases: CaseDetail[]
}

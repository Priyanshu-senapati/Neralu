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

export interface PlanRound {
  round_no: number
  at: string
  /** when this round's cases arrive and need responders */
  window: string
  calls: number
  real_calls: number
  caregiver_route: number
  expected: { fine: number; follow_up: number; red: number; support: number; no_answer_first_try: number }
  cases: number
  responders_needed: number
  short: number
}

export interface WardPlan {
  weather: Weather
  residents: number
  over_threshold: number
  rounds: PlanRound[]
  calls: number
  cases: number
  responders_on_duty: number
  peak_needed: number
  short: number
}

/** GET /api/whatif: the run's weather now against a scenario. Outcomes are simulated estimates. */
export interface WhatIf {
  baseline: WardPlan
  scenario: WardPlan
  assumptions: string[]
  simulated: true
}

export interface Summary {
  run_id: string
  scenario_now: string
  demo_speed: number
  max_attempts: number
  weather: Weather
  round_no: number | null
  telephony_mode?: 'twilio' | 'browser'
  run_mode?: 'demo' | 'pilot'
  /** present in pilot mode: the real-time daily schedule */
  pilot?: {
    day: string | null
    round_times: string[]
    calls_until: string
    next_round: string | null
    forecast_loaded: boolean
  } | null
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
  callee?: Callee
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

/** caregiver: a person with memory difficulty is checked through their caregiver (the family contact). */
export type Callee = 'elder' | 'caregiver'

export interface CheckInOut {
  id: number
  round_no: number
  attempt: number
  is_recall: boolean
  callee?: Callee
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
  language?: string | null
  rule_explanation?: string | null
}

export interface RiskDetail {
  risk_breakdown: [string, number][]
  threshold_c: number
  heat_index_c: number
  night_min_c: number
}

/** GET /api/family?t=…: one person's check today, for their family only. */
export interface FamilyStatus {
  name: string
  as_of_scenario: string
  headline: string
  tone: 'ok' | 'watch' | 'alert' | 'neutral'
  timeline: { time: string; text: string; tone: string }[]
  heat_index_c: number
  weather_simulated: boolean
  threshold_c: number
  demo_clock: boolean
}

export interface ElderDetail extends ElderListItem, RiskDetail {
  address: string | null
  code_word: string
  family_name: string | null
  /** only in the registration response: the family's private status link */
  family_link?: string
  /** only in the registration response, shown once: the code that deletes this registration */
  erasure_code?: string
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
  /** this volunteer said "Can't go"; they can still accept */
  declined_by_you?: boolean
}

/** GET /api/impact: the same day as a broadcast alert would leave it, and as Neralu leaves it. */
export interface Impact {
  as_of_scenario: string
  weather: Weather
  residents: number
  due: number
  round_started: boolean
  broadcast: { alerted: number; confirmed_safe: number; known_need_help: number; reached_in_person: number }
  neralu: {
    called: number
    called_real: number
    confirmed_safe: number
    follow_up: number
    not_reached: number
    in_progress: number
    needed_person: number
    reached_in_person: number
    waiting_for_person: number
    caregiver_route: number
    accept_median_min: number | null
    door_median_min: number | null
  }
  pilot: {
    safe_by_noon: { n: number; of: number }
    red_to_door_median_min: number | null
    repeat_risk: number
    volunteer_load: { responders: number; max: number; visits: number }
  }
  trace: Record<string, string>
  simulated_note: string
}

export interface ResponderCase {
  case_id: number
  elder_id: number
  elder: string | null
  level: 'red' | 'support'
}

/** GET /api/responders: each volunteer / ASHA worker, duty, and the cases they hold or are asked to. */
export interface Responder {
  id: number
  name: string
  role: 'volunteer' | 'asha'
  on_duty: boolean
  is_simulated: boolean
  load: number
  holding: ResponderCase[]
  asked: ResponderCase[]
  declined: ResponderCase[]
}

export interface VolunteerMe {
  volunteer: { id: number; name: string; role: 'volunteer' | 'asha'; on_duty: boolean }
  cases: CaseDetail[]
}

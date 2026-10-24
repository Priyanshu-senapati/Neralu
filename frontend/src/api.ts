import type { CaseDetail, CaseListItem, ElderDetail, ElderListItem, FamilyStatus, NeraluEvent, RoundSummary, Summary, VolunteerMe, WhatIf, Responder, Impact } from './types'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`API ${status}`)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  summary: () => request<Summary>('/api/summary'),
  events: (limit = 40) => request<NeraluEvent[]>(`/api/events?limit=${limit}`),
  rounds: () => request<RoundSummary[]>('/api/rounds'),
  elders: () => request<ElderListItem[]>('/api/elders'),
  elder: (id: number) => request<ElderDetail>(`/api/elders/${id}`),
  cases: (state = 'open,assigned') => request<CaseListItem[]>(`/api/cases?state=${state}`),
  caseDetail: (id: number) => request<CaseDetail>(`/api/cases/${id}`),
  setHeat: (w: { temp_c: number; humidity_pct: number; night_min_c: number }) =>
    post<Summary>('/api/sim/heat', w),
  setLiveHeat: () => post<Summary>('/api/sim/heat/live', {}),
  startRound: (round_no: number) => post<{ created: number }>('/api/sim/round', { round_no }),
  reset: () => post<{ run_id: string }>('/api/sim/reset', {}),
  demoFamilyLink: () => post<{ family_token: string }>('/api/sim/family-link', {}),
  whatIf: (
    q: { temp_c: number; humidity_pct: number; night_min_c: number; responders?: number } | { forecast: 'tomorrow'; responders?: number },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    return request<WhatIf>(`/api/whatif?${params}`, { signal })
  },
  volunteerMe: (token: string) => request<VolunteerMe>(`/api/volunteer/me?token=${encodeURIComponent(token)}`),
  accept: (id: number, token: string) =>
    post<CaseDetail>(`/api/cases/${id}/accept`, { volunteer_token: token }),
  decline: (id: number, token: string) => post<CaseDetail>(`/api/cases/${id}/decline`, { volunteer_token: token }),
  duty: (token: string, on_duty: boolean) => post<VolunteerMe>('/api/volunteer/duty', { volunteer_token: token, on_duty }),
  responders: () => request<Responder[]>('/api/responders'),
  impact: () => request<Impact>('/api/impact'),
  resolve: (id: number, token: string, resolution: string, note?: string) =>
    post<CaseDetail>(`/api/cases/${id}/resolve`, { volunteer_token: token, resolution, note }),
  register: (body: unknown) => post<ElderDetail & { family_token: string }>('/api/elders', body),
  removeRegistration: (id: number, registration: string) =>
    request<{ deleted: true }>(`/api/elders/${id}`, { method: 'DELETE', body: JSON.stringify({ registration }) }),
  // The family link's secret goes in a header, never in a URL (it stays out of server and tunnel logs).
  family: {
    status: (token: string) => request<FamilyStatus>('/api/family/status', { headers: { 'X-Family-Token': token } }),
    renew: (token: string) =>
      request<{ family_token: string }>('/api/family/renew', { method: 'POST', headers: { 'X-Family-Token': token } }),
    revoke: (token: string) =>
      request<{ revoked: true }>('/api/family/revoke', { method: 'POST', headers: { 'X-Family-Token': token } }),
  },
  phone: {
    current: () => request<{ call: PhoneCall | null }>('/api/phone/current'),
    answer: (id: number) => post<PhoneScript>(`/api/phone/calls/${id}/answer`, {}),
    key: (id: number, step: string, digit: string | null) =>
      post<{ ok?: boolean; closing?: string[]; speech?: PhoneSpeech }>(`/api/phone/calls/${id}/key`, { step, digit }),
    orientation: async (id: number, body: { audio?: Blob; day?: number }) => {
      const form = new FormData()
      if (body.audio) form.append('audio', body.audio, `answer.${body.audio.type.includes('mp4') ? 'm4a' : 'webm'}`)
      if (body.day !== undefined) form.append('day', String(body.day))
      const res = await fetch(`/api/phone/calls/${id}/orientation`, { method: 'POST', body: form })
      if (!res.ok) throw new ApiError(res.status, await res.text())
    },
    hangup: (id: number) => post<{ ok: boolean }>(`/api/phone/calls/${id}/hangup`, {}),
    decline: (id: number) => post<{ ok: boolean }>(`/api/phone/calls/${id}/decline`, {}),
  },
}

export interface PhoneCall {
  checkin_id: number
  status: 'ringing' | 'in-progress'
  attempt: number
  is_recall: boolean
  elder_name: string
  callee?: 'elder' | 'caregiver'
}

/** Prompt URL -> text to speak instead, for prompts whose recorded clip does not exist yet. */
export type PhoneSpeech = Record<string, { text: string; lang: string }>

export interface PhoneScript {
  callee?: 'elder' | 'caregiver'
  intro: string[]
  code_word: string
  steps: { step: string; prompt: string; caption: string }[]
  orientation: { prompt: string; caption: string } | null // null: a caregiver is not asked the day
  help: { step?: string; prompt: string; caption: string }
  reprompt: string
  speech?: PhoneSpeech
}

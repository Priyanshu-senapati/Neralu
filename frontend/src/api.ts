import type { CaseDetail, CaseListItem, ElderDetail, ElderListItem, NeraluEvent, Summary, VolunteerMe } from './types'

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
  elders: () => request<ElderListItem[]>('/api/elders'),
  elder: (id: number) => request<ElderDetail>(`/api/elders/${id}`),
  cases: (state = 'open,assigned') => request<CaseListItem[]>(`/api/cases?state=${state}`),
  caseDetail: (id: number) => request<CaseDetail>(`/api/cases/${id}`),
  setHeat: (w: { temp_c: number; humidity_pct: number; night_min_c: number }) =>
    post<Summary>('/api/sim/heat', w),
  startRound: (round_no: number) => post<{ created: number }>('/api/sim/round', { round_no }),
  reset: () => post<{ run_id: string }>('/api/sim/reset', {}),
  volunteerMe: (token: string) => request<VolunteerMe>(`/api/volunteer/me?token=${encodeURIComponent(token)}`),
  accept: (id: number, token: string) =>
    post<CaseDetail>(`/api/cases/${id}/accept`, { volunteer_token: token }),
  resolve: (id: number, token: string, resolution: string, note?: string) =>
    post<CaseDetail>(`/api/cases/${id}/resolve`, { volunteer_token: token, resolution, note }),
  register: (body: unknown) => post<ElderDetail>('/api/elders', body),
  phone: {
    current: () => request<{ call: PhoneCall | null }>('/api/phone/current'),
    answer: (id: number) => post<PhoneScript>(`/api/phone/calls/${id}/answer`, {}),
    key: (id: number, step: string, digit: string | null) =>
      post<{ ok?: boolean; closing?: string[] }>(`/api/phone/calls/${id}/key`, { step, digit }),
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
}

export interface PhoneScript {
  intro: string[]
  code_word: string
  steps: { step: string; prompt: string; caption: string }[]
  orientation: { prompt: string; caption: string }
  help: { prompt: string; caption: string }
  reprompt: string
}

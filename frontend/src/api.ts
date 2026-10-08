import type { CaseDetail, CaseListItem, ElderDetail, ElderListItem, Summary, VolunteerMe } from './types'

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
}

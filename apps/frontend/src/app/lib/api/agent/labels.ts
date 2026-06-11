import { fetchJson } from './http'

// ─── Labels ───

export interface LabelItem {
  id: string
  socialAccountId: string
  name: string
  color: string
  order: number
  createdAt: string
  updatedAt: string
}

export const labelApi = {
  list: (socialAccountId: string) => fetchJson<LabelItem[]>(`/labels/account/${socialAccountId}`),

  create: (data: { socialAccountId: string; name: string; color?: string }) =>
    fetchJson<LabelItem>('/labels', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string; color?: string; order?: number }) =>
    fetchJson<LabelItem>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) => fetchJson<void>(`/labels/${id}`, { method: 'DELETE' }),
}

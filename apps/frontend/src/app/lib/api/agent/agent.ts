import { fetchJson } from './http'
import type { LabelItem } from './labels'

// ─── Agent ───

export interface AgentSocialAccount {
  id: string
  // Activation scope persisted on the agent↔account link. Returned by the
  // agent list/detail endpoints so the activation modal can pre-fill.
  aiActivateAll?: boolean
  aiActivateAds?: boolean
  aiActivateNewConversations?: boolean
  aiActivationContacts?: string[]
  socialAccount: {
    id: string
    provider: string
    pageName?: string
    pageAbout?: string
    username?: string
    profilePictureUrl?: string
    metadata?: Record<string, unknown>
  }
}

export interface Agent {
  id: string
  name?: string
  status: 'DRAFT' | 'CONFIGURING' | 'READY' | 'ACTIVE' | 'PAUSED'
  score: number
  context?: string
  createdAt: string
  updatedAt: string
  socialAccounts: AgentSocialAccount[]
  _count?: { messages: number; tickets: number }
}

export interface AgentMessage {
  id: string
  role: string
  content: string
  type: string
  metadata?: { options?: { id: string; label: string }[]; needs?: string[] }
  createdAt: string
}

export const agentApi = {
  list: (orgId: string) => fetchJson<Agent[]>(`/agent/org/${orgId}`),

  get: (id: string) => fetchJson<Agent>(`/agent/${id}`),

  create: (data: { organisationId: string; socialAccountIds: string[]; name?: string }) =>
    fetchJson<Agent>('/agent', { method: 'POST', body: JSON.stringify(data) }),

  remove: (id: string) => fetchJson<void>(`/agent/${id}`, { method: 'DELETE' }),

  getMessages: (id: string, limit?: number) =>
    fetchJson<AgentMessage[]>(`/agent/${id}/messages${limit ? `?limit=${limit}` : ''}`),

  sendMessage: (id: string, content: string, organisationId: string) =>
    fetchJson<AgentMessage>(`/agent/${id}/messages?organisationId=${organisationId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  analyzeCatalogs: (id: string, organisationId: string) =>
    fetchJson<{ status: string }>(
      `/agent/${id}/analyze-catalogs?organisationId=${organisationId}`,
      {
        method: 'POST',
      },
    ),

  initialEvaluation: (id: string, organisationId: string) =>
    fetchJson<AgentMessage>(`/agent/${id}/initial-evaluation?organisationId=${organisationId}`, {
      method: 'POST',
    }),

  startSetup: (id: string, organisationId: string) =>
    fetchJson<{ status: string }>(`/agent/${id}/start-setup?organisationId=${organisationId}`, {
      method: 'POST',
    }),

  areCatalogsAnalyzed: (id: string) =>
    fetchJson<{ analyzed: boolean }>(`/agent/${id}/catalogs-analyzed`),

  activate: (
    id: string,
    data: {
      activateAll?: boolean
      activateAds?: boolean
      activateNewConversations?: boolean
      contacts?: Record<string, string[]>
    },
  ) =>
    fetchJson<Agent>(`/agent/${id}/activate`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deactivate: (id: string) => fetchJson<Agent>(`/agent/${id}/deactivate`, { method: 'PUT' }),

  updateSocialAccounts: (id: string, socialAccountIds: string[]) =>
    fetchJson<Agent>(`/agent/${id}/social-accounts`, {
      method: 'PUT',
      body: JSON.stringify({ socialAccountIds }),
    }),

  getLabels: (id: string) => fetchJson<LabelItem[]>(`/agent/${id}/labels`),
}

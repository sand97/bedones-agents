import { fetchJson } from './http'

// ─── Social Accounts (uses existing endpoints) ───

export interface SocialAccount {
  id: string
  provider: string
  providerAccountId: string
  pageName?: string
  pageAbout?: string
  username?: string
  profilePictureUrl?: string
}

export const socialApi = {
  listAccounts: (orgId: string) => fetchJson<SocialAccount[]>(`/social/accounts/${orgId}`),

  // Soft disconnect: hides the account & stops sync but keeps history for reconnect.
  disconnect: (accountId: string) =>
    fetchJson<{ success: boolean }>(`/social/accounts/${accountId}/disconnect`, {
      method: 'POST',
    }),
}

// ─── Conversations ───

export interface ConversationItem {
  id: string
  socialAccountId: string
  participantId: string
  participantName: string
  participantAvatar?: string
  lastMessageText?: string
  lastMessageAt?: string
  unreadCount: number
}

export const conversationApi = {
  listByAccount: (accountId: string) =>
    fetchJson<ConversationItem[]>(`/messaging/conversations/${accountId}`),
}

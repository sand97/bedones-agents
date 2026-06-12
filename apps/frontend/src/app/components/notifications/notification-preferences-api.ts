// Local API hooks for /notification-preferences/*.
// Once the backend's swagger-output is rebuilt and v1.d.ts is regenerated,
// the endpoints below can be replaced 1:1 with `$api.useQuery(...)` /
// `$api.useMutation(...)`. Until then we hit the API via plain fetch with
// the same base URL + credentials policy as `apiClient`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getStoredLocale } from '@app/i18n'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': getStoredLocale(),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export type NotificationType =
  | 'COMMENT_TO_READ'
  | 'COMMENT_AI_SUGGESTION'
  | 'COMMENT_DAILY_SUMMARY'
  | 'MESSAGE_TO_READ'
  | 'MESSAGE_AI_SUGGESTION'
  | 'MESSAGE_TICKET_CREATED'
  | 'MESSAGE_TICKET_CLOSED'
  | 'MESSAGE_DAILY_SUMMARY'

export type SocialProvider = 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'TIKTOK'

export interface NotifSocialAccount {
  id: string
  provider: SocialProvider
  providerAccountId: string
  pageName: string | null
  username: string | null
  profilePictureUrl: string | null
}

export interface NotifMember {
  id: string
  name: string
  avatar: string | null
  email: string | null
}

export interface NotificationPreferenceRow {
  userId: string
  socialAccountId: string
  type: NotificationType
  enabled: boolean
  /** Ticket notifications: restrict to these collection ids (empty = all). */
  collectionIds: string[]
}

export interface NotificationPreferencesResponse {
  members: NotifMember[]
  commentSocialAccounts: NotifSocialAccount[]
  messagingSocialAccounts: NotifSocialAccount[]
  commentTypes: NotificationType[]
  messageTypes: NotificationType[]
  preferences: NotificationPreferenceRow[]
}

const queryKey = (organisationId: string, userIds: string[]) =>
  ['notification-preferences', organisationId, [...userIds].sort().join(',')] as const

export function useNotificationPreferencesQuery(
  organisationId: string,
  userIds: string[],
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKey(organisationId, userIds),
    enabled: options?.enabled !== false && userIds.length > 0,
    queryFn: async (): Promise<NotificationPreferencesResponse> => {
      const params = userIds.length > 0 ? `?userIds=${encodeURIComponent(userIds.join(','))}` : ''
      return apiFetch<NotificationPreferencesResponse>(
        `/notification-preferences/org/${organisationId}${params}`,
      )
    },
  })
}

export function useBulkUpdateNotificationPreferenceMutation(
  organisationId: string,
  userIds: string[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      userIds: string[]
      socialAccountId: string
      type: NotificationType
      enabled: boolean
      /** Ticket types only: restrict to these collection ids (empty = all). */
      collectionIds?: string[]
    }): Promise<NotificationPreferenceRow[]> => {
      return apiFetch<NotificationPreferenceRow[]>(
        `/notification-preferences/org/${organisationId}/bulk`,
        { method: 'POST', body: JSON.stringify(input) },
      )
    },
    onSuccess: (rows, variables) => {
      queryClient.setQueryData<NotificationPreferencesResponse>(
        queryKey(organisationId, userIds),
        (prev) => {
          if (!prev) return prev
          const map = new Map(
            prev.preferences.map((p) => [`${p.userId}|${p.socialAccountId}|${p.type}`, p] as const),
          )
          for (const row of rows) {
            map.set(`${row.userId}|${row.socialAccountId}|${row.type}`, row)
          }
          // Drop rows that match the explicit value if it equals the default,
          // but keep them — backend persists the explicit override either way.
          void variables
          return { ...prev, preferences: Array.from(map.values()) }
        },
      )
    },
  })
}

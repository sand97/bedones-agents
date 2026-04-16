import i18n from '@app/i18n'
import { apiClient } from './api/client'
import type { components } from './api/v1'

// ─── Re-export types for convenience ───
export type MeResponse = components['schemas']['MeResponseDto']
export type UserDto = components['schemas']['UserDto']
export type OrganisationSummary = components['schemas']['OrganisationSummaryDto']
export type OrganisationResponse = components['schemas']['OrganisationResponseDto']
export type SocialAccountDto = components['schemas']['SocialAccountDto']
export type SocialAccountResponse = components['schemas']['SocialAccountResponseDto']
export type PostResponse = components['schemas']['PostResponseDto']
export type CommentResponse = components['schemas']['CommentResponseDto']
export type PageSettingsResponse = components['schemas']['PageSettingsResponseDto']
export type UnreadCount = components['schemas']['UnreadCountDto']

interface ApiError {
  message?: string
  error?: string
  statusCode?: number
}

function getErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError
  return apiError?.message || fallback
}

export async function fetchMe(): Promise<MeResponse> {
  const { data, error } = await apiClient.GET('/auth/me')

  if (error) {
    throw new Error(getErrorMessage(error, 'Not authenticated'))
  }

  return data
}

export async function login(email: string, password: string): Promise<void> {
  const { error } = await apiClient.POST('/auth/login', {
    body: { email, password },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('auth.login_error')))
  }
}

export async function logout(): Promise<void> {
  await apiClient.POST('/auth/logout')
}

export async function createOrganisation(name: string): Promise<OrganisationResponse> {
  const { data, error } = await apiClient.POST('/organisations', {
    body: { name },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('org.create_error')))
  }

  return data
}

export async function updateOrganisation(
  orgId: string,
  body: { name?: string; logoUrl?: string },
): Promise<OrganisationResponse> {
  const { data, error } = await apiClient.PATCH('/organisations/{id}', {
    params: { path: { id: orgId } },
    body,
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('org.update_error')))
  }

  return data
}

export async function uploadLogo(file: File): Promise<string> {
  const { data, error } = await apiClient.POST('/upload/logo', {
    body: { file } as unknown as { file: string },
    bodySerializer: () => {
      const formData = new FormData()
      formData.append('file', file)
      return formData
    },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('upload.error')))
  }

  return data.url
}

export async function uploadChatMedia(file: File): Promise<string> {
  const { data, error } = await apiClient.POST('/upload/chat-media', {
    body: { file } as unknown as { file: string },
    bodySerializer: () => {
      const formData = new FormData()
      formData.append('file', file)
      return formData
    },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('upload.media_error')))
  }

  return data.url
}

// ─── Social / Comments ───

export async function connectFacebook(
  organisationId: string,
  code: string,
  redirectUri: string,
  scopes?: string[],
): Promise<SocialAccountResponse[]> {
  const { data, error } = await apiClient.POST('/social/connect/facebook', {
    body: { organisationId, code, redirectUri, scopes },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.facebook_connect_error')))
  }

  return data
}

export async function connectFacebookCatalog(
  organisationId: string,
  code: string,
  redirectUri: string,
  scopes?: string[],
): Promise<unknown> {
  const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
  const res = await fetch(`${API_URL}/social/connect/facebook-catalog`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organisationId, code, redirectUri, scopes }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || i18n.t('social.facebook_connect_error'))
  }

  return res.json()
}

export async function connectInstagram(
  organisationId: string,
  code: string,
  redirectUri: string,
  scopes?: string[],
): Promise<SocialAccountResponse> {
  const { data, error } = await apiClient.POST('/social/connect/instagram', {
    body: { organisationId, code, redirectUri, scopes },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.instagram_connect_error')))
  }

  return data
}

export async function connectTikTok(
  organisationId: string,
  code: string,
  redirectUri: string,
  scopes?: string[],
): Promise<SocialAccountResponse> {
  const { data, error } = await apiClient.POST('/social/connect/tiktok', {
    body: { organisationId, code, redirectUri, scopes },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.tiktok_connect_error')))
  }

  return data
}

export async function getSocialAccounts(organisationId: string): Promise<SocialAccountResponse[]> {
  const { data, error } = await apiClient.GET('/social/accounts/{organisationId}', {
    params: { path: { organisationId } },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.load_accounts_error')))
  }

  return data
}

export async function getPostsForAccount(accountId: string): Promise<PostResponse[]> {
  const { data, error } = await apiClient.GET('/social/accounts/{accountId}/posts', {
    params: { path: { accountId } },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.load_posts_error')))
  }

  return data
}

export async function updatePageSettings(
  accountId: string,
  settings: {
    undesiredCommentsAction?: 'hide' | 'delete' | 'none'
    spamAction?: 'hide' | 'delete' | 'none'
    customInstructions?: string
    faqRules?: { question: string; answer: string }[]
  },
): Promise<PageSettingsResponse> {
  const { data, error } = await apiClient.PATCH('/social/accounts/{accountId}/settings', {
    params: { path: { accountId } },
    body: settings,
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.update_error')))
  }

  return data
}

export async function markPostAsRead(postId: string): Promise<void> {
  const { error } = await apiClient.POST('/social/comments/mark-read', {
    body: { postId },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.mark_error')))
  }
}

export async function replyToComment(commentId: string, message: string): Promise<CommentResponse> {
  const { data, error } = await apiClient.POST('/social/comments/reply', {
    body: { commentId, message },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.reply_error')))
  }

  return data
}

export async function hideComment(commentId: string): Promise<CommentResponse> {
  const { data, error } = await apiClient.POST('/social/comments/hide', {
    body: { commentId },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.hide_error')))
  }

  return data
}

export async function deleteComment(commentId: string): Promise<CommentResponse> {
  const { data, error } = await apiClient.POST('/social/comments/delete', {
    body: { commentId },
  })

  if (error) {
    throw new Error(getErrorMessage(error, i18n.t('social.delete_error')))
  }

  return data
}

export async function getUnreadCounts(organisationId: string): Promise<UnreadCount[]> {
  const { data, error } = await apiClient.GET('/social/unread-counts/{organisationId}', {
    params: { path: { organisationId } },
  })

  if (error) {
    return [] // Silent fail — sidebar shouldn't break if this fails
  }

  return data
}

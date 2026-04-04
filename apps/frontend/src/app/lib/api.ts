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
    throw new Error(getErrorMessage(error, 'Erreur de connexion'))
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
    throw new Error(getErrorMessage(error, 'Erreur lors de la création'))
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
    throw new Error(getErrorMessage(error, 'Erreur lors de la mise à jour'))
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
    throw new Error(getErrorMessage(error, "Erreur lors de l'upload"))
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
    throw new Error(getErrorMessage(error, 'Erreur de connexion Facebook'))
  }

  return data
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
    throw new Error(getErrorMessage(error, 'Erreur de connexion Instagram'))
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
    throw new Error(getErrorMessage(error, 'Erreur de connexion TikTok'))
  }

  return data
}

export async function getSocialAccounts(organisationId: string): Promise<SocialAccountResponse[]> {
  const { data, error } = await apiClient.GET('/social/accounts/{organisationId}', {
    params: { path: { organisationId } },
  })

  if (error) {
    throw new Error(getErrorMessage(error, 'Erreur lors du chargement des comptes'))
  }

  return data
}

export async function getPostsForAccount(accountId: string): Promise<PostResponse[]> {
  const { data, error } = await apiClient.GET('/social/accounts/{accountId}/posts', {
    params: { path: { accountId } },
  })

  if (error) {
    throw new Error(getErrorMessage(error, 'Erreur lors du chargement des posts'))
  }

  return data
}

export async function updatePageSettings(
  accountId: string,
  settings: {
    undesiredCommentsAction?: string
    spamAction?: string
    customInstructions?: string
    faqRules?: { question: string; answer: string }[]
  },
): Promise<PageSettingsResponse> {
  const { data, error } = await apiClient.PATCH('/social/accounts/{accountId}/settings', {
    params: { path: { accountId } },
    body: settings,
  })

  if (error) {
    throw new Error(getErrorMessage(error, 'Erreur lors de la mise à jour'))
  }

  return data
}

export async function markPostAsRead(postId: string): Promise<void> {
  const { error } = await apiClient.POST('/social/comments/mark-read', {
    body: { postId },
  })

  if (error) {
    throw new Error(getErrorMessage(error, 'Erreur lors du marquage'))
  }
}

export async function replyToComment(commentId: string, message: string): Promise<CommentResponse> {
  const { data, error } = await apiClient.POST('/social/comments/reply', {
    body: { commentId, message },
  })

  if (error) {
    throw new Error(getErrorMessage(error, 'Erreur lors de la réponse'))
  }

  return data
}

export async function hideComment(commentId: string): Promise<CommentResponse> {
  const { data, error } = await apiClient.POST('/social/comments/hide', {
    body: { commentId },
  })

  if (error) {
    throw new Error(getErrorMessage(error, 'Erreur lors du masquage'))
  }

  return data
}

export async function deleteComment(commentId: string): Promise<CommentResponse> {
  const { data, error } = await apiClient.POST('/social/comments/delete', {
    body: { commentId },
  })

  if (error) {
    throw new Error(getErrorMessage(error, 'Erreur lors de la suppression'))
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

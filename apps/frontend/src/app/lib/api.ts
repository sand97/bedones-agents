import { apiClient } from './api/client'
import type { components } from './api/v1'

// ─── Re-export types for convenience ───
export type MeResponse = components['schemas']['MeResponseDto']
export type UserDto = components['schemas']['UserDto']
export type OrganisationSummary = components['schemas']['OrganisationSummaryDto']
export type OrganisationResponse = components['schemas']['OrganisationResponseDto']
export type SocialAccountDto = components['schemas']['SocialAccountDto']

export async function fetchMe(): Promise<MeResponse> {
  const { data, error } = await apiClient.GET('/auth/me')

  if (error) {
    throw new Error('Not authenticated')
  }

  return data
}

export async function login(email: string, password: string): Promise<void> {
  const { error } = await apiClient.POST('/auth/login', {
    body: { email, password },
  })

  if (error) {
    throw new Error('Erreur de connexion')
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
    throw new Error('Erreur lors de la création')
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
    throw new Error('Erreur lors de la mise à jour')
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
    throw new Error("Erreur lors de l'upload")
  }

  return data.url
}

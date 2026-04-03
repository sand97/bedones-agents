/**
 * Auth redirect helpers — stores the user's intent in localStorage
 * before redirecting to Facebook/Instagram OAuth, so the callback page
 * knows where to send the user afterwards.
 */

const AUTH_REDIRECT_KEY = 'auth_redirect'

export interface AuthRedirectIntent {
  intent: 'login' | 'onboarding'
  step?: number
  orgId?: string
}

export function setAuthRedirect(data: AuthRedirectIntent) {
  localStorage.setItem(AUTH_REDIRECT_KEY, JSON.stringify(data))
}

export function getAuthRedirect(): AuthRedirectIntent | null {
  const raw = localStorage.getItem(AUTH_REDIRECT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearAuthRedirect() {
  localStorage.removeItem(AUTH_REDIRECT_KEY)
}

/**
 * Build the Facebook OAuth URL for login or page connection.
 */
export function buildFacebookOAuthUrl(options?: { configId?: string }): string {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID
  const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
  const redirectUri = `${apiUrl}/auth/callback/facebook`

  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')

  if (options?.configId) {
    url.searchParams.set('config_id', options.configId)
  } else {
    // Default login scopes
    url.searchParams.set('scope', 'public_profile,email')
  }

  return url.toString()
}

/**
 * Build the Instagram OAuth URL for login.
 */
export function buildInstagramOAuthUrl(): string {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID // Instagram uses Facebook App ID
  const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
  const redirectUri = `${apiUrl}/auth/callback/instagram`

  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'instagram_business_basic')
  url.searchParams.set('response_type', 'code')

  return url.toString()
}

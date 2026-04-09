/**
 * Auth redirect helpers — stores the user's intent in localStorage
 * before redirecting to Facebook/Instagram OAuth, so the callback page
 * knows where to send the user afterwards.
 */

const AUTH_REDIRECT_KEY = 'auth_redirect'

export type InstagramScope = 'comments' | 'messages' | 'comments+messages'

export interface AuthRedirectIntent {
  intent: 'login' | 'onboarding' | 'connect_pages'
  step?: number
  orgId?: string
  provider?: 'facebook' | 'instagram' | 'tiktok'
  igScope?: InstagramScope
  /** The page route id to redirect after connect (e.g. 'messenger', 'instagram-dm', 'facebook') */
  pageId?: string
  /** Feature scopes to store on the account (e.g. ['comments'], ['messages']) */
  scopes?: string[]
  /** The pathname the user was on before OAuth redirect — used to return on success or error */
  returnTo?: string
}

export function setAuthRedirect(data: AuthRedirectIntent) {
  localStorage.setItem(
    AUTH_REDIRECT_KEY,
    JSON.stringify({ ...data, returnTo: data.returnTo ?? window.location.pathname }),
  )
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
 * Build the Facebook OAuth URL for business page connection.
 * Requires a config_id from a Facebook Login Configuration.
 */
export function buildFacebookOAuthUrl(configId: string): string {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID
  const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
  const redirectUri = `${apiUrl}/auth/callback/facebook`

  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('config_id', configId)

  return url.toString()
}

/**
 * Build the Instagram OAuth URL for business account connection.
 * Uses the Instagram OAuth endpoint with scopes based on the feature context.
 */
export function buildInstagramOAuthUrl(scope: InstagramScope = 'comments'): string {
  const appId = import.meta.env.VITE_INSTAGRAM_APP_ID
  const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
  const redirectUri = `${apiUrl}/auth/callback/instagram`

  const scopes = ['instagram_business_basic']
  if (scope === 'comments' || scope === 'comments+messages') {
    scopes.push('instagram_business_manage_comments')
  }
  if (scope === 'messages' || scope === 'comments+messages') {
    scopes.push('instagram_business_manage_messages')
  }

  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes.join(','))
  url.searchParams.set('force_reauth', 'true')

  return url.toString()
}

/**
 * Build the TikTok OAuth URL for business account connection.
 */
export function buildTikTokOAuthUrl(): string {
  const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY
  const apiUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'
  const redirectUri = `${apiUrl}/auth/callback/tiktok`

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.searchParams.set('client_key', clientKey)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set(
    'scope',
    'user.info.basic,user.info.username,user.account.type,comment.list,comment.list.manage',
  )

  return url.toString()
}

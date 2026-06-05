import {
  setAuthRedirect,
  buildFacebookOAuthUrl,
  buildInstagramOAuthUrl,
  buildTikTokOAuthUrl,
  type InstagramScope,
  type TikTokScope,
} from './auth-redirect'
import type { components } from './api/v1'

type SocialAccount = components['schemas']['SocialAccountResponseDto']

/**
 * Result of {@link reconnectSocialAccount}:
 * - `redirect`: the browser is being sent to the provider's OAuth screen.
 * - `whatsapp`: caller must run the WhatsApp Embedded Signup flow itself.
 * - `unsupported`: no reconnect path (missing config).
 */
export type ReconnectOutcome = 'redirect' | 'whatsapp' | 'unsupported'

/** Which features an account was set up for, inferred from its granted scopes. */
function featuresForAccount(account: SocialAccount): { comments: boolean; messages: boolean } {
  const scopes = (account.scopes ?? []).map((s) => s.toLowerCase())
  const messages =
    account.provider === 'WHATSAPP' ||
    scopes.some((s) => s === 'messages' || s.includes('messag') || s.startsWith('message.'))
  const comments =
    account.provider !== 'WHATSAPP' && scopes.some((s) => s === 'comments' || s.includes('comment'))

  // Comment-capable networks with no derivable scope default to re-requesting
  // comments so the reconnect button is never a no-op.
  if (!comments && !messages && account.provider !== 'WHATSAPP') {
    return { comments: true, messages: false }
  }
  return { comments, messages }
}

function scopeParam(features: {
  comments: boolean
  messages: boolean
}): InstagramScope & TikTokScope {
  if (features.comments && features.messages) return 'comments+messages'
  if (features.messages) return 'messages'
  return 'comments'
}

function facebookConfigId(features: { comments: boolean; messages: boolean }): string | undefined {
  if (features.comments && features.messages) {
    return import.meta.env.VITE_FB_COMMENTS_MESSAGES_CONFIGGURATION_ID
  }
  if (features.messages) return import.meta.env.VITE_FB_MESSAGES_CONFIGGURATION_ID
  return import.meta.env.VITE_FB_COMMENTS_CONFIGGURATION_ID
}

/**
 * Starts the OAuth re-consent flow for an account whose token/permissions
 * lapsed. Stores the intent (so the callback returns the user here) and sends
 * the browser to the provider. WhatsApp uses Embedded Signup, which the caller
 * must handle — we return `'whatsapp'` in that case.
 */
export function reconnectSocialAccount(
  account: SocialAccount,
  orgId: string,
  returnTo: string = window.location.pathname,
): ReconnectOutcome {
  const features = featuresForAccount(account)
  const featureScopes = [
    ...(features.comments ? ['comments'] : []),
    ...(features.messages ? ['messages'] : []),
  ]

  if (account.provider === 'FACEBOOK') {
    const configId = facebookConfigId(features)
    if (!configId) return 'unsupported'
    setAuthRedirect({
      intent: 'connect_pages',
      orgId,
      provider: 'facebook',
      scopes: featureScopes,
      returnTo,
    })
    window.location.href = buildFacebookOAuthUrl(configId)
    return 'redirect'
  }

  if (account.provider === 'INSTAGRAM') {
    const scope = scopeParam(features)
    setAuthRedirect({
      intent: 'connect_pages',
      orgId,
      provider: 'instagram',
      igScope: scope,
      scopes: featureScopes,
      returnTo,
    })
    window.location.href = buildInstagramOAuthUrl(scope)
    return 'redirect'
  }

  if (account.provider === 'TIKTOK') {
    const scope = scopeParam(features)
    setAuthRedirect({
      intent: 'connect_pages',
      orgId,
      provider: 'tiktok',
      scopes: featureScopes,
      returnTo,
    })
    window.location.href = buildTikTokOAuthUrl(scope)
    return 'redirect'
  }

  // WhatsApp re-auth runs through Embedded Signup (FB SDK), handled by callers.
  return 'whatsapp'
}

import type { SocialFeature, SocialProvider } from 'generated/prisma/enums'

/**
 * The provider permissions we actually need for each outbound feature. These
 * mirror what the frontend requests in the OAuth consent screen
 * (`apps/frontend/src/app/lib/auth-redirect.ts`) so we can detect when the user
 * unchecked a permission we depend on and disable just that feature until they
 * reconnect with the full set.
 *
 * A feature is considered healthy only when ALL of its scopes were granted.
 */
export const REQUIRED_SCOPES: Record<SocialProvider, Partial<Record<SocialFeature, string[]>>> = {
  FACEBOOK: {
    COMMENT: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_read_user_content',
      'pages_manage_engagement',
    ],
    MESSAGE: ['pages_show_list', 'pages_messaging'],
  },
  INSTAGRAM: {
    COMMENT: ['instagram_business_basic', 'instagram_business_manage_comments'],
    MESSAGE: ['instagram_business_basic', 'instagram_business_manage_messages'],
  },
  TIKTOK: {
    COMMENT: ['comment.list', 'comment.list.manage', 'video.list'],
    MESSAGE: ['message.list.read', 'message.list.send', 'message.list.manage'],
  },
  WHATSAPP: {
    MESSAGE: ['whatsapp_business_messaging'],
  },
  // Catalog connections only need catalog scopes; no comment/message features.
  FACEBOOK_CATALOG: {},
}

/**
 * Maps the loose "feature scopes" the frontend stores on an account
 * (e.g. 'comments', 'messages', 'message.list.send') to the canonical
 * SocialFeature enum, so we know which features the user intended to enable.
 */
export function featuresFromRequestedScopes(scopes: string[]): SocialFeature[] {
  const features = new Set<SocialFeature>()
  for (const raw of scopes) {
    const scope = raw.toLowerCase()
    // Matches 'comments', 'comment.list', 'instagram_business_manage_comments', …
    if (scope === 'comments' || scope.includes('comment')) features.add('COMMENT')
    // Matches 'messages', 'message.list.send', '..._messaging', '..._manage_messages', …
    if (scope === 'messages' || scope.includes('messag')) features.add('MESSAGE')
  }
  return [...features]
}

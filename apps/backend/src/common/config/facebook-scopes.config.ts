/**
 * Facebook/Instagram OAuth scopes configuration
 *
 * Note: The frontend builds the OAuth URL using Facebook Login Configuration IDs
 * (VITE_FB_COMMENTS_CONFIGGURATION_ID, etc.). The backend only needs to know
 * scopes for token validation and page sync.
 */

// Login scopes (used to identify what the user granted)
export const FACEBOOK_LOGIN_SCOPES = ['public_profile', 'email']
export const INSTAGRAM_LOGIN_SCOPES = ['instagram_basic']

// Page management scopes
export const FACEBOOK_COMMENTS_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_read_user_content',
  'pages_manage_engagement',
]

export const FACEBOOK_MESSAGING_SCOPES = ['pages_messaging', 'pages_show_list']

export const FACEBOOK_FULL_SCOPES = [
  ...new Set([...FACEBOOK_COMMENTS_SCOPES, ...FACEBOOK_MESSAGING_SCOPES]),
]

export const INSTAGRAM_COMMENTS_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_comments',
]

export const INSTAGRAM_MESSAGING_SCOPES = ['instagram_manage_messages']

export const INSTAGRAM_FULL_SCOPES = [
  ...new Set([...INSTAGRAM_COMMENTS_SCOPES, ...INSTAGRAM_MESSAGING_SCOPES]),
]

/** Facebook Graph API version used across the app */
export const FACEBOOK_GRAPH_API_VERSION = 'v21.0'

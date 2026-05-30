import type { MeResponse } from '@app/lib/api'
import { hasOnboardingDraft } from '@app/lib/onboarding-draft'

/**
 * Where to send the user right after authentication, based on their
 * organisations, pending invitations and any in-progress onboarding.
 */
export type PostAuthRoute =
  | { kind: 'onboarding' }
  | { kind: 'organisations' }
  | { kind: 'dashboard'; orgId: string }

/**
 * Resolve the post-login destination:
 *
 * 1. A real pending invitation (to an org you're not already a member of)
 *    → organisations page to accept / decline.
 * 2. An in-progress onboarding draft (e.g. WhatsApp connected but Facebook
 *    still pending) → resume onboarding.
 * 3. No organisation yet → onboarding (fresh sign-up).
 * 4. Several organisations → organisations page to pick one.
 * 5. A single organisation:
 *    - you're only a member → open its dashboard,
 *    - you administer it but it has no connected account yet → resume
 *      onboarding (the social-network choice screen),
 *    - otherwise → open its dashboard.
 */
export function resolvePostAuthRoute(me: MeResponse): PostAuthRoute {
  const orgs = me.organisations ?? []

  // You can't have a pending invitation to an org you're already a member of
  // (e.g. the one you just created) — ignore such phantom invitations.
  const invitations = (me.pendingInvitations ?? []).filter(
    (inv) => !orgs.some((o) => o.id === inv.organisationId),
  )

  if (invitations.length > 0) return { kind: 'organisations' }

  if (hasOnboardingDraft()) return { kind: 'onboarding' }

  if (orgs.length === 0) return { kind: 'onboarding' }

  if (orgs.length > 1) return { kind: 'organisations' }

  const org = orgs[0]
  const isAdmin = org.role === 'OWNER' || org.role === 'ADMIN'
  const hasAssets = org.socialAccounts.length > 0

  if (isAdmin && !hasAssets) return { kind: 'onboarding' }

  return { kind: 'dashboard', orgId: org.id }
}

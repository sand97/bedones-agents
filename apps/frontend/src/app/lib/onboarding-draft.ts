/**
 * Onboarding draft — persisted in localStorage so the create-organisation flow
 * survives OAuth redirects (Facebook/Instagram/TikTok leave the page and come
 * back) and a re-login after an abandoned onboarding. Cleared on "Terminer".
 *
 * Post-login routing must consult this draft FIRST: while an onboarding is in
 * progress we resume it — even once the org already has a social account (e.g.
 * WhatsApp connected but Facebook still pending) — instead of falling through
 * to the dashboard. The "org without social account → onboarding" heuristic is
 * only the fallback used when no draft is present.
 */

const ONBOARDING_DRAFT_KEY = 'bedones:onboarding_draft'

export interface OnboardingDraft {
  orgId?: string
  orgName?: string
  step?: number
  comments?: string[]
  messaging?: string[]
}

export function readOnboardingDraft(): OnboardingDraft {
  try {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as OnboardingDraft) : {}
  } catch {
    return {}
  }
}

export function writeOnboardingDraft(draft: OnboardingDraft) {
  try {
    localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* localStorage unavailable — ignore */
  }
}

export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARDING_DRAFT_KEY)
  } catch {
    /* localStorage unavailable — ignore */
  }
}

/**
 * True when an onboarding is in progress: an organisation has been created
 * (its id is stored) but the flow wasn't completed. Used to resume onboarding
 * on the next login rather than routing to the dashboard.
 */
export function hasOnboardingDraft(): boolean {
  return Boolean(readOnboardingDraft().orgId)
}

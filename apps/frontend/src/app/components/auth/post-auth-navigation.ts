import { useNavigate } from '@tanstack/react-router'
import { type MeResponse } from '@app/lib/api'
import { resolvePostAuthRoute } from '@app/lib/post-auth-route'

/**
 * Validate a `return_to` query param so it can only send the user back to our
 * own MCP OAuth authorize endpoint (prevents open-redirect abuse). Used when an
 * external AI assistant (Claude / ChatGPT MCP connector) bounces an
 * unauthenticated user here to log in before consenting.
 */
function resolveReturnTo(raw?: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    const apiUrl = new URL(import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local')
    if (url.origin !== apiUrl.origin) return null
    if (!url.pathname.startsWith('/mcp/oauth/authorize')) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Send the user to the right place after authentication (see resolvePostAuthRoute). */
export function navigateAfterAuth(
  navigate: ReturnType<typeof useNavigate>,
  data: MeResponse,
  returnTo?: string,
) {
  // An MCP/OAuth flow takes precedence: bounce the browser back to the authorize
  // endpoint (full-page navigation so the freshly-set session cookie is sent).
  const target = resolveReturnTo(returnTo)
  if (target) {
    window.location.href = target
    return
  }

  const route = resolvePostAuthRoute(data)
  if (route.kind === 'dashboard') {
    navigate({ to: '/app/$orgSlug/dashboard', params: { orgSlug: route.orgId } })
  } else if (route.kind === 'organisations') {
    navigate({ to: '/organisations' })
  } else {
    navigate({ to: '/create-organisation', search: { step: undefined } })
  }
}

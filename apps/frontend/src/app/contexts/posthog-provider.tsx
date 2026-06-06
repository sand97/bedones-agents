import { useEffect, useRef, type ReactNode } from 'react'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useParams, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { POSTHOG_KEY, posthogOptions } from '@app/lib/posthog'

/** Minimal shape we read from the cached `/auth/me` response. */
interface MeResponse {
  user: { id: string; email: string | null; name: string; authType: string }
  organisations: Array<{ id: string; name: string; role: string }>
}

let initialized = false

/** Initialise the PostHog browser SDK once, on the client only. */
function ensureInit(): void {
  if (initialized || typeof window === 'undefined' || !POSTHOG_KEY) return
  posthog.init(POSTHOG_KEY, posthogOptions)
  initialized = true
}

/**
 * Wraps the app with PostHog (analytics, session replay, error tracking).
 *
 * - Page views are captured manually on every TanStack Router navigation so SPA
 *   transitions are tracked for both anonymous and authenticated visitors.
 * - The logged-in user is identified (and grouped by organisation) from the
 *   cached `/auth/me` response, without firing any extra network request.
 *
 * When `VITE_POSTHOG_KEY` is unset the app renders untouched (analytics off).
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  if (!POSTHOG_KEY) return <>{children}</>

  // Init before children mount so the very first $pageview isn't lost.
  ensureInit()

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      <PostHogIdentify />
      {children}
    </PHProvider>
  )
}

/** Captures a `$pageview` on every route change. */
function PostHogPageView() {
  const ph = usePostHog()
  const href = useRouterState({ select: (state) => state.location.href })

  useEffect(() => {
    ph?.capture('$pageview')
  }, [ph, href])

  return null
}

/**
 * Identifies the authenticated user from the React Query cache and groups events
 * by organisation. Resets identity on logout. The organisation group key is the
 * org id (same value as the URL `$orgSlug`), so it lines up with the backend's
 * organisation group analytics.
 */
function PostHogIdentify() {
  const ph = usePostHog()
  const queryClient = useQueryClient()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const identifiedId = useRef<string | null>(null)

  useEffect(() => {
    if (!ph) return

    const sync = () => {
      const me = queryClient
        .getQueriesData<MeResponse>({ queryKey: ['get', '/auth/me'] })
        .map(([, data]) => data)
        .find((data): data is MeResponse => !!data?.user?.id)

      if (me?.user?.id) {
        if (identifiedId.current !== me.user.id) {
          ph.identify(me.user.id, {
            email: me.user.email ?? undefined,
            name: me.user.name,
            auth_type: me.user.authType,
          })
          identifiedId.current = me.user.id
        }
        if (orgSlug) {
          const org = me.organisations?.find((o) => o.id === orgSlug)
          ph.group('organisation', orgSlug, org ? { name: org.name, role: org.role } : undefined)
        }
      } else if (identifiedId.current) {
        // Session ended (logout / expiry) — drop the identity.
        ph.reset()
        identifiedId.current = null
      }
    }

    sync()
    return queryClient.getQueryCache().subscribe(sync)
  }, [ph, queryClient, orgSlug])

  return null
}

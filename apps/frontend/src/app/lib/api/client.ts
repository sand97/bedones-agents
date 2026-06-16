import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './v1'
import { getStoredLocale } from '@app/i18n'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

const apiClient = createClient<paths>({
  baseUrl: API_URL,
  credentials: 'include', // send cookies automatically
})

/**
 * Middleware to send current language on every request via Accept-Language header.
 */
const localeMiddleware: Middleware = {
  async onRequest({ request }) {
    request.headers.set('Accept-Language', getStoredLocale())
    return request
  },
}

/**
 * Middleware to handle 401 responses globally.
 * Redirects to login page when session expires, preserving where the user was
 * headed via `return_to` so login can send them back after authenticating.
 */
const authMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.status === 401) {
      const publicPaths = ['/auth', '/invitation', '/legal']
      if (!publicPaths.some((p) => window.location.pathname.startsWith(p))) {
        const returnTo = window.location.pathname + window.location.search
        window.location.href = `/auth/login?return_to=${encodeURIComponent(returnTo)}`
      }
    }
    return response
  },
}

apiClient.use(localeMiddleware)
apiClient.use(authMiddleware)

export { apiClient }

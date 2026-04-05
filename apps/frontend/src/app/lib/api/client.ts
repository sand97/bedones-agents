import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './v1'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

const apiClient = createClient<paths>({
  baseUrl: API_URL,
  credentials: 'include', // send cookies automatically
})

/**
 * Middleware to send browser language on every request via Accept-Language header.
 */
const localeMiddleware: Middleware = {
  async onRequest({ request }) {
    const browserLang = navigator.language?.split('-')[0] || 'fr'
    const lang = browserLang === 'en' ? 'en' : 'fr'
    request.headers.set('Accept-Language', lang)
    return request
  },
}

/**
 * Middleware to handle 401 responses globally.
 * Redirects to login page when session expires.
 */
const authMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.status === 401) {
      const publicPaths = ['/auth', '/invitation', '/legal']
      if (!publicPaths.some((p) => window.location.pathname.startsWith(p))) {
        window.location.href = '/auth/login'
      }
    }
    return response
  },
}

apiClient.use(localeMiddleware)
apiClient.use(authMiddleware)

export { apiClient }

import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './v1'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

const apiClient = createClient<paths>({
  baseUrl: API_URL,
  credentials: 'include', // send cookies automatically
})

/**
 * Middleware to handle 401 responses globally.
 * Redirects to login page when session expires.
 */
const authMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.status === 401) {
      // Only redirect if not already on an auth page
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login'
      }
    }
    return response
  },
}

apiClient.use(authMiddleware)

export { apiClient }

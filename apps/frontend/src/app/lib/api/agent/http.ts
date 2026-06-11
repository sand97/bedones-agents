const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

/**
 * Typed API client for Agent, Catalog, Ticket, Promotion endpoints.
 * We use raw fetch via apiClient's baseUrl + credentials since
 * the openapi types (v1.d.ts) don't yet include these new endpoints.
 */

export async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Extracts a human-readable message from an error thrown by fetchJson
 * (format: `API error <status>: <body>`). Unwraps the NestJS error body
 * `{ message }` and any nested Meta Graph error `{ error: { message } }`.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Une erreur est survenue'): string {
  const raw = err instanceof Error ? err.message : String(err)
  const jsonStart = raw.indexOf('{')
  if (jsonStart !== -1) {
    try {
      const body = JSON.parse(raw.slice(jsonStart)) as { message?: unknown }
      const m = body.message
      const msg = Array.isArray(m) ? m.filter(Boolean).join(', ') : typeof m === 'string' ? m : ''
      // Unwrap nested "Meta API error: {\"error\":{\"message\":\"...\"}}"
      const metaStart = msg.indexOf('{')
      if (metaStart !== -1) {
        try {
          const meta = JSON.parse(msg.slice(metaStart)) as { error?: { message?: string } }
          if (meta.error?.message) return meta.error.message
        } catch {
          /* keep the outer message */
        }
      }
      if (msg) return msg
    } catch {
      /* fall through to raw */
    }
  }
  return raw || fallback
}

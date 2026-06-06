/**
 * Client for the MCP OAuth consent flow. The MCP authorize endpoint
 * (api-moderator…/mcp/oauth/authorize) redirects the user to the in-app consent
 * page (/mcp/authorize); that page collects the chosen organisation and posts
 * the decision here. The endpoint is intentionally outside the typed OpenAPI
 * surface (it is part of the OAuth handshake), so — like connectFacebookCatalog
 * — we call it with a credentialed fetch rather than `$api`.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

export interface McpAuthorizeParams {
  client_id: string
  redirect_uri: string
  state?: string
  scope?: string
  code_challenge?: string
  code_challenge_method?: string
}

export interface McpAuthorizeDecisionInput extends McpAuthorizeParams {
  organisationId: string
}

/**
 * Approve the connection for a given organisation and get back the URL the
 * browser must navigate to so the AI client (ChatGPT / Claude) receives its
 * authorization code.
 */
export async function submitMcpAuthorizeDecision(
  input: McpAuthorizeDecisionInput,
): Promise<string> {
  const res = await fetch(`${API_URL}/mcp/oauth/authorize/decision`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    let error = 'authorization_failed'
    try {
      error = ((await res.json()) as { error?: string }).error ?? error
    } catch {
      /* ignore non-JSON body */
    }
    throw new Error(error)
  }

  const data = (await res.json()) as { redirectUrl: string }
  return data.redirectUrl
}

/**
 * Rebuild the backend authorize URL from the consent params — used to bounce an
 * unauthenticated visitor through login (?return_to=…) and back into the flow.
 */
export function buildMcpAuthorizeUrl(params: McpAuthorizeParams): string {
  const search = new URLSearchParams()
  search.set('client_id', params.client_id)
  search.set('redirect_uri', params.redirect_uri)
  if (params.state) search.set('state', params.state)
  if (params.scope) search.set('scope', params.scope)
  if (params.code_challenge) search.set('code_challenge', params.code_challenge)
  if (params.code_challenge_method)
    search.set('code_challenge_method', params.code_challenge_method)
  return `${API_URL}/mcp/oauth/authorize?${search.toString()}`
}

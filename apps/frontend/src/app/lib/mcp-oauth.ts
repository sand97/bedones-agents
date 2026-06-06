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
 * Approve the connection for a given organisation by submitting a real,
 * full-page form POST to the backend decision endpoint. The backend then
 * issues a server-side 302 to the AI client's redirect_uri — the final hop that
 * OAuth clients (ChatGPT / Claude) track to complete the connection. A
 * client-side fetch + JS navigation breaks that detection, so we deliberately
 * use a top-level navigation here (and build the form imperatively to keep the
 * session cookie and avoid raw markup in the page).
 */
export function submitMcpAuthorizeDecision(input: McpAuthorizeDecisionInput): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `${API_URL}/mcp/oauth/authorize/decision`

  const addField = (name: string, value?: string) => {
    if (value == null) return
    const field = document.createElement('input')
    field.type = 'hidden'
    field.name = name
    field.value = value
    form.appendChild(field)
  }

  addField('client_id', input.client_id)
  addField('redirect_uri', input.redirect_uri)
  addField('state', input.state)
  addField('scope', input.scope)
  addField('code_challenge', input.code_challenge)
  addField('code_challenge_method', input.code_challenge_method)
  addField('organisationId', input.organisationId)

  document.body.appendChild(form)
  form.submit()
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

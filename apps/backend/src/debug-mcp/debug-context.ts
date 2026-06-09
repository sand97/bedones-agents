/**
 * The debug MCP is HARD-PINNED to a single organisation via `DEBUG_MCP_ORG_ID`.
 * Every tool resolves the org through this helper — NEVER from a token claim or
 * a tool argument — so cross-org access is structurally impossible and no data
 * can leak from another company.
 */
export function debugOrgId(): string {
  const org = process.env.DEBUG_MCP_ORG_ID
  if (!org) {
    throw new Error('DEBUG_MCP_ORG_ID is not configured — the debug MCP refuses to run unscoped.')
  }
  return org
}

/** The debug MCP is OFF unless explicitly enabled at deploy time. */
export function isDebugMcpEnabled(): boolean {
  return process.env.DEBUG_MCP_ENABLED === 'true'
}

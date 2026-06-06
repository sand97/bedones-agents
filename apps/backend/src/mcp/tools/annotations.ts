import type { ToolAnnotations } from '@rekog/mcp-nest'

/**
 * MCP tool behaviour hints (required by the ChatGPT Apps SDK review): every tool
 * must declare readOnlyHint / destructiveHint / openWorldHint.
 *
 * - readOnlyHint:    the tool does not modify any state.
 * - destructiveHint: the tool may perform irreversible changes (only meaningful
 *                    when readOnlyHint is false).
 * - openWorldHint:   the tool reaches an external/open system (social platform
 *                    APIs) rather than only Bedones' own database.
 */

/** Read-only, internal (DB) lookups. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
}

/** Writes only to Bedones' own database (no external side effects). */
export const WRITE_INTERNAL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
}

/** Non-destructive write that also hits an external platform (send, sync, …). */
export const WRITE_EXTERNAL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
}

/** Irreversible write that also hits an external platform (delete, …). */
export const DESTRUCTIVE_EXTERNAL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
}

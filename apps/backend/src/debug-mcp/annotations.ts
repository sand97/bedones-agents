import type { ToolAnnotations } from '@rekog/mcp-nest'

/** Read-only DB / Qdrant lookups (org-scoped, sensitive fields masked). */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
}

/**
 * Runs the live agent for real (LLM + real read-only DB/Qdrant) but persists
 * NOTHING: outbound messages are captured, DB writes are intercepted. Marked as
 * non-read-only + open-world because it reaches the LLM provider.
 */
export const DRY_RUN_AGENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
}

/** Writes to Bedones' own database only (debug seeding). */
export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
}

/** Write that also reaches an external system (embeddings + Qdrant). */
export const WRITE_EXTERNAL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
}

export function withTitle(title: string, base: ToolAnnotations): ToolAnnotations {
  return { ...base, title }
}

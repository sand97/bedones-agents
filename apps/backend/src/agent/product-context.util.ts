/**
 * Group items by their (identical) context content, preserving the order in
 * which each distinct content first appears. Lets a context shared by several
 * products be rendered ONCE for the agent instead of repeated per product —
 * used both for the search_products output and the system-prompt section that
 * re-injects the context of products already discussed in the conversation.
 */
export function groupByContent<T>(
  entries: Array<{ item: T; content: string }>,
): Array<{ content: string; items: T[] }> {
  const groups = new Map<string, T[]>()
  for (const { item, content } of entries) {
    const existing = groups.get(content)
    if (existing) existing.push(item)
    else groups.set(content, [item])
  }
  return [...groups].map(([content, items]) => ({ content, items }))
}

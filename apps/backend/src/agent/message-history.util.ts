/**
 * Render a stored DirectMessage as one line of text for the agent's conversation
 * history (and for the current incoming message). Orders and product messages
 * carry their products in `metadata`, not in the text field — so without this the
 * agent only sees an empty "[order]" and can't tell what the customer ordered.
 */
interface DescribableItem {
  productRetailerId?: string
  name?: string | null
  quantity?: number
  itemPrice?: number
  currency?: string | null
}

interface DescribableMeta {
  kind?: string
  items?: DescribableItem[]
  total?: number
  currency?: string | null
}

export function describeMessageForAgent(
  message: string | null,
  mediaType: string | null,
  metadata: unknown,
): string {
  const text = (message ?? '').trim()
  const meta = metadata && typeof metadata === 'object' ? (metadata as DescribableMeta) : null
  const items = Array.isArray(meta?.items) ? meta.items : []

  // Customer order (WhatsApp cart): name every product + quantity + total so the
  // agent reacts to the actual order instead of an empty message.
  if (mediaType === 'order' && items.length > 0) {
    const lines = items.map((it) => {
      const name = it.name || it.productRetailerId || 'produit'
      const qty = it.quantity ?? 1
      const price =
        it.itemPrice != null
          ? ` à ${it.itemPrice} ${it.currency || meta?.currency || ''}`.trimEnd()
          : ''
      return `${name} (${it.productRetailerId ?? '?'}) ×${qty}${price}`
    })
    const total =
      meta?.total != null ? ` — total ${meta.total} ${meta?.currency || ''}`.trimEnd() : ''
    return `${text ? `${text} ` : ''}[Commande reçue: ${lines.join(', ')}${total}]`
  }

  // Products the page sent (catalog / carousel / list): name them too.
  if (items.length > 0) {
    const names = items.map((it) => it.name || it.productRetailerId).filter(Boolean)
    const label = text || '[Produits envoyés]'
    return names.length > 0 ? `${label} (produits : ${names.join(', ')})` : label
  }

  if (text) return text
  return mediaType ? `[${mediaType}]` : ''
}

/**
 * Extract the structured product references a stored message carries in its
 * `metadata` — the exact retailer ids of products the page SENT (catalog / list
 * cards) or the customer ORDERED (cart). Free text is intentionally ignored: only
 * these exact ids are reliable enough to re-attach a product's merchant context.
 */
export function extractProductRefs(
  metadata: unknown,
): Array<{ retailerId: string; name?: string }> {
  const meta = metadata && typeof metadata === 'object' ? (metadata as DescribableMeta) : null
  const items = Array.isArray(meta?.items) ? meta.items : []
  const refs: Array<{ retailerId: string; name?: string }> = []
  for (const it of items) {
    if (typeof it.productRetailerId === 'string' && it.productRetailerId) {
      refs.push({ retailerId: it.productRetailerId, name: it.name ?? undefined })
    }
  }
  return refs
}

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
  /**
   * Products an agent text message is ABOUT — it discussed/confirmed/asked about
   * them without sending a card. Set by reply_to_message so the conversation can
   * re-attach their merchant context (sizes, rules) on later turns, even though
   * no product card was sent.
   */
  aboutProducts?: Array<{ retailerId?: string; name?: string | null }>
}

/** A message the current one is replying to (WhatsApp quote / context). */
export interface QuotedMessage {
  message: string | null
  mediaType: string | null
  metadata: unknown
}

export function describeMessageForAgent(
  message: string | null,
  mediaType: string | null,
  metadata: unknown,
  quoted?: QuotedMessage | null,
): string {
  const base = describeMessageBody(message, mediaType, metadata)
  // When the customer quotes a previous message (e.g. taps "reply" on a product
  // card and writes "celle-ci" / "la même couleur"), the bare text is meaningless
  // without the quoted product. Surface it — with its retailer id — so the agent
  // knows EXACTLY which product is referenced instead of asking again in a loop.
  if (quoted) {
    const quotedText = describeMessageBody(quoted.message, quoted.mediaType, quoted.metadata)
    if (quotedText) {
      return base ? `${base} [en réponse à : ${quotedText}]` : `[en réponse à : ${quotedText}]`
    }
  }
  return base
}

function describeMessageBody(
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

  // Products the page sent (catalog / carousel / list): name them AND carry their
  // retailer id. Without the id the agent cannot re-send the exact product or
  // re-attach its merchant context when the customer refers back to it.
  if (items.length > 0) {
    const names = items
      .map((it) =>
        it.name
          ? it.productRetailerId
            ? `${it.name} (${it.productRetailerId})`
            : it.name
          : it.productRetailerId,
      )
      .filter(Boolean)
    const label = text || '[Produits envoyés]'
    return names.length > 0 ? `${label} (produits : ${names.join(', ')})` : label
  }

  if (text) return text
  return mediaType ? `[${mediaType}]` : ''
}

/**
 * Extract the structured product references a stored message carries in its
 * `metadata` — the exact retailer ids of products the page SENT (catalog / list
 * cards), the customer ORDERED (cart), or that an agent text reply was explicitly
 * ABOUT (`aboutProducts`). Free text is intentionally ignored: only these exact
 * ids are reliable enough to re-attach a product's merchant context.
 */
export function extractProductRefs(
  metadata: unknown,
): Array<{ retailerId: string; name?: string }> {
  const meta = metadata && typeof metadata === 'object' ? (metadata as DescribableMeta) : null
  const refs: Array<{ retailerId: string; name?: string }> = []
  for (const it of Array.isArray(meta?.items) ? meta.items : []) {
    if (typeof it.productRetailerId === 'string' && it.productRetailerId) {
      refs.push({ retailerId: it.productRetailerId, name: it.name ?? undefined })
    }
  }
  // Products an agent reply flagged as its subject without sending a card.
  for (const a of Array.isArray(meta?.aboutProducts) ? meta.aboutProducts : []) {
    if (typeof a.retailerId === 'string' && a.retailerId) {
      refs.push({ retailerId: a.retailerId, name: a.name ?? undefined })
    }
  }
  return refs
}

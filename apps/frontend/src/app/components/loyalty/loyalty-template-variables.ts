/**
 * Shared variable definitions for WhatsApp loyalty campaign templates.
 *
 * The user writes the body with human-readable tokens (e.g. `[Nom du client]`).
 * Internally, each token maps to a Meta-friendly key (e.g. `customer_name`)
 * which is what gets substituted at send-time when interpolating against the
 * customer's data.
 */

export interface TemplateVariable {
  /** Stable internal key sent to Meta (snake_case ASCII). */
  key: string
  /** Human-readable token shown inside the body, e.g. "Nom du client". */
  token: string
  /** Tooltip description. */
  description: string
  /** Example value to illustrate the variable. */
  example: string
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    key: 'customer_name',
    token: 'Nom du client',
    description: 'Le prénom ou nom complet enregistré dans la fiche contact.',
    example: 'Marie Dupont',
  },
  {
    key: 'amount',
    token: 'Montant dépensé',
    description: 'Total cumulé dépensé par le client sur la période de la promo.',
    example: '45 000 FCFA',
  },
  {
    key: 'product_name',
    token: 'Nom du produit',
    description: 'Nom du produit gagné en récompense ou rendant éligible au bonus.',
    example: 'Sac à main cuir noir',
  },
  {
    key: 'order_count',
    token: 'Nombre de commandes',
    description: 'Nombre total de commandes passées par le client.',
    example: '7',
  },
  {
    key: 'orders_left',
    token: 'Commandes restantes',
    description: "Nombre de commandes qu'il reste au client pour débloquer le bonus.",
    example: '2',
  },
  {
    key: 'reward_value',
    token: 'Valeur du bonus',
    description: 'Valeur de la récompense (montant en FCFA ou pourcentage).',
    example: '5 000 FCFA ou 20%',
  },
]

const TOKEN_TO_VAR = new Map(TEMPLATE_VARIABLES.map((v) => [v.token, v]))
const KEY_TO_VAR = new Map(TEMPLATE_VARIABLES.map((v) => [v.key, v]))

/**
 * Replace human tokens like `[Nom du client]` with Meta named placeholders
 * like `{{customer_name}}` (what Meta actually wants in template bodies).
 * Unknown tokens are left untouched.
 */
export function tokensToMetaPlaceholders(body: string): string {
  return body.replace(/\[([^[\]]+)\]/g, (match, raw) => {
    const v = TOKEN_TO_VAR.get(String(raw).trim())
    return v ? `{{${v.key}}}` : match
  })
}

/**
 * Reverse of `tokensToMetaPlaceholders`: turn `{{customer_name}}` back into
 * `[Nom du client]` so users see human-readable text. Unknown placeholders
 * are left as-is.
 */
export function metaPlaceholdersToTokens(body: string): string {
  return body.replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => {
    const v = KEY_TO_VAR.get(String(key).trim())
    return v ? `[${v.token}]` : match
  })
}

/**
 * Replace human tokens in the body with their example value, so a preview
 * shows what a real customer would receive. Unknown tokens stay as-is.
 */
export function interpolateExamples(body: string): string {
  return body.replace(/\[([^[\]]+)\]/g, (match, raw) => {
    const v = TOKEN_TO_VAR.get(String(raw).trim())
    return v ? v.example : match
  })
}

/** Minimal bonus shape needed by the compatibility checker. */
export interface BonusVariableContext {
  rewardType: 'PRODUCTS' | 'CREDIT' | 'PERCENT'
  targetSpend: number | null
  targetOrderCount: number | null
  targetProductsCount: number | null
  triggerProducts: { product: { id: string } }[]
  rewardProducts: { product: { id: string } }[]
}

export interface VariableCompatibilityIssue {
  /** Internal key (e.g. customer_name) */
  key: string
  /** Human token (e.g. "Nom du client") */
  token: string
  /** Why this variable can't be filled by the chosen bonus. */
  reason: string
}

/**
 * Check that every variable referenced by the template can actually be
 * resolved with data from the chosen bonus. Returns the list of
 * incompatible variables; empty list means everything lines up.
 */
export function findIncompatibleTemplateVariables(
  templateVariableKeys: string[],
  bonus: BonusVariableContext,
): VariableCompatibilityIssue[] {
  const issues: VariableCompatibilityIssue[] = []

  const bonusInvolvesProducts =
    bonus.rewardType === 'PRODUCTS' ||
    bonus.rewardProducts.length > 0 ||
    bonus.triggerProducts.length > 0 ||
    bonus.targetProductsCount !== null

  for (const key of templateVariableKeys) {
    const v = KEY_TO_VAR.get(key)
    if (!v) continue // unknown placeholder (e.g. {{1}} from Meta) — skip

    if (key === 'product_name' && !bonusInvolvesProducts) {
      issues.push({
        key,
        token: v.token,
        reason: "Le bonus n'inclut aucun produit (offert ou déclencheur).",
      })
    }
    if (key === 'reward_value' && bonus.rewardType !== 'CREDIT' && bonus.rewardType !== 'PERCENT') {
      issues.push({
        key,
        token: v.token,
        reason: 'Le bonus offre des produits, pas une valeur ni un pourcentage.',
      })
    }
    if (key === 'orders_left' && bonus.targetOrderCount === null) {
      issues.push({
        key,
        token: v.token,
        reason: "Le bonus ne définit pas d'objectif basé sur le nombre de commandes.",
      })
    }
    if (key === 'amount' && bonus.targetSpend === null) {
      issues.push({
        key,
        token: v.token,
        reason: "Le bonus ne définit pas d'objectif basé sur le montant dépensé.",
      })
    }
  }

  return issues
}

/** Extract `[...]` tokens from the body. */
export function extractBodyTokens(body: string): string[] {
  const matches = body.matchAll(/\[([^[\]]+)\]/g)
  return Array.from(matches, (m) => m[1].trim())
}

/** Tokens used in the body that don't match any known variable. */
export function findUnknownTokens(body: string): string[] {
  return extractBodyTokens(body).filter((token) => !TOKEN_TO_VAR.has(token))
}

/** Internal keys (e.g. customer_name) deduced from the tokens used in the body. */
export function bodyToVariableKeys(body: string): string[] {
  const tokens = extractBodyTokens(body)
  const keys = new Set<string>()
  for (const token of tokens) {
    const v = TOKEN_TO_VAR.get(token)
    if (v) keys.add(v.key)
  }
  return Array.from(keys)
}

/**
 * Normalize a template name to satisfy Meta's constraints:
 * lowercase ASCII letters, digits and underscores; spaces become underscores;
 * accents stripped; max 512 chars.
 */
export function formatTemplateName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks (accents)
    .replace(/[^a-z0-9_\s-]/g, '') // drop disallowed chars
    .trim()
    .replace(/[\s-]+/g, '_') // spaces/dashes → underscore
    .replace(/_+/g, '_')
    .slice(0, 512)
}

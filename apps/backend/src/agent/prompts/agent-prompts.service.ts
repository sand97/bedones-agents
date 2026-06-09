import { Injectable } from '@nestjs/common'

interface CatalogInfo {
  name: string
  description?: string | null
  productCount: number
  products?: Array<{ name: string; description?: string | null }>
}

interface SocialAccountInfo {
  provider: string
  pageName?: string | null
  pageAbout?: string | null
  username?: string | null
  metadata?: unknown
}

interface EvaluationInput {
  catalogs: CatalogInfo[]
  socialAccounts: SocialAccountInfo[]
  existingContext?: string | null
  score: number
}

@Injectable()
export class AgentPromptsService {
  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  private getWhatsAppBusinessProfile(metadata: unknown): Record<string, unknown> {
    const root = this.asRecord(metadata)
    const whatsapp = this.asRecord(root.whatsapp)
    return this.asRecord(whatsapp.businessProfile)
  }

  private formatSocialAccountDescription(account: SocialAccountInfo): string {
    const name = account.pageName || account.username || 'N/A'
    const details: string[] = []

    if (account.pageAbout) details.push(`Resume: ${account.pageAbout}`)

    const businessProfile = this.getWhatsAppBusinessProfile(account.metadata)
    const description = this.asString(businessProfile.description)
    const about = this.asString(businessProfile.about)
    const address = this.asString(businessProfile.address)
    const vertical = this.asString(businessProfile.vertical)
    const messagingProduct = this.asString(businessProfile.messagingProduct)
    const websites = Array.isArray(businessProfile.websites)
      ? businessProfile.websites
          .map((url) => this.asString(url))
          .filter((url): url is string => Boolean(url))
      : []

    if (description && description !== account.pageAbout)
      details.push(`Description: ${description}`)
    if (about && about !== account.pageAbout && about !== description)
      details.push(`A propos: ${about}`)
    if (address) details.push(`Adresse: ${address}`)
    if (vertical) details.push(`Categorie Meta: ${vertical}`)
    if (messagingProduct) details.push(`Produit de messagerie: ${messagingProduct}`)
    if (websites.length > 0) details.push(`Sites: ${websites.join(', ')}`)

    if (details.length === 0) return `- ${account.provider}: ${name}`
    return `- ${account.provider}: ${name}\n${details.map((detail) => `  - ${detail}`).join('\n')}`
  }

  /**
   * Build the initial evaluation prompt when catalogs are analyzed
   * and the agent starts the onboarding conversation.
   */
  buildInitialEvaluationPrompt(input: EvaluationInput): string {
    const { catalogs, socialAccounts, existingContext, score } = input

    const catalogDescriptions = catalogs
      .map((c) => {
        const desc = c.description ? `\nDescription: ${c.description}` : ''
        const productList =
          c.products && c.products.length > 0
            ? `\nExemples de produits:\n${c.products.map((p) => `  • ${p.name}${p.description ? ` — ${p.description}` : ''}`).join('\n')}`
            : ''
        return `- ${c.name} (${c.productCount} produits)${desc}${productList}`
      })
      .join('\n')

    const socialDescriptions = socialAccounts
      .map((s) => this.formatSocialAccountDescription(s))
      .join('\n')

    return `Tu es un assistant IA qui aide les entrepreneurs à configurer leur agent conversationnel.

## Contexte de l'entreprise

### Catalogues:
${catalogDescriptions || 'Aucun catalogue disponible'}

### Réseaux sociaux:
${socialDescriptions || 'Aucun réseau social connecté'}

${existingContext ? `### Contexte existant:\n${existingContext}\n` : ''}

## Score actuel: ${score}/100

## Ton objectif

Tu dois comprendre le business de l'utilisateur pour configurer un agent qui répondra à ses clients.
Pose des questions courtes et précises (2-3 phrases max, style WhatsApp).
Une seule question à la fois.

## Catégories à évaluer (et leur poids):

1. **Informations de base** (5-10%): Nom, activité, localisation
2. **Politique commerciale** (15%): Prix, modes de paiement, conditions
3. **Opérations** (10%): Livraison, délais, zones
4. **Processus de vente** (15%): Comment se passe une commande type
5. **Service client** (15%): FAQ, réclamations, retours
6. **Limites de l'IA** (10%): Ce que l'agent ne doit PAS faire
7. **Politique retours** (8%): Conditions de retour/échange
8. **Confirmation de commande** (10%): Comment confirmer une commande
9. **Gestion des tickets** (7%): Quand créer un ticket, quels statuts

## Règles:
- Utilise les infos des catalogues et pages pour ne pas poser de questions redondantes
- Propose des QCM quand c'est pertinent (max 4 options)
- Sois direct et professionnel, pas de bavardage
- Ne mentionne pas que tu es une IA
- Réponds en français

## Format de réponse (JSON strict):
\`\`\`json
{
  "score": <number 0-100>,
  "context": "<markdown du contexte business mis à jour>",
  "needs": ["<catégorie manquante 1>", "..."],
  "question": "<ta prochaine question>",
  "questionType": "text" | "mcq" | "scq",
  "options": ["option1", "option2"] // seulement pour mcq/scq
}
\`\`\``
  }

  /**
   * Build the conversation prompt for ongoing onboarding.
   */
  buildConversationPrompt(input: EvaluationInput & { messageHistory: string }): string {
    return `${this.buildInitialEvaluationPrompt(input)}

## Historique de la conversation:
${input.messageHistory}

## Instructions supplémentaires:
- Analyse la réponse de l'utilisateur et mets à jour le contexte
- Recalcule le score en fonction des nouvelles infos
- Pose la prochaine question la plus stratégique
- Si le score >= 80, félicite l'utilisateur mais propose de continuer pour améliorer`
  }

  /**
   * Build the system prompt for the active agent processing messages.
   */
  buildAgentSystemPrompt(context: string, socialAccounts: SocialAccountInfo[]): string {
    const socialInfo = socialAccounts.map((s) => this.formatSocialAccountDescription(s)).join('\n')

    return `Tu es un assistant IA professionnel pour une entreprise.

## Réseaux sociaux gérés:
${socialInfo || 'Aucun réseau social connecté'}

## Contexte business:
${context}

## Règles:
- Sois poli, professionnel et concis (max 2 phrases courtes)
- Moins de 150 caractères pour les réponses
- Pas d'emojis, pas de jargon
- Utilise UNIQUEMENT les outils disponibles quand c'est pertinent
- Utilise TOUJOURS l'outil reply_to_message pour répondre au client
- Termine ton tour immédiatement après reply_to_message
- Ne mentionne pas que tu es une IA
- Évite les conversations hors-sujet (max 2 messages avant de rediriger)
- Horodatage actuel: ${new Date().toISOString()}`
  }

  /**
   * Build the system prompt for the live AI agent processing incoming messages.
   */
  buildLiveAgentSystemPrompt(input: {
    agentContext: string
    labels: Array<{ id: string; name: string; color: string }>
    provider: string
    canSendProducts?: boolean
    canSendButtons?: boolean
    contactNotes?: Array<{ category?: string | null; content: string }>
  }): string {
    const { agentContext, labels, provider, canSendProducts, canSendButtons, contactNotes } = input
    const nowIso = new Date().toISOString()

    const contactNotesContext =
      contactNotes && contactNotes.length > 0
        ? `\n\n## What we already know about this customer\nReuse this instead of asking again:\n${contactNotes
            .map((n) => `- ${n.category ? `[${n.category}] ` : ''}${n.content}`)
            .join('\n')}\n`
        : ''

    const buttonRules = canSendButtons
      ? `\n## Proposal Buttons
When the answer is a small closed set (payment method, delivery option, sizes, yes/no…), call \`send_buttons\` with up to 3 short labelled buttons instead of asking in plain text. Keep labels under 20 characters. Do NOT also call reply_to_message in the same turn — send_buttons already delivers the message.
`
      : ''

    const labelsContext =
      labels.length > 0
        ? `\n\n## Available Labels\n${labels.map((l, i) => `${i + 1}. ${l.name} (id: ${l.id})`).join('\n')}\n`
        : '\n\n## Available Labels\nNo labels configured.\n'

    const productSendRules = canSendProducts
      ? `\n## Product Send Rules (WhatsApp)
You can send products to the customer via the send_products tool. Unless the admin context above overrides these defaults, pick the \`format\` by product count:
- **1-3 products** → use \`format: "product"\`. Our service will send each product as its own native single-product message (up to 3 in a row). Best when you want to highlight each item individually.
- **4-10 products** → use \`format: "carousel"\`. Swipeable cards, one per product. Best for a visual selection among a small set.
- **More than 10 products** → use \`format: "product_list"\`. A single sectioned list (up to 30). \`headerText\` is required for this format.

Put your accompanying text in \`bodyText\` — send_products already delivers the message to the customer. Do NOT also call reply_to_message in the same turn.

Always respect any custom product-sending rule defined in the admin context above (it takes precedence over these defaults).
`
      : ''

    return `${agentContext}

## Current Date and Time
Current datetime (ISO 8601, UTC): ${nowIso}

## Platform
This conversation is on: ${provider}
${contactNotesContext}${labelsContext}${productSendRules}${buttonRules}

# Role: AI Business Assistant

## Mission
You are a professional assistant helping manage client conversations.
Your goals:
1. Respond to client messages naturally and professionally.
2. Collect relevant information about the client's needs.
3. Classify contacts using labels.
4. Guide clients toward relevant products when appropriate.

Stay within a business-only context.

## Communication Style
- Be polite, respectful, and professional.
- Sound human and natural, not robotic.
- Be concise: max 2 short sentences per reply.
- Keep replies under 150 characters when possible.
- Do not use emojis.
- Use polite expressions ("Please", "Thank you") when appropriate.

## Conversation Rules
- Ask only one question at a time.
- If info is missing, ask gradually, step by step.
- Do not allow off-topic conversation beyond 2 messages.
- Redirect politely to business purpose.
- Do not ask for information already in conversation history.

## Product and Catalog Rules
- Only send products when it makes sense.
- Do not call search_products for greetings, smalltalk or vague openers — first get a concrete product, category or need from the customer.
- Prefer a clarifying question before sending products if the need is unclear.
- Keep product messages short, explain briefly why they are relevant.

## Labels
- Use available labels to classify conversations.
- Add or update labels based on conversation progress.

## Tool Usage (Critical)
- ALWAYS use reply_to_message for every client-facing response (unless you used send_buttons or send_products, which already send the message).
- After a successful reply_to_message, send_buttons or send_products, end your turn immediately.
- Whenever the customer shares reusable personal info (delivery address, phone to call, sizes, preferences), call save_contact_note so you remember it next time.
- Prefer a single tool call per turn.
- Only use information-gathering tools when the provided context is insufficient.
- Be economical with tool calls. If a tool returns an error, do NOT retry it with the same arguments — fix the cause or simply reply to the customer. Never chain more than a handful of tool calls in one turn.
- The client must never know you are using tools.

## Restrictions
- Do not mention you are an AI.
- Do not make assumptions without confirmation.
- Do not ask multiple questions in one message.
- Do not use emojis.
- Do not send irrelevant products.

## Language
Always respond in the user's language.`
  }

  /**
   * Build the system prompt for the feedback loop.
   *
   * When an operator flags an AI response as incorrect, we call this prompt to
   * either (a) refine the agent's business context so future replies are better,
   * or (b) ask a clarifying question when the feedback is ambiguous or incomplete.
   *
   * The model must answer in a structured JSON shape — schema enforced at call
   * site via `withStructuredOutput`.
   */
  buildFeedbackSystemPrompt(input: {
    agentContext: string
    originalMessage: string
    customerMessage?: string | null
  }): string {
    const { agentContext, originalMessage, customerMessage } = input
    const customerBlock = customerMessage
      ? `\n\n## Message client d'origine (ce à quoi l'agent répondait)\n${customerMessage}`
      : ''

    return `Tu es un superviseur IA qui aide un opérateur à améliorer le contexte business d'un agent conversationnel.
Quand l'opérateur signale qu'une réponse de l'agent n'est pas correcte, tu analyses le feedback et tu décides :
- si le feedback est clair et actionnable → tu proposes un **nouveau contexte** (amélioré, complet, en markdown) et un message de succès à afficher à l'opérateur,
- si le feedback est ambigu, incomplet (phrase tronquée, information manquante) ou contradictoire → tu poses **UNE seule question de clarification** courte et précise (style WhatsApp, max 2 phrases).

## Règles
- Ne réécris pas le contexte de zéro : intègre les modifications dans le contexte existant, en préservant ce qui reste pertinent.
- Pose une question de clarification si tu ne comprends pas, si la phrase est incomplète, ou si plusieurs interprétations sont possibles.
- Si le feedback mentionne un ton / un format / une information à ajouter, intègre-le explicitement dans le contexte.
- Reste en français sauf si l'opérateur écrit dans une autre langue.
- Le message de succès doit être court (1 phrase) et confirmer ce qui a été mis à jour.

## Contexte business actuel de l'agent
${agentContext || "(vide — aucun contexte configuré pour l'instant)"}

## Réponse de l'agent signalée comme incorrecte
${originalMessage}${customerBlock}

## Format de sortie
Tu dois répondre avec l'outil structuré fourni. Deux modes possibles :
- \`mode: "complete"\` → fournis \`newContext\` (contexte complet mis à jour) et \`successMessage\` (confirmation courte).
- \`mode: "clarify"\` → fournis \`question\` (une seule question courte).`
  }

  /**
   * Build prompt for catalog analysis.
   */
  buildCatalogAnalysisPrompt(
    products: Array<{ name: string; description?: string | null }>,
  ): string {
    const productList = products
      .slice(0, 50) // Limit to first 50 products
      .map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ''}`)
      .join('\n')

    return `Analyse ce catalogue de produits et génère une description concise (2-3 phrases) de ce que contient ce catalogue.
La description doit aider à comprendre le type d'entreprise et ses produits.

## Produits:
${productList}

Réponds uniquement avec la description, sans préambule.`
  }
}

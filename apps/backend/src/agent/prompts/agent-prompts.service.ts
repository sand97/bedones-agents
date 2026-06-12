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
    postOrigin?: {
      headline?: string | null
      body?: string | null
      product?: {
        name: string
        price?: number
        currency?: string
        source: 'post-link' | 'semantic'
      } | null
    } | null
  }): string {
    const {
      agentContext,
      labels,
      provider,
      canSendProducts,
      canSendButtons,
      contactNotes,
      postOrigin,
    } = input
    const nowIso = new Date().toISOString()

    const postOriginContext = postOrigin ? this.buildPostOriginContext(postOrigin) : ''

    const contactNotesContext =
      contactNotes && contactNotes.length > 0
        ? `\n\n## What we already know about this customer\nReuse this instead of asking again:\n${contactNotes
            .map((n) => `- ${n.category ? `[${n.category}] ` : ''}${n.content}`)
            .join('\n')}\n`
        : ''

    const buttonRules = canSendButtons
      ? `\n## Proposal Buttons
When the answer is a small closed set (payment method, delivery option, sizes, yes/no…), call \`send_buttons\` with up to 3 short labelled buttons instead of asking in plain text. Keep labels under 20 characters. Do NOT also call reply_to_message in the same turn — send_buttons already delivers the message.
NEVER use send_buttons to propose, list or show products — buttons are only for closed-set choices. To show products, always use send_products.
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

To show or propose a product, ALWAYS use send_products — it displays the image, name and price. Never just describe a product in a text reply, and never offer products as buttons.
Only ever send products that exist: use the EXACT retailer ids returned by search_products. NEVER invent, guess or alter a retailer id, and never mention a product you have not found via search_products — search first.
Put your accompanying text in \`bodyText\` — send_products already delivers the message to the customer. Do NOT also call reply_to_message in the same turn.

Always respect any custom product-sending rule defined in the admin context above (it takes precedence over these defaults).
`
      : ''

    return `${agentContext}

## Current Date and Time
Current datetime (ISO 8601, UTC): ${nowIso}

## Platform
This conversation is on: ${provider}
${postOriginContext}${contactNotesContext}${labelsContext}${productSendRules}${buttonRules}

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
- Search BEFORE you promise. Never propose, mention or imply an alternative, a cheaper option, "other models", a complement, or anything beyond what the customer already asked for until search_products has CONFIRMED a concrete matching product exists (right type, and within any budget/constraint they gave). Never say "we also have…" or "other models in your budget" on faith.
- When nothing viable exists, pivot — never invent. If the search finds no product matching that new direction (e.g. nothing within the customer's budget), do NOT make up products, prices or offer unrelated items. Stay on the product they were interested in and reinforce its value: quality and durability make a good piece a better investment than re-buying a cheap one every year.
- Record a confirmed-but-pending plan. When search confirms a viable option but sending it depends on the customer's next reply, call save_contact_note with the plan AND the retailer id — e.g. "Proposer la veste noire (RID123) si le client accepte de voir d'autres vestes." The next turn reads it and knows exactly what to send if they agree.

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
   * Section injected when the customer opened the chat from one of our social posts.
   * Gives the agent the post's text and, when resolved, the product it was about, so
   * a vague opener like "more info on this?" can be answered without re-asking.
   */
  private buildPostOriginContext(postOrigin: {
    headline?: string | null
    body?: string | null
    product?: {
      name: string
      price?: number
      currency?: string
      source: 'post-link' | 'semantic'
    } | null
  }): string {
    const lines: string[] = [
      '\n\n## Message Origin (Social Post)',
      'This customer started the conversation directly from one of your social media posts. When they say "this", "ça", "ceci" or "ce produit", they almost certainly mean what the post was about — do not ask which product unless they clearly switch topic.',
    ]

    if (postOrigin.headline) lines.push(`Post title: ${postOrigin.headline}`)
    if (postOrigin.body) lines.push(`Post caption: "${postOrigin.body}"`)

    const product = postOrigin.product
    if (product) {
      const price =
        typeof product.price === 'number'
          ? ` — ${product.price}${product.currency ? ` ${product.currency}` : ''}`
          : ''
      const lead =
        product.source === 'post-link'
          ? 'This post is linked to this catalog product:'
          : 'This post most likely refers to this catalog product:'
      lines.push(`${lead} ${product.name}${price}. Use send_products to show it when relevant.`)
    }

    return `${lines.join('\n')}\n`
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

  /**
   * System prompt for the dedicated, asynchronous ticket agent. It reads the
   * conversation + the conversation's open tickets and decides ONE action:
   * create (new request), update (same request as an existing ticket) or noop.
   */
  buildTicketAgentPrompt(input: {
    agentContext: string
    existingTickets: Array<{
      id: string
      title: string
      description?: string | null
      priority: string
    }>
    availableProducts?: Array<{ retailerId: string; name: string | null }>
    contactNotes?: Array<{ category?: string | null; content: string }>
  }): string {
    const ticketsBlock =
      input.existingTickets.length > 0
        ? input.existingTickets
            .map(
              (t) =>
                `- id: ${t.id} | titre: ${t.title} | priorité: ${t.priority}${t.description ? ` | ${t.description}` : ''}`,
            )
            .join('\n')
        : '(aucun ticket ouvert pour cette conversation)'

    const productsBlock =
      input.availableProducts && input.availableProducts.length > 0
        ? input.availableProducts
            .map((p) => `- retailerId: ${p.retailerId}${p.name ? ` | ${p.name}` : ''}`)
            .join('\n')
        : '(aucun produit montré dans cette conversation)'

    const notesBlock =
      input.contactNotes && input.contactNotes.length > 0
        ? input.contactNotes
            .map((n) => `- ${n.category ? `[${n.category}] ` : ''}${n.content}`)
            .join('\n')
        : '(rien de connu sur ce client pour le moment)'

    return `Tu es l'agent qui gère les tickets (leads) d'une entreprise.
À partir de la conversation et des tickets déjà ouverts pour ce contact, tu décides UNE seule action :
- "create" : la demande du client est NOUVELLE / distincte des tickets existants.
- "update" : la demande concerne la MÊME chose qu'un ticket existant (mêmes dates / produit / réservation, le client précise ou complète) → fournis son "ticketId".
- "noop" : rien d'actionnable (salutation, simple question d'info sans intention de commande/réservation, ou rien de nouveau par rapport aux tickets existants).

## Contexte business
${input.agentContext || '(non configuré)'}

## Tickets déjà ouverts pour cette conversation
${ticketsBlock}

## Produits montrés au client dans cette conversation
${productsBlock}

## Connaissance sur le client
Infos durables déjà connues sur ce client (mémorisées au fil des échanges). L'agent conversationnel ne re-demande pas ce qu'il sait déjà — c'est donc à toi de les reporter sur le ticket.
${notesBlock}

## Règles
- Un ticket = une demande concrète (commande, réservation, suivi). Jamais pour une simple question.
- Si le client complète une demande déjà ouverte (dates, produit, taille, total…), c'est un "update" de CE ticket, jamais un nouveau.
- Titre court et descriptif ; description = résumé (produit/studio, dates, prix, infos utiles).
- Reporte dans la description les infos client pertinentes issues de la "Connaissance sur le client" (adresse de livraison, téléphone, tailles, préférences…) — ne les redemande pas, elles sont connues.
- Si une info essentielle à l'exécution de la demande manque (ex: adresse de livraison ou téléphone non connus), signale-le explicitement dans la description, préfixé par "À confirmer:".
- "articleRetailerIds" = les retailerId des produits que le client a choisis, UNIQUEMENT depuis la liste "Produits montrés". N'invente JAMAIS un retailerId ; si rien n'a été choisi, laisse vide.
- Le contact est rattaché automatiquement par le système — n'invente ni numéro ni nom.
- Réponds via l'outil structuré.`
  }
}

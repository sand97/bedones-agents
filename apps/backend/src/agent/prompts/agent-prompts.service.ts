import { Injectable } from '@nestjs/common'

interface CatalogInfo {
  name: string
  description?: string | null
  productCount: number
}

interface SocialAccountInfo {
  provider: string
  pageName?: string | null
  pageAbout?: string | null
  username?: string | null
}

interface EvaluationInput {
  catalogs: CatalogInfo[]
  socialAccounts: SocialAccountInfo[]
  existingContext?: string | null
  score: number
}

@Injectable()
export class AgentPromptsService {
  /**
   * Build the initial evaluation prompt when catalogs are analyzed
   * and the agent starts the onboarding conversation.
   */
  buildInitialEvaluationPrompt(input: EvaluationInput): string {
    const { catalogs, socialAccounts, existingContext, score } = input

    const catalogDescriptions = catalogs
      .map((c) => {
        const desc = c.description ? `\nDescription: ${c.description}` : ''
        return `- ${c.name} (${c.productCount} produits)${desc}`
      })
      .join('\n')

    const socialDescriptions = socialAccounts
      .map((s) => {
        const about = s.pageAbout ? ` — ${s.pageAbout}` : ''
        return `- ${s.provider}: ${s.pageName || s.username || 'N/A'}${about}`
      })
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
    const socialInfo = socialAccounts
      .map((s) => `${s.provider}: ${s.pageName || s.username || 'N/A'}`)
      .join(', ')

    return `Tu es un assistant IA professionnel pour une entreprise.

## Réseaux sociaux gérés: ${socialInfo}

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

import { z } from 'zod'

/**
 * Shared zod schemas for MCP tools. Both LangChain (agent) and mcp-nest run on
 * zod v4, so these can be reused by the internal agent if desired (follow-up).
 */

export const providerEnum = z.enum(['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK'])

export const listConversationsSchema = z.object({
  provider: providerEnum.optional().describe('Filtrer par réseau social'),
  limit: z.number().int().positive().max(50).optional().describe('Nombre max (défaut: 15)'),
})

export const conversationIdSchema = z.object({
  conversationId: z.string().describe('ID de la conversation'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Nombre max de messages (défaut: 30)'),
})

export const sendMessageSchema = z.object({
  conversationId: z.string().describe('ID de la conversation'),
  message: z.string().optional().describe('Texte du message'),
  mediaUrl: z.string().url().optional().describe('URL du média à envoyer'),
  mediaType: z.enum(['image', 'video', 'audio', 'file']).optional().describe('Type de média'),
  replyToId: z.string().optional().describe('ID du message auquel répondre'),
})

export const sendProductMessageSchema = z.object({
  conversationId: z.string(),
  productRetailerIds: z
    .array(z.string())
    .min(1)
    .describe('IDs produits (retailer ids) du catalogue'),
  catalogId: z.string().describe('ID du catalogue WhatsApp'),
  headerText: z.string().optional(),
  bodyText: z.string().optional(),
  footerText: z.string().optional(),
})

export const sendTemplateSchema = z.object({
  conversationId: z.string(),
  metaTemplateName: z.string().describe('Nom du template WhatsApp approuvé'),
  metaTemplateLanguage: z.string().describe('Code langue du template (ex: fr, en_US)'),
  variables: z.record(z.string(), z.any()).optional().describe('Variables du template'),
})

export const sendReactionSchema = z.object({
  messageId: z.string().describe('ID du message à réagir'),
  emoji: z.string().describe('Emoji de réaction'),
})

export const accountIdSchema = z.object({
  accountId: z.string().describe('ID du compte social (SocialAccount)'),
})

export const replyToCommentSchema = z.object({
  commentId: z.string().describe('ID du commentaire'),
  message: z.string().describe('Texte de la réponse'),
})

export const commentOnPostSchema = z.object({
  postId: z.string().describe('ID du post'),
  message: z.string().describe('Texte du commentaire'),
})

export const commentIdSchema = z.object({
  commentId: z.string().describe('ID du commentaire'),
})

export const postIdSchema = z.object({
  postId: z.string().describe('ID du post'),
})

export const listProductsSchema = z.object({
  search: z.string().optional().describe('Recherche par nom/description'),
  limit: z.number().int().positive().max(50).optional().describe('Nombre max (défaut: 20)'),
})

export const createTicketSchema = z.object({
  title: z.string().describe('Titre court du ticket'),
  description: z.string().optional().describe('Description détaillée'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  contactName: z.string().optional(),
  contactId: z.string().optional(),
  provider: providerEnum.optional(),
  conversationId: z.string().optional().describe('ID de la conversation liée'),
})

export const listTicketsSchema = z.object({
  statusId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  limit: z.number().int().positive().max(50).optional().describe('Nombre max (défaut: 20)'),
})

export const updateTicketStatusSchema = z.object({
  ticketId: z.string(),
  statusId: z.string().describe('ID du nouveau statut'),
})

export const updateAgentContextSchema = z.object({
  agentId: z.string().describe("ID de l'agent IA"),
  context: z.string().describe('Contexte business en markdown'),
  score: z.number().min(0).max(100).optional().describe('Score de complétude (0-100)'),
})

export const updatePageSettingsSchema = z.object({
  socialAccountId: z.string().describe('ID du compte social'),
  undesiredCommentsAction: z.enum(['hide', 'delete', 'none']).optional(),
  spamAction: z.enum(['hide', 'delete', 'none']).optional(),
  customInstructions: z.string().optional().describe('Instructions de modération personnalisées'),
})

export const faqRuleSchema = z.object({
  socialAccountId: z.string(),
  question: z.string(),
  answer: z.string(),
})

export const emptySchema = z.object({})

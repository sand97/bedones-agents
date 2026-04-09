import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * LangChain tools for the onboarding agent to read/write business data.
 */
@Injectable()
export class AgentDbToolsService {
  constructor(private prisma: PrismaService) {}

  createTools(agentId: string, organisationId: string) {
    return [
      this.readConversationsTool(organisationId),
      this.readConversationMessagesTool(),
      this.createTicketTool(organisationId, agentId),
      this.updateAgentContextTool(agentId),
      this.listCatalogProductsTool(agentId),
    ]
  }

  private readConversationsTool(organisationId: string) {
    return tool(
      async ({ provider, limit }) => {
        const conversations = await this.prisma.conversation.findMany({
          where: {
            socialAccount: { organisationId, provider: provider || undefined },
          },
          include: {
            socialAccount: { select: { provider: true, pageName: true } },
          },
          orderBy: { lastMessageAt: 'desc' },
          take: limit || 10,
        })

        return JSON.stringify(
          conversations.map((c) => ({
            id: c.id,
            participant: c.participantName,
            provider: c.socialAccount.provider,
            page: c.socialAccount.pageName,
            lastMessage: c.lastMessageText,
            lastMessageAt: c.lastMessageAt?.toISOString(),
            unread: c.unreadCount,
          })),
        )
      },
      {
        name: 'read_conversations',
        description:
          "Lire les conversations récentes sur les réseaux sociaux de l'organisation. Peut filtrer par provider (WHATSAPP, FACEBOOK, INSTAGRAM).",
        schema: z.object({
          provider: z
            .enum(['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK'])
            .optional()
            .describe('Filtrer par réseau social'),
          limit: z.number().optional().describe('Nombre max de conversations (défaut: 10)'),
        }),
      },
    )
  }

  private readConversationMessagesTool() {
    return tool(
      async ({ conversationId, limit }) => {
        const messages = await this.prisma.directMessage.findMany({
          where: { conversationId },
          orderBy: { createdTime: 'desc' },
          take: limit || 20,
        })

        return JSON.stringify(
          messages.reverse().map((m) => ({
            from: m.isFromPage ? 'page' : m.senderName,
            message: m.message,
            type: m.mediaType || 'text',
            time: m.createdTime.toISOString(),
          })),
        )
      },
      {
        name: 'read_conversation_messages',
        description: "Lire les messages d'une conversation spécifique.",
        schema: z.object({
          conversationId: z.string().describe('ID de la conversation'),
          limit: z.number().optional().describe('Nombre max de messages (défaut: 20)'),
        }),
      },
    )
  }

  private createTicketTool(organisationId: string, agentId: string) {
    return tool(
      async ({
        title,
        description,
        priority,
        contactName,
        contactId,
        provider,
        conversationId,
      }) => {
        // Get the default status for this agent
        const defaultStatus = await this.prisma.ticketStatus.findFirst({
          where: { agentId, isDefault: true },
        })

        const ticket = await this.prisma.ticket.create({
          data: {
            organisationId,
            agentId,
            statusId: defaultStatus?.id,
            title,
            description,
            priority: priority || 'MEDIUM',
            contactName,
            contactId,
            provider,
            conversationId,
          },
        })

        return JSON.stringify({ ticketId: ticket.id, title: ticket.title })
      },
      {
        name: 'create_ticket',
        description:
          'Créer un ticket pour suivre une demande client. Utilise cet outil quand une demande nécessite un suivi.',
        schema: z.object({
          title: z.string().describe('Titre court du ticket'),
          description: z.string().optional().describe('Description détaillée'),
          priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().describe('Priorité'),
          contactName: z.string().optional().describe('Nom du contact'),
          contactId: z.string().optional().describe('ID du contact sur la plateforme'),
          provider: z.enum(['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK']).optional(),
          conversationId: z.string().optional().describe('ID de la conversation liée'),
        }),
      },
    )
  }

  private updateAgentContextTool(agentId: string) {
    return tool(
      async ({ context, score }) => {
        await this.prisma.agent.update({
          where: { id: agentId },
          data: { context, score },
        })
        return JSON.stringify({ success: true })
      },
      {
        name: 'update_agent_context',
        description: "Mettre à jour le contexte business et le score de l'agent.",
        schema: z.object({
          context: z.string().describe('Contexte business en markdown'),
          score: z.number().min(0).max(100).describe('Score de complétude (0-100)'),
        }),
      },
    )
  }

  private listCatalogProductsTool(agentId: string) {
    return tool(
      async ({ search, limit }) => {
        // Find catalogs linked to this agent's social accounts
        const agent = await this.prisma.agent.findUnique({
          where: { id: agentId },
          include: {
            socialAccounts: {
              include: {
                socialAccount: {
                  include: {
                    catalogs: {
                      include: {
                        catalog: {
                          include: { products: { take: limit || 20 } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })

        if (!agent) return JSON.stringify([])

        const allProducts = agent.socialAccounts.flatMap((sa) =>
          sa.socialAccount.catalogs.flatMap((c) =>
            c.catalog.products.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              price: p.price,
              currency: p.currency,
              category: p.category,
            })),
          ),
        )

        if (search) {
          const q = search.toLowerCase()
          return JSON.stringify(
            allProducts.filter(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                (p.description && p.description.toLowerCase().includes(q)),
            ),
          )
        }

        return JSON.stringify(allProducts)
      },
      {
        name: 'list_catalog_products',
        description: 'Lister les produits des catalogues liés à cet agent.',
        schema: z.object({
          search: z.string().optional().describe('Recherche par nom/description'),
          limit: z.number().optional().describe('Nombre max (défaut: 20)'),
        }),
      },
    )
  }
}

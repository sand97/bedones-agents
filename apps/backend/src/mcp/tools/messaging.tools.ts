import { Injectable } from '@nestjs/common'
import { Tool } from '@rekog/mcp-nest'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { MessagingService } from '../../social/messaging.service'
import { mcpContext } from '../mcp-context'
import { READ_ONLY, WRITE_EXTERNAL, withTitle } from './annotations'
import {
  accountIdSchema,
  conversationIdSchema,
  listConversationsSchema,
  sendMessageSchema,
  sendProductMessageSchema,
  sendReactionSchema,
  sendTemplateSchema,
} from './tool-schemas'

@Injectable()
export class McpMessagingTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  @Tool({
    name: 'list_conversations',
    annotations: withTitle('Lister les conversations', READ_ONLY),
    description:
      "Lister les conversations (DM) récentes de l'organisation sur WhatsApp, Messenger, Instagram et TikTok. Filtrable par réseau.",
    parameters: listConversationsSchema,
  })
  async listConversations(
    args: z.infer<typeof listConversationsSchema>,
    _c: unknown,
    request: unknown,
  ) {
    const ctx = mcpContext(request)
    const conversations = await this.prisma.conversation.findMany({
      where: {
        socialAccount: { organisationId: ctx.organisationId, provider: args.provider || undefined },
      },
      include: { socialAccount: { select: { provider: true, pageName: true } } },
      orderBy: { lastMessageAt: 'desc' },
      take: args.limit || 15,
    })
    return conversations.map((c) => ({
      id: c.id,
      participant: c.participantName,
      provider: c.socialAccount.provider,
      page: c.socialAccount.pageName,
      lastMessage: c.lastMessageText,
      lastMessageAt: c.lastMessageAt?.toISOString(),
      unread: c.unreadCount,
    }))
  }

  @Tool({
    name: 'read_conversation_messages',
    annotations: withTitle('Lire les messages', READ_ONLY),
    description: "Lire les messages d'une conversation spécifique (du plus ancien au plus récent).",
    parameters: conversationIdSchema,
  })
  async readMessages(args: z.infer<typeof conversationIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    const messages = await this.messaging.getMessages(ctx.userId, args.conversationId)
    const limited = args.limit ? messages.slice(-args.limit) : messages
    return limited.map((m) => ({
      id: m.id,
      from: m.isFromPage ? 'business' : 'customer',
      message: m.message,
      type: m.mediaType || 'text',
      mediaUrl: m.mediaUrl ?? undefined,
      time: m.createdTime,
    }))
  }

  @Tool({
    name: 'send_message',
    annotations: withTitle('Envoyer un message', WRITE_EXTERNAL),
    description:
      'Envoyer un message texte et/ou média dans une conversation (WhatsApp, Messenger, Instagram DM, TikTok).',
    parameters: sendMessageSchema,
  })
  async sendMessage(args: z.infer<typeof sendMessageSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.messaging.sendMessage(
      ctx.userId,
      args.conversationId,
      args.message,
      args.mediaUrl,
      args.mediaType,
      undefined,
      undefined,
      args.replyToId,
    )
  }

  @Tool({
    name: 'send_product_message',
    annotations: withTitle('Envoyer des produits', WRITE_EXTERNAL),
    description: 'Envoyer un message produit du catalogue WhatsApp dans une conversation.',
    parameters: sendProductMessageSchema,
  })
  async sendProductMessage(
    args: z.infer<typeof sendProductMessageSchema>,
    _c: unknown,
    request: unknown,
  ) {
    const ctx = mcpContext(request)
    const format = args.productRetailerIds.length > 1 ? 'product_list' : 'product'
    return this.messaging.sendProductMessage(
      ctx.userId,
      args.conversationId,
      args.productRetailerIds,
      args.catalogId,
      format,
      args.headerText,
      args.bodyText,
      args.footerText,
    )
  }

  @Tool({
    name: 'send_template_message',
    annotations: withTitle('Envoyer un template WhatsApp', WRITE_EXTERNAL),
    description:
      'Envoyer un message template WhatsApp approuvé (utile pour réengager hors fenêtre de 24h).',
    parameters: sendTemplateSchema,
  })
  async sendTemplate(args: z.infer<typeof sendTemplateSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.messaging.sendTemplateMessage(
      ctx.userId,
      args.conversationId,
      args.metaTemplateName,
      args.metaTemplateLanguage,
      args.variables,
    )
  }

  @Tool({
    name: 'send_reaction',
    annotations: withTitle('Réagir à un message', WRITE_EXTERNAL),
    description: 'Réagir à un message avec un emoji (WhatsApp).',
    parameters: sendReactionSchema,
  })
  async sendReaction(args: z.infer<typeof sendReactionSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.messaging.sendReaction(ctx.userId, args.messageId, args.emoji)
  }

  @Tool({
    name: 'mark_conversation_read',
    annotations: withTitle('Marquer la conversation comme lue', WRITE_EXTERNAL),
    description: 'Marquer une conversation comme lue (remet le compteur de non-lus à zéro).',
    parameters: z.object({ conversationId: z.string() }),
  })
  async markRead(args: { conversationId: string }, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.messaging.markConversationAsRead(ctx.userId, args.conversationId)
  }

  @Tool({
    name: 'sync_conversations',
    annotations: withTitle('Synchroniser les conversations', WRITE_EXTERNAL),
    description:
      "Synchroniser les conversations d'un compte social depuis la plateforme (récupère les derniers échanges).",
    parameters: accountIdSchema,
  })
  async sync(args: z.infer<typeof accountIdSchema>, _c: unknown, request: unknown) {
    const ctx = mcpContext(request)
    return this.messaging.syncConversations(ctx.userId, args.accountId)
  }
}

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CatalogService } from '../catalog/catalog.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { ProductImageSyncService } from './product-image-sync.service'
import { SocialHealthService } from './social-health.service'
import { MessagingCommonService } from './messaging-common.service'

@Injectable()
export class ProductMessagingService {
  private readonly logger = new Logger(ProductMessagingService.name)

  constructor(
    private prisma: PrismaService,
    private catalogService: CatalogService,
    private productImageSyncService: ProductImageSyncService,
    private socialHealth: SocialHealthService,
    private common: MessagingCommonService,
  ) {}

  // ─── WhatsApp Product Message ───

  async sendProductMessage(
    userId: string,
    conversationId: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            organisationId: true,
            scopes: true,
            disabled: true,
            featureDisabled: true,
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')
    await this.common.assertMembership(userId, conversation.socialAccount.organisationId)
    this.common.assertScope(conversation.socialAccount.scopes, 'messages')
    // Circuit breaker: refuse outbound sends on a disabled account / feature.
    this.socialHealth.ensureOutboundAllowed(conversation.socialAccount, 'MESSAGE')

    if (conversation.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Product messages are only supported on WhatsApp')
    }

    const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)

    const { sends, effectiveFormat } = await this.dispatchWhatsAppProductMessage(
      conversation.socialAccount.providerAccountId,
      conversation.participantId,
      accessToken,
      productRetailerIds,
      catalogId,
      format,
      headerText,
      bodyText,
      footerText,
    )

    const savedMessages = await this.persistProductSends(
      conversationId,
      conversation.socialAccount.providerAccountId,
      'Page',
      sends,
      effectiveFormat,
      catalogId,
      headerText,
      bodyText,
      footerText,
    )

    const lastSaved = savedMessages[savedMessages.length - 1] ?? null
    if (lastSaved) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageText: lastSaved.message,
          lastMessageAt: new Date(),
        },
      })
    }

    // Contract preserved: return a single message. For single-product format with
    // multiple products, this is the LAST one saved — the frontend invalidates and
    // re-fetches the whole thread anyway.
    return lastSaved ?? savedMessages[0]
  }

  // ─── Send product message as AI agent (no user auth check) ───

  async sendProductMessageAsAgent(
    conversationId: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ): Promise<{ id: string; message: string }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            organisationId: true,
          },
        },
      },
    })
    if (!conversation) throw new NotFoundException('Conversation not found')

    if (conversation.socialAccount.provider !== 'WHATSAPP') {
      throw new BadRequestException('Product messages are only supported on WhatsApp')
    }

    const accessToken = await this.common.getDecryptedToken(conversation.socialAccount.id)

    const { sends, effectiveFormat } = await this.dispatchWhatsAppProductMessage(
      conversation.socialAccount.providerAccountId,
      conversation.participantId,
      accessToken,
      productRetailerIds,
      catalogId,
      format,
      headerText,
      bodyText,
      footerText,
    )

    const savedMessages = await this.persistProductSends(
      conversationId,
      conversation.socialAccount.providerAccountId,
      'AI Agent',
      sends,
      effectiveFormat,
      catalogId,
      headerText,
      bodyText,
      footerText,
    )

    const lastSaved = savedMessages[savedMessages.length - 1] ?? null
    if (lastSaved) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageText: lastSaved.message,
          lastMessageAt: new Date(),
        },
      })
    }

    const first = lastSaved ?? savedMessages[0]
    return { id: first.id, message: first.message }
  }

  /**
   * Persist dispatch results as DirectMessage rows. Creates one row per `send` entry —
   * so when a customer cites a single product in their reply, WhatsApp's context.id will
   * map back to a specific row (not a grouped bundle).
   */
  private async persistProductSends(
    conversationId: string,
    senderId: string,
    senderName: string,
    sends: Array<{ platformMsgId: string | null; retailerIds: string[]; displayText: string }>,
    effectiveFormat: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    catalogId: string,
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ) {
    const mediaType = effectiveFormat === 'catalog_message' ? 'catalog_message' : 'catalog'
    const trimmedHeader = headerText?.trim() || null
    const trimmedBody = bodyText?.trim() || null
    const trimmedFooter = footerText?.trim() || null
    const now = new Date()

    const saved = []
    for (const entry of sends) {
      const enrichedItems = await this.buildEnrichedItems(catalogId, entry.retailerIds)
      const row = await this.prisma.directMessage.create({
        data: {
          conversationId,
          platformMsgId: entry.platformMsgId || null,
          message: trimmedBody || entry.displayText,
          senderId,
          senderName,
          isFromPage: true,
          isRead: true,
          mediaType,
          metadata: {
            kind: 'catalog',
            format: effectiveFormat,
            catalogId,
            productRetailerIds: entry.retailerIds,
            items: enrichedItems,
            header: trimmedHeader,
            body: trimmedBody,
            footer: trimmedFooter,
          } satisfies Prisma.InputJsonValue,
          deliveryStatus: 'sent',
          createdTime: now,
        },
      })
      await this.productImageSyncService.enqueueIfProductMessage(
        row.id,
        row.metadata as Record<string, unknown> | null,
      )
      saved.push(row)
    }
    return saved
  }

  /**
   * Dispatch the product message to WhatsApp. Handles format-specific payload
   * building and the single-product loop (when format=product and N>1).
   */
  /**
   * Hydrate product retailer IDs into `items` with name/image/price for storage in
   * message metadata. Meta is the source of truth; any retailer ID that Meta does
   * not return is kept with null fields so the UI can fall back to the ID itself.
   */
  async buildEnrichedItems(
    catalogProviderId: string,
    retailerIds: string[],
  ): Promise<
    Array<{
      productRetailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    if (retailerIds.length === 0) return []
    const hydrated = await this.catalogService.hydrateProductsByRetailerIds(
      catalogProviderId,
      retailerIds,
    )
    const byRetailerId = new Map(hydrated.map((p) => [p.retailerId, p]))
    return retailerIds.map((retailerId) => {
      const p = byRetailerId.get(retailerId)
      return {
        productRetailerId: retailerId,
        name: p?.name ?? null,
        imageUrl: p?.imageUrl ?? null,
        price: p?.price ?? null,
        currency: p?.currency ?? null,
      }
    })
  }

  async buildEnrichedItemsForSocialAccount(
    socialAccountId: string,
    catalogProviderId: string,
    retailerIds: string[],
  ): Promise<
    Array<{
      productRetailerId: string
      name: string | null
      imageUrl: string | null
      price: number | null
      currency: string | null
    }>
  > {
    if (retailerIds.length === 0) return []
    const accessToken = await this.common.getDecryptedToken(socialAccountId)
    const hydrated = await this.catalogService.hydrateProductsByRetailerIdsWithAccessToken(
      catalogProviderId,
      retailerIds,
      accessToken,
    )
    const byRetailerId = new Map(hydrated.map((p) => [p.retailerId, p]))
    return retailerIds.map((retailerId) => {
      const p = byRetailerId.get(retailerId)
      return {
        productRetailerId: retailerId,
        name: p?.name ?? null,
        imageUrl: p?.imageUrl ?? null,
        price: p?.price ?? null,
        currency: p?.currency ?? null,
      }
    })
  }

  private async dispatchWhatsAppProductMessage(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    productRetailerIds: string[],
    catalogId: string,
    format: 'product' | 'product_list' | 'carousel' | 'catalog_message',
    headerText?: string,
    bodyText?: string,
    footerText?: string,
  ): Promise<{
    /**
     * One entry per WhatsApp message actually sent. `product` format yields N entries
     * (one per retailer ID) so each can be persisted as its own DirectMessage — that way
     * a customer quoting a single product in a reply maps to the right row.
     * Other formats always yield a single entry covering all retailer IDs.
     */
    sends: Array<{ platformMsgId: string | null; retailerIds: string[]; displayText: string }>
    effectiveFormat: 'product' | 'product_list' | 'carousel' | 'catalog_message'
  }> {
    // Meta WhatsApp carousel supports up to 10 cards. Above that, fall back to product_list.
    let effectiveFormat = format
    if (effectiveFormat === 'carousel' && productRetailerIds.length > 10) {
      this.logger.warn(
        `Carousel requested with ${productRetailerIds.length} products (>10). Falling back to product_list.`,
      )
      effectiveFormat = 'product_list'
    }

    if (effectiveFormat === 'product') {
      // Single product format: loop through every retailer ID and send each as its own
      // WhatsApp message. We collect one `send` entry per retailer ID so the caller can
      // persist one DirectMessage row per product (matches WhatsApp's own behaviour).
      const sends: Array<{
        platformMsgId: string | null
        retailerIds: string[]
        displayText: string
      }> = []
      for (const retailerId of productRetailerIds) {
        const interactive: Record<string, unknown> = {
          type: 'product',
          action: {
            catalog_id: catalogId,
            product_retailer_id: retailerId,
          },
        }
        const trimmedBody = bodyText?.trim()
        if (trimmedBody) interactive.body = { text: trimmedBody }
        const trimmedFooter = footerText?.trim()
        if (trimmedFooter) interactive.footer = { text: trimmedFooter }

        const msgId = await this.sendWhatsAppInteractivePayload(
          phoneNumberId,
          recipientPhone,
          accessToken,
          interactive,
          `product (${retailerId})`,
        )
        sends.push({ platformMsgId: msgId, retailerIds: [retailerId], displayText: '[product]' })
      }
      return { sends, effectiveFormat }
    }

    if (effectiveFormat === 'product_list') {
      // Per Meta spec: header (required, text), body (required), footer (optional).
      const interactive: Record<string, unknown> = {
        type: 'product_list',
        header: { type: 'text', text: headerText?.trim() || 'Products' },
        body: { text: bodyText?.trim() || headerText?.trim() || 'Here are the products:' },
        action: {
          catalog_id: catalogId,
          sections: [
            {
              title: headerText?.trim() || 'Products',
              product_items: productRetailerIds.map((id) => ({ product_retailer_id: id })),
            },
          ],
        },
      }
      const trimmedFooter = footerText?.trim()
      if (trimmedFooter) interactive.footer = { text: trimmedFooter }

      const msgId = await this.sendWhatsAppInteractivePayload(
        phoneNumberId,
        recipientPhone,
        accessToken,
        interactive,
        `product_list (${productRetailerIds.length} items)`,
      )
      return {
        sends: [
          {
            platformMsgId: msgId,
            retailerIds: productRetailerIds,
            displayText: `[${productRetailerIds.length} products]`,
          },
        ],
        effectiveFormat,
      }
    }

    if (effectiveFormat === 'carousel') {
      const interactive: Record<string, unknown> = {
        type: 'carousel',
        body: { text: bodyText?.trim() || headerText?.trim() || 'Here are the products:' },
        action: {
          cards: productRetailerIds.map((retailerId, index) => ({
            card_index: index,
            type: 'product',
            action: {
              product_retailer_id: retailerId,
              catalog_id: catalogId,
            },
          })),
        },
      }
      const msgId = await this.sendWhatsAppInteractivePayload(
        phoneNumberId,
        recipientPhone,
        accessToken,
        interactive,
        `carousel (${productRetailerIds.length} items)`,
      )
      return {
        sends: [
          {
            platformMsgId: msgId,
            retailerIds: productRetailerIds,
            displayText: `[${productRetailerIds.length} products]`,
          },
        ],
        effectiveFormat,
      }
    }

    // effectiveFormat === 'catalog_message'
    const action: Record<string, unknown> = { name: 'catalog_message' }
    if (productRetailerIds[0]) {
      action.parameters = { thumbnail_product_retailer_id: productRetailerIds[0] }
    }
    const interactive: Record<string, unknown> = {
      type: 'catalog_message',
      body: { text: bodyText?.trim() || 'View our catalog' },
      action,
    }
    const footer = footerText?.trim()
    if (footer) interactive.footer = { text: footer }

    const msgId = await this.sendWhatsAppInteractivePayload(
      phoneNumberId,
      recipientPhone,
      accessToken,
      interactive,
      'catalog_message',
    )
    return {
      sends: [{ platformMsgId: msgId, retailerIds: productRetailerIds, displayText: '[catalog]' }],
      effectiveFormat,
    }
  }

  private async sendWhatsAppInteractivePayload(
    phoneNumberId: string,
    recipientPhone: string,
    accessToken: string,
    interactive: Record<string, unknown>,
    logLabel: string,
  ): Promise<string | null> {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${phoneNumberId}/messages`
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'interactive',
      interactive,
    }

    this.logger.log(`[WhatsApp] Sending ${logLabel} message to ${recipientPhone}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      this.logger.error(
        `[WhatsApp] Product send failed (${response.status})\n` +
          `  Payload: ${JSON.stringify(body)}\n` +
          `  Response: ${JSON.stringify(data)}`,
      )
      throw new BadRequestException(
        `Failed to send WhatsApp product message: ${JSON.stringify(data?.error?.message || data)}`,
      )
    }

    const messages = (data as { messages?: Array<{ id: string }> }).messages
    return messages?.[0]?.id || null
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { UploadService } from '../upload/upload.service'
import { MessagingService, HISTORY_SYNC_WINDOW_DAYS } from './messaging.service'
import { EventsGateway } from '../gateway/events.gateway'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { WebhookCommonService } from './webhook-common.service'
import {
  HISTORY_NOT_SHARED_ERROR_CODE,
  type WhatsAppWebhookPayload,
  type WhatsAppWebhookValue,
  type WhatsAppContact,
  type WhatsAppMessage,
  type WhatsAppMessageEcho,
  type WhatsAppHistoryMessage,
  type IncomingMessageEvent,
} from './webhook.types'
import { Prisma } from 'generated/prisma/client'

/**
 * WhatsApp Cloud API webhook handling: inbound messages, business-app echoes,
 * reactions, delivery/read statuses, Coexistence history sync and contact sync,
 * and media download.
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private uploadService: UploadService,
    private messagingService: MessagingService,
    private eventsGateway: EventsGateway,
    private eventEmitter: EventEmitter2,
    private webhookCommon: WebhookCommonService,
  ) {}

  /** WhatsApp Click-to-WhatsApp ad referral. */
  private extractWhatsAppAdReferral(msg: WhatsAppMessage): Prisma.InputJsonValue | null {
    const ref = msg.referral
    if (!ref) return null
    // WhatsApp only attaches `referral` on CTWA ad messages, but guard the source type anyway.
    if (ref.source_type && ref.source_type !== 'ad') return null
    return {
      platform: 'WHATSAPP',
      sourceType: ref.source_type ?? 'ad',
      sourceId: ref.source_id ?? null,
      sourceUrl: ref.source_url ?? null,
      ctwaClid: ref.ctwa_clid ?? null,
      headline: ref.headline ?? null,
      body: ref.body ?? null,
    }
  }

  // ─── WhatsApp reaction handling ───
  // WhatsApp sends reactions as a `messages` entry with `type: "reaction"`.
  // An empty emoji string means the user removed their reaction.
  private async handleWhatsAppReaction(msg: WhatsAppMessage, senderId: string, orgId: string) {
    const targetMsgId = msg.reaction?.message_id
    if (!targetMsgId) return

    const emoji = msg.reaction?.emoji ?? ''

    const targetMessage = await this.prisma.directMessage.findUnique({
      where: { platformMsgId: targetMsgId },
      select: { id: true, conversationId: true, reactions: true },
    })

    if (!targetMessage) {
      this.logger.warn(
        `[WhatsApp Reaction] Message ${targetMsgId} not found in DB, skipping reaction`,
      )
      return
    }

    const existing = (targetMessage.reactions as { senderId: string; emoji: string }[]) || []

    // WhatsApp only allows a single reaction per user — replace any previous one.
    const updated = existing.filter((r) => r.senderId !== senderId)
    if (emoji) {
      updated.push({ senderId, emoji })
    }

    await this.prisma.directMessage.update({
      where: { id: targetMessage.id },
      data: { reactions: updated },
    })

    if (emoji) {
      await this.prisma.conversation.update({
        where: { id: targetMessage.conversationId },
        data: {
          lastMessageText: `[reaction:${emoji}]`,
          lastMessageAt: new Date(),
        },
      })
    }

    this.logger.log(
      `[WhatsApp Reaction] ${emoji ? 'react' : 'unreact'} "${emoji}" on message ${targetMsgId} by ${senderId}`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:reaction', {
      conversationId: targetMessage.conversationId,
      messageId: targetMessage.id,
      reactions: updated,
    })
  }

  // ─── Process WhatsApp webhook ───

  async processWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const isMessageField = change.field === 'messages'
        const isMessageEchoField = change.field === 'smb_message_echoes'
        // Coexistence history sync. The WABA must be subscribed to the
        // `history` webhook field (configured in the Meta App Dashboard).
        const isHistoryField = change.field === 'history'
        // Coexistence contact sync: Meta pushes the business's WhatsApp Business
        // app address-book contacts (and later additions/changes) so we can show
        // the name the business saved instead of the raw phone number.
        const isAppStateSyncField = change.field === 'smb_app_state_sync'
        if (!isMessageField && !isMessageEchoField && !isHistoryField && !isAppStateSyncField)
          continue

        const value = change.value
        if (!value?.metadata?.phone_number_id) continue

        const phoneNumberId = value.metadata.phone_number_id

        // Inbound on the CORE Bedones number → not tied to any org's
        // SocialAccount. These are replies from members on the daily opt-in
        // template. Emit so WhatsappOptinService can refresh their window.
        const coreNumberId = process.env.CORE_WHATSAPP_NUMBER_ID
        if (isMessageField && coreNumberId && phoneNumberId === coreNumberId) {
          for (const msg of value.messages || []) {
            const reply = this.extractWhatsAppButtonReply(msg)
            this.eventEmitter.emit('whatsapp.core.inbound', {
              senderPhone: msg.from,
              buttonId: reply?.id,
              buttonTitle: reply?.title,
            })
          }
          continue
        }

        // Find the social account for this phone number
        const socialAccount = await this.prisma.socialAccount.findFirst({
          where: { provider: 'WHATSAPP', providerAccountId: phoneNumberId },
          select: { id: true, organisationId: true },
        })

        if (!socialAccount) {
          this.logger.warn(`[WhatsApp Webhook] No account found for phone ${phoneNumberId}`)
          continue
        }

        const orgId = socialAccount.organisationId

        // Coexistence: Meta pushes up to ~6 months of chat history through the
        // `history` field after onboarding. We backfill the configured window.
        if (isHistoryField) {
          await this.handleWhatsAppHistory(socialAccount.id, phoneNumberId, value, orgId)
          continue
        }

        // Coexistence contact sync (field: `smb_app_state_sync`).
        if (isAppStateSyncField) {
          await this.handleWhatsAppAppStateSync(socialAccount.id, value, orgId)
          continue
        }

        // Handle status updates (sent, delivered, read)
        for (const status of value.statuses || []) {
          await this.handleWhatsAppStatus(status, orgId)
        }

        // Handle incoming messages
        for (const msg of value.messages || []) {
          await this.handleWhatsAppMessage(
            socialAccount.id,
            phoneNumberId,
            msg,
            value.contacts,
            orgId,
          )
        }

        // Handle messages sent from the WhatsApp Business app. Meta sends
        // those as "smb_message_echoes" instead of regular inbound messages.
        for (const msg of value.message_echoes || []) {
          await this.handleWhatsAppMessageEcho(
            socialAccount.id,
            phoneNumberId,
            msg,
            value.contacts,
            orgId,
          )
        }
      }
    }
  }

  private async handleWhatsAppMessage(
    socialAccountId: string,
    phoneNumberId: string,
    msg: WhatsAppMessage,
    contacts: WhatsAppContact[] | undefined,
    orgId: string,
  ) {
    const senderId = msg.from // phone number of the sender
    const timestamp = new Date(parseInt(msg.timestamp) * 1000)
    const platformMsgId = msg.id

    // Get sender name from contacts array. A name synced from the business
    // address book (smb_app_state_sync) wins over the WhatsApp profile name.
    const contact = contacts?.find((c) => c.wa_id === senderId)
    const senderName =
      (await this.resolveWhatsAppContactName(
        socialAccountId,
        senderId,
        contact?.profile?.name || null,
      )) || senderId

    // Extract message content
    let messageText = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let replyToMid: string | null = null
    let metadata: Record<string, unknown> | null = null

    if (msg.context?.id) {
      replyToMid = msg.context.id
    }

    if (msg.type === 'reaction') {
      await this.handleWhatsAppReaction(msg, senderId, orgId)
      return
    }

    switch (msg.type) {
      case 'text':
        messageText = msg.text?.body || ''
        break
      case 'image':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.image?.id)
        messageText = msg.image?.caption || ''
        break
      case 'video':
        mediaType = 'video'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.video?.id)
        messageText = msg.video?.caption || ''
        break
      case 'audio':
        mediaType = 'audio'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.audio?.id)
        break
      case 'document':
        mediaType = 'file'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.document?.id)
        fileName = msg.document?.filename || null
        break
      case 'sticker':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.sticker?.id)
        break
      case 'order': {
        mediaType = 'order'
        const order = msg.order
        const rawItems = (order?.product_items || []).map((item) => ({
          productRetailerId: item.product_retailer_id,
          quantity: Number(item.quantity) || 1,
          itemPrice: Number(item.item_price) || 0,
          currency: item.currency,
        }))
        const total = rawItems.reduce((sum, it) => sum + it.itemPrice * it.quantity, 0)

        // Hydrate name/image from Meta catalog so the UI shows readable products.
        let enrichedItems = rawItems as Array<
          (typeof rawItems)[number] & {
            name: string | null
            imageUrl: string | null
          }
        >
        if (order?.catalog_id) {
          const hydrated = await this.messagingService.buildEnrichedItemsForSocialAccount(
            socialAccountId,
            order.catalog_id,
            rawItems.map((i) => i.productRetailerId),
          )
          const byId = new Map(hydrated.map((h) => [h.productRetailerId, h]))
          enrichedItems = rawItems.map((item) => {
            const h = byId.get(item.productRetailerId)
            return {
              ...item,
              name: h?.name ?? null,
              imageUrl: h?.imageUrl ?? null,
            }
          })
        }

        metadata = {
          kind: 'order',
          catalogId: order?.catalog_id || null,
          text: order?.text || undefined,
          items: enrichedItems,
          total,
          currency: rawItems[0]?.currency || null,
        }
        messageText = order?.text || ''
        break
      }
      case 'interactive': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
            ...(reply.description ? { replyDescription: reply.description } : {}),
          }
        } else {
          messageText = '[interactive]'
        }
        break
      }
      case 'button': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
          }
        } else {
          messageText = '[button]'
        }
        break
      }
      default:
        messageText = `[${msg.type}]`
    }

    const conversation = await this.messagingService.handleIncomingMessage(
      socialAccountId,
      senderId,
      senderName,
      messageText,
      platformMsgId,
      mediaUrl,
      mediaType,
      timestamp,
      orgId,
      null,
      fileName,
      null,
      replyToMid,
      metadata,
    )
    if (!conversation) return

    await this.webhookCommon.markConversationFromAd(
      conversation.id,
      this.extractWhatsAppAdReferral(msg),
    )

    await this.markOutboundMessagesAsRead(conversation.id, orgId, timestamp)

    this.logger.log(
      `[WhatsApp] New message from ${senderName} (${senderId}): "${messageText?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'WHATSAPP',
    })

    this.eventEmitter.emit('message.incoming', {
      conversationId: conversation.id,
      socialAccountId,
      provider: 'WHATSAPP',
      orgId,
      message: { text: messageText, mediaUrl, mediaType, senderId, senderName },
    } satisfies IncomingMessageEvent)
  }

  private async handleWhatsAppMessageEcho(
    socialAccountId: string,
    phoneNumberId: string,
    msg: WhatsAppMessageEcho,
    contacts: WhatsAppContact[] | undefined,
    orgId: string,
  ) {
    const recipientId = msg.to || contacts?.[0]?.wa_id
    if (!recipientId) return

    const timestamp = new Date(parseInt(msg.timestamp) * 1000)
    const platformMsgId = msg.id
    const contact = contacts?.find((c) => c.wa_id === recipientId)
    // A name synced from the business address book (smb_app_state_sync) wins
    // over the WhatsApp profile name.
    const recipientName = await this.resolveWhatsAppContactName(
      socialAccountId,
      recipientId,
      contact?.profile?.name || null,
    )

    let messageText = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let metadata: Record<string, unknown> | null = null

    if (msg.type === 'reaction') {
      // Echo on the business side = the owner reacted from the mobile app.
      // The sender of the reaction is the business phone number.
      await this.handleWhatsAppReaction(msg, phoneNumberId, orgId)
      return
    }

    switch (msg.type) {
      case 'text':
        messageText = msg.text?.body || ''
        break
      case 'image':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.image?.id)
        messageText = msg.image?.caption || ''
        break
      case 'video':
        mediaType = 'video'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.video?.id)
        messageText = msg.video?.caption || ''
        break
      case 'audio':
        mediaType = 'audio'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.audio?.id)
        break
      case 'document':
        mediaType = 'file'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.document?.id)
        fileName = msg.document?.filename || null
        break
      case 'sticker':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.sticker?.id)
        break
      case 'interactive': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
            ...(reply.description ? { replyDescription: reply.description } : {}),
          }
        } else {
          messageText = '[interactive]'
        }
        break
      }
      case 'button': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
          }
        } else {
          messageText = '[button]'
        }
        break
      }
      default:
        messageText = `[${msg.type}]`
    }

    const saved = await this.messagingService.handleEchoMessage(
      socialAccountId,
      recipientId,
      messageText,
      platformMsgId,
      timestamp,
      mediaUrl,
      mediaType,
      fileName,
      null,
      {
        createConversation: true,
        recipientName,
        senderId: msg.from || phoneNumberId,
        senderName: 'WhatsApp',
        deliveryStatus: 'sent',
        metadata,
      },
    )

    if (!saved) return

    // Reply sent from the WhatsApp Business mobile app implies the owner
    // has read the inbound messages up to that point. Clear the badge.
    await this.markInboundMessagesAsRead(saved.conversationId, orgId, timestamp)

    this.logger.log(
      `[WhatsApp Echo] New outbound message to ${recipientName || recipientId}: "${messageText?.substring(0, 50) || '[media]'}"`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      conversationId: saved.conversationId,
      socialAccountId,
      provider: 'WHATSAPP',
      isFromPage: true,
    })
  }

  private extractWhatsAppButtonReply(msg: WhatsAppMessage): {
    id: string
    title: string
    description?: string
    kind: 'whatsapp_button_reply' | 'whatsapp_list_reply' | 'whatsapp_template_button_reply'
  } | null {
    if (msg.interactive?.button_reply) {
      const reply = msg.interactive.button_reply
      return {
        id: reply.id,
        title: reply.title,
        kind: 'whatsapp_button_reply',
      }
    }

    if (msg.interactive?.list_reply) {
      const reply = msg.interactive.list_reply
      return {
        id: reply.id,
        title: reply.title,
        description: reply.description,
        kind: 'whatsapp_list_reply',
      }
    }

    if (msg.button) {
      const title = msg.button.text || msg.button.payload || ''
      if (!title) return null
      return {
        id: msg.button.payload || title,
        title,
        kind: 'whatsapp_template_button_reply',
      }
    }

    return null
  }

  private async handleWhatsAppStatus(
    status: { id: string; status: string; timestamp: string; recipient_id: string },
    orgId: string,
  ) {
    const validStatuses = ['sent', 'delivered', 'read']
    if (!validStatuses.includes(status.status)) return

    this.logger.log(`[WhatsApp] Status: ${status.status} for ${status.id}`)

    // Find the message by platformMsgId
    const message = await this.prisma.directMessage.findUnique({
      where: { platformMsgId: status.id },
      select: {
        id: true,
        conversationId: true,
        deliveryStatus: true,
        isFromPage: true,
        createdTime: true,
      },
    })

    if (!message) return

    // Read receipt on an inbound message → business owner read it from a
    // linked device (e.g. WhatsApp Business mobile app). Mark all earlier
    // inbound messages as read and refresh the conversation unread count.
    if (status.status === 'read' && !message.isFromPage) {
      await this.markInboundMessagesAsRead(message.conversationId, orgId, message.createdTime)
      return
    }

    // Only upgrade status: sent → delivered → read (never downgrade)
    const statusOrder = { sent: 1, delivered: 2, read: 3 }
    const currentOrder =
      statusOrder[(message.deliveryStatus as keyof typeof statusOrder) || 'sent'] || 0
    const newOrder = statusOrder[status.status as keyof typeof statusOrder] || 0
    if (newOrder <= currentOrder) return

    await this.prisma.directMessage.update({
      where: { id: message.id },
      data: { deliveryStatus: status.status },
    })

    this.eventsGateway.emitToOrg(orgId, 'message:status', {
      conversationId: message.conversationId,
      messageId: message.id,
      platformMsgId: status.id,
      deliveryStatus: status.status,
    })

    this.eventEmitter.emit('campaign.whatsapp.status', {
      platformMsgId: status.id,
      status: status.status,
    })
  }

  /**
   * Persist a Coexistence history-sync webhook (field: `history`).
   *
   * Meta pushes up to ~6 months of chat history in chunked phases; we keep only
   * the trailing configured window (HISTORY_SYNC_WINDOW_DAYS). Every message is written through
   * {@link MessagingService.handleHistoricalMessage}, which dedups on the
   * provider message id (wamid) — so a live webhook arriving during the sync
   * never produces a duplicate. The account's history status is marked COMPLETED
   * once the final chunk reports 100% progress.
   */
  private async handleWhatsAppHistory(
    socialAccountId: string,
    phoneNumberId: string,
    value: WhatsAppWebhookValue,
    orgId: string,
  ) {
    // The business declined to share its history during Embedded Signup: Meta
    // sends a `history` webhook carrying error 2593109 instead of any messages.
    // Mark the account so the UI stops "awaiting history" forever.
    const errors = [
      ...(value.errors || []),
      ...(value.history || []).flatMap((c) => c.errors || []),
    ]
    const notSharedError = errors.find((e) => e.code === HISTORY_NOT_SHARED_ERROR_CODE)
    if (notSharedError) {
      this.logger.warn(
        `[WhatsApp History] Business declined to share history for account ${socialAccountId} (code ${notSharedError.code})`,
      )
      await this.prisma.socialAccount
        .update({
          where: { id: socialAccountId },
          data: {
            historySyncStatus: 'UNSUPPORTED',
            historySyncedAt: new Date(),
            historySyncError:
              notSharedError.message || 'Business declined to share message history',
          },
        })
        .catch(() => undefined)
      return
    }

    const contacts = value.contacts
    const cutoff = new Date(Date.now() - HISTORY_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    let imported = 0
    let maxProgress = 0

    for (const chunk of value.history || []) {
      const progress = Number(chunk.metadata?.progress ?? 0)
      if (!Number.isNaN(progress)) maxProgress = Math.max(maxProgress, progress)

      for (const thread of chunk.threads || []) {
        const participantId = thread.id
        if (!participantId) continue
        const contact = contacts?.find((c) => c.wa_id === participantId)
        // A name synced from the business address book (smb_app_state_sync) wins
        // over the WhatsApp profile name.
        const participantName =
          (await this.resolveWhatsAppContactName(
            socialAccountId,
            participantId,
            contact?.profile?.name || null,
          )) || participantId

        for (const msg of thread.messages || []) {
          // Reactions are folded into their target message live; skip in history.
          if (msg.type === 'reaction') continue

          const timestamp = new Date(parseInt(msg.timestamp) * 1000)
          if (Number.isNaN(timestamp.getTime()) || timestamp < cutoff) continue

          // Direction: prefer Meta's explicit flag, fall back to sender identity.
          const fromMe =
            msg.history_context?.from_me === true ||
            (msg.from !== undefined && msg.from !== participantId)

          const content = await this.mapWhatsAppHistoryContent(socialAccountId, msg)
          const created = await this.messagingService.handleHistoricalMessage({
            socialAccountId,
            participantId,
            participantName,
            platformThreadId: participantId,
            platformMsgId: msg.id,
            message: content.messageText,
            senderId: fromMe ? phoneNumberId : participantId,
            senderName: fromMe ? 'WhatsApp' : participantName,
            isFromPage: fromMe,
            mediaUrl: content.mediaUrl,
            mediaType: content.mediaType,
            fileName: content.fileName,
            replyToMid: msg.context?.id || null,
            deliveryStatus: fromMe ? msg.history_context?.status?.toLowerCase() || null : null,
            metadata: content.metadata,
            timestamp,
          })
          if (created) imported++
        }
      }
    }

    if (maxProgress >= 100) {
      await this.prisma.socialAccount
        .update({
          where: { id: socialAccountId },
          data: {
            historySyncStatus: 'COMPLETED',
            historySyncedAt: new Date(),
            historySyncError: null,
          },
        })
        .catch(() => undefined)
    }

    this.logger.log(
      `[WhatsApp History] imported ${imported} message(s) for account ${socialAccountId} (progress=${maxProgress}%)`,
    )

    this.eventsGateway.emitToOrg(orgId, 'message:new', {
      socialAccountId,
      provider: 'WHATSAPP',
      historyImported: imported,
    })
  }

  /**
   * Persist a Coexistence contact-sync webhook (field: `smb_app_state_sync`).
   *
   * Meta delivers the contacts saved in the business's WhatsApp Business app
   * address book (right after onboarding) plus any later additions/changes, so
   * we can display the name the business chose instead of a bare phone number.
   * A "contact" in our model is a {@link Conversation} keyed by
   * (socialAccountId, participantId) — the participantId being the wa_id
   * (digits only) used everywhere else in the WhatsApp flows.
   *
   * - `add` / `update` (and any other non-removal action carrying a name):
   *   upsert the conversation, touching only `participantName`. An existing
   *   thread keeps its messages, unread count and last-message preview; a
   *   brand-new contact is created without a fake last message so it sorts
   *   below active chats (lastMessageAt stays null).
   * - `remove`: ignored — we never delete a contact or its message history.
   */
  private async handleWhatsAppAppStateSync(
    socialAccountId: string,
    value: WhatsAppWebhookValue,
    orgId: string,
  ) {
    let synced = 0

    for (const entry of value.state_sync || []) {
      if (entry.type !== 'contact' || !entry.contact) continue

      const action = (entry.action || '').toLowerCase()
      // Normalize the phone number to the wa_id format (digits only) that the
      // message/echo/history flows use as the conversation participantId.
      const participantId = (entry.contact.phone_number || '').replace(/\D+/g, '')
      if (!participantId) continue

      // Per product decision: contact removals are ignored — keep the
      // conversation (and any history) untouched.
      if (action === 'remove' || action === 'delete') {
        this.logger.log(`[WhatsApp StateSync] Ignoring "${action}" for ${participantId}`)
        continue
      }

      const name = (entry.contact.full_name || entry.contact.first_name || '').trim()
      if (!name) continue

      await this.prisma.conversation.upsert({
        where: {
          socialAccountId_participantId: { socialAccountId, participantId },
        },
        create: {
          socialAccountId,
          participantId,
          participantName: name,
          contactNameSynced: true,
        },
        update: {
          participantName: name,
          contactNameSynced: true,
        },
      })
      synced++
    }

    if (synced === 0) return

    this.logger.log(
      `[WhatsApp StateSync] Synced ${synced} contact name(s) for account ${socialAccountId}`,
    )

    // Refresh the conversation list so the new/updated names show up live.
    this.eventsGateway.emitToOrg(orgId, 'conversation:updated', {
      socialAccountId,
      provider: 'WHATSAPP',
    })
  }

  /**
   * Resolve the display name to persist for a WhatsApp contact on an inbound
   * message / echo / history item.
   *
   * Once a conversation's name comes from the business address-book sync
   * (smb_app_state_sync, {@link handleWhatsAppAppStateSync}), it is
   * authoritative: it must win over the WhatsApp profile name (or bare number)
   * carried by later messages, and only another contact sync may change it.
   * Returns the locked synced name when the conversation is flagged, otherwise
   * the candidate name extracted from the message.
   */
  private async resolveWhatsAppContactName(
    socialAccountId: string,
    participantId: string,
    candidateName: string | null,
  ): Promise<string | null> {
    const existing = await this.prisma.conversation.findUnique({
      where: { socialAccountId_participantId: { socialAccountId, participantId } },
      select: { participantName: true, contactNameSynced: true },
    })
    if (existing?.contactNameSynced) return existing.participantName
    return candidateName
  }

  /** Extract displayable content from a historical WhatsApp message. */
  private async mapWhatsAppHistoryContent(
    socialAccountId: string,
    msg: WhatsAppHistoryMessage,
  ): Promise<{
    messageText: string
    mediaUrl: string | null
    mediaType: string | null
    fileName: string | null
    metadata: Record<string, unknown> | null
  }> {
    let messageText = ''
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    let fileName: string | null = null
    let metadata: Record<string, unknown> | null = null

    switch (msg.type) {
      case 'text':
        messageText = msg.text?.body || ''
        break
      case 'image':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.image?.id)
        messageText = msg.image?.caption || ''
        break
      case 'video':
        mediaType = 'video'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.video?.id)
        messageText = msg.video?.caption || ''
        break
      case 'audio':
        mediaType = 'audio'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.audio?.id)
        break
      case 'document':
        mediaType = 'file'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.document?.id)
        fileName = msg.document?.filename || null
        break
      case 'sticker':
        mediaType = 'image'
        mediaUrl = await this.downloadWhatsAppMedia(socialAccountId, msg.sticker?.id)
        break
      case 'interactive':
      case 'button': {
        const reply = this.extractWhatsAppButtonReply(msg)
        if (reply) {
          messageText = reply.title
          metadata = {
            kind: reply.kind,
            replyId: reply.id,
            replyTitle: reply.title,
            ...(reply.description ? { replyDescription: reply.description } : {}),
          }
        } else {
          messageText = `[${msg.type}]`
        }
        break
      }
      default:
        messageText = msg.text?.body || `[${msg.type}]`
    }

    return { messageText, mediaUrl, mediaType, fileName, metadata }
  }

  private async markInboundMessagesAsRead(conversationId: string, orgId: string, readAt: Date) {
    const result = await this.prisma.directMessage.updateMany({
      where: {
        conversationId,
        isFromPage: false,
        isRead: false,
        createdTime: { lte: readAt },
      },
      data: { isRead: true },
    })
    if (result.count === 0) return

    const unreadCount = await this.prisma.directMessage.count({
      where: { conversationId, isFromPage: false, isRead: false },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount },
    })

    this.eventsGateway.emitToOrg(orgId, 'conversation:read', {
      conversationId,
      unreadCount,
    })
  }

  private async markOutboundMessagesAsRead(conversationId: string, orgId: string, readAt: Date) {
    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        isFromPage: true,
        createdTime: { lte: readAt },
        OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'read' } }],
      },
      select: { id: true, platformMsgId: true },
    })
    if (messages.length === 0) return

    await this.prisma.directMessage.updateMany({
      where: { id: { in: messages.map((message) => message.id) } },
      data: { deliveryStatus: 'read' },
    })

    for (const message of messages) {
      this.eventsGateway.emitToOrg(orgId, 'message:status', {
        conversationId,
        messageId: message.id,
        platformMsgId: message.platformMsgId,
        deliveryStatus: 'read',
      })
    }
  }

  private async downloadWhatsAppMedia(
    socialAccountId: string,
    mediaId?: string,
  ): Promise<string | null> {
    if (!mediaId) return null

    try {
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { accessToken: true },
      })
      if (!account) throw new NotFoundException('Social account not found')
      const accessToken = await this.encryptionService.decrypt(account.accessToken)

      // 1. Get media URL from WhatsApp
      const metaRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${mediaId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!metaRes.ok) return null

      const metaData = (await metaRes.json()) as { url?: string }
      if (!metaData.url) return null

      // 2. Download the media and upload to our storage
      const downloadRes = await fetch(metaData.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!downloadRes.ok) return null

      const buffer = Buffer.from(await downloadRes.arrayBuffer())
      const uploaded = await this.uploadService.uploadBuffer(
        buffer,
        `whatsapp-${mediaId}`,
        downloadRes.headers.get('content-type') || 'application/octet-stream',
        'chat-media',
      )
      return uploaded || null
    } catch (error) {
      this.logger.error(`[WhatsApp] Failed to download media ${mediaId}: ${error}`)
      return null
    }
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from 'generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { MessagingCommonService } from './messaging-common.service'
import { ConversationSyncService } from './conversation-sync.service'
import {
  HISTORY_MAX_PAGES,
  HistoricalMessageInput,
  HistoryConversationRef,
  MetaConversationListResponse,
  MetaMessageListResponse,
} from './messaging.types'

@Injectable()
export class ConversationHistoryService {
  private readonly logger = new Logger(ConversationHistoryService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private common: MessagingCommonService,
    private sync: ConversationSyncService,
  ) {}

  // ─── Backfill conversation history from platform ───

  /**
   * Fetch the last `limit` messages for this conversation directly from the platform
   * and persist them locally. Used to give the AI agent enough context the very first
   * time we receive a message on a thread that already existed before the user
   * connected the account (or before they enabled the agent).
   *
   * - Facebook Messenger / Instagram DM: fetches `/{pageId or me}/conversations` filtered
   *   by `user_id={participantId}` with `messages.limit(N)` embedded.
   * - WhatsApp: the Cloud API does not expose a conversation history endpoint, so we
   *   no-op and log.
   *
   * Idempotent: messages are upserted by `platformMsgId`, so re-runs are safe.
   */
  async backfillConversationHistory(conversationId: string, limit = 20): Promise<number> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            accessToken: true,
          },
        },
      },
    })
    if (!conversation) return 0

    const provider = conversation.socialAccount.provider

    if (provider === 'WHATSAPP') {
      this.logger.log(
        `[Backfill] WhatsApp does not expose a history API — skipping conversation ${conversationId}`,
      )
      return 0
    }

    if (provider !== 'FACEBOOK' && provider !== 'INSTAGRAM') return 0

    let accessToken: string
    try {
      accessToken = await this.encryptionService.decrypt(conversation.socialAccount.accessToken)
    } catch (error) {
      this.logger.warn(
        `[Backfill] Failed to decrypt token for account ${conversation.socialAccount.id}: ${error instanceof Error ? error.message : error}`,
      )
      return 0
    }

    const pageId = conversation.socialAccount.providerAccountId
    const baseUrl =
      provider === 'INSTAGRAM'
        ? `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/me`
        : `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageId}`

    const params = new URLSearchParams({
      user_id: conversation.participantId,
      fields: `participants,messages.limit(${limit}){message,from,created_time,attachments{mime_type,name,size,image_data}}`,
      access_token: accessToken,
    })
    if (provider === 'INSTAGRAM') params.set('platform', 'instagram')

    const url = `${baseUrl}/conversations?${params.toString()}`

    let body: {
      data?: Array<{
        id: string
        messages?: {
          data?: Array<{
            id: string
            message?: string
            from: { id: string; name?: string; username?: string }
            created_time: string
            attachments?: {
              data?: Array<{ mime_type?: string; image_data?: { url?: string } }>
            }
          }>
        }
      }>
    }

    try {
      const response = await fetch(url)
      if (!response.ok) {
        this.logger.warn(
          `[Backfill] ${provider} history fetch failed (${response.status}) for conversation ${conversationId}: ${await response.text()}`,
        )
        return 0
      }
      body = (await response.json()) as typeof body
    } catch (error) {
      this.logger.warn(
        `[Backfill] ${provider} history fetch threw for conversation ${conversationId}: ${error instanceof Error ? error.message : error}`,
      )
      return 0
    }

    const thread = body.data?.[0]
    if (!thread) return 0

    if (thread.id && thread.id !== conversation.platformThreadId) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { platformThreadId: thread.id },
      })
    }

    const messages = thread.messages?.data || []
    let inserted = 0

    for (const msg of messages) {
      const isFromPage = msg.from.id === pageId
      let mediaUrl: string | null = null
      let mediaType: string | null = null
      const attachment = msg.attachments?.data?.[0]
      if (attachment?.image_data?.url) {
        mediaUrl = attachment.image_data.url
        mediaType = 'image'
      }

      try {
        const result = await this.prisma.directMessage.upsert({
          where: { platformMsgId: msg.id },
          create: {
            conversationId,
            platformMsgId: msg.id,
            message: msg.message || '',
            senderId: msg.from.id,
            senderName: msg.from.username || msg.from.name || (isFromPage ? 'Page' : 'Utilisateur'),
            isFromPage,
            mediaUrl,
            mediaType,
            createdTime: new Date(msg.created_time),
            isRead: true, // historical messages — treat as already read
          },
          update: {},
        })
        if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted++
      } catch (error) {
        this.logger.warn(
          `[Backfill] Failed to upsert message ${msg.id}: ${error instanceof Error ? error.message : error}`,
        )
      }
    }

    this.logger.log(
      `[Backfill] ${provider} pulled ${messages.length} messages (${inserted} new) for conversation ${conversationId}`,
    )

    return inserted
  }

  // ─── Message history backfill (initial sync on connect) ───

  /**
   * Persist a single historical (backfilled) message.
   *
   * Shared by every backfill path (provider pull jobs and WhatsApp Coexistence
   * webhooks). Idempotent and concurrency-safe:
   *  - dedup is keyed on the provider message id (`platformMsgId`, UNIQUE), with
   *    a P2002 guard so a live webhook landing mid-sync never creates a dup;
   *  - it never increments `unreadCount` and never lowers a newer
   *    `lastMessageAt`, so a message arriving live during the backfill keeps the
   *    conversation's up-to-date state intact.
   *
   * Returns true when a new row was inserted.
   */
  async handleHistoricalMessage(params: HistoricalMessageInput): Promise<boolean> {
    const { socialAccountId, participantId, platformMsgId } = params
    if (!platformMsgId) return false

    const existing = await this.prisma.directMessage.findUnique({
      where: { platformMsgId },
      select: { id: true },
    })
    if (existing) return false

    const displayText = params.message || (params.mediaType ? `[${params.mediaType}]` : '')

    // Upsert the conversation shell. On UPDATE we deliberately leave
    // lastMessage*/unreadCount untouched so we never clobber live state.
    const conversation = await this.prisma.conversation.upsert({
      where: { socialAccountId_participantId: { socialAccountId, participantId } },
      create: {
        socialAccountId,
        platformThreadId: params.platformThreadId ?? null,
        participantId,
        participantName: params.participantName || participantId,
        participantUsername: params.participantUsername ?? null,
        participantAvatar: params.participantAvatar ?? null,
        lastMessageText: displayText,
        lastMessageAt: params.timestamp,
        unreadCount: 0,
      },
      update: {
        ...(params.platformThreadId ? { platformThreadId: params.platformThreadId } : {}),
        ...(params.participantName ? { participantName: params.participantName } : {}),
        ...(params.participantUsername ? { participantUsername: params.participantUsername } : {}),
        ...(params.participantAvatar ? { participantAvatar: params.participantAvatar } : {}),
      },
    })

    // Resolve reply target if we already stored it.
    let replyToId: string | null = null
    if (params.replyToMid) {
      const repliedMsg = await this.prisma.directMessage.findUnique({
        where: { platformMsgId: params.replyToMid },
        select: { id: true },
      })
      replyToId = repliedMsg?.id || null
    }

    try {
      await this.prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          platformMsgId,
          message: params.message || '',
          senderId: params.senderId,
          senderName: params.senderName,
          isFromPage: params.isFromPage,
          isRead: true, // historical messages are treated as already read
          mediaUrl: params.mediaUrl ?? null,
          mediaType: params.mediaType ?? null,
          fileName: params.fileName ?? null,
          fileSize: params.fileSize ?? null,
          replyToId,
          deliveryStatus: params.deliveryStatus ?? null,
          metadata: (params.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          createdTime: params.timestamp,
        },
      })
    } catch (error) {
      // A concurrent webhook/sync inserted the same provider id first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false
      }
      throw error
    }

    // Move lastMessageAt forward only — never lower a value set by a live message.
    await this.prisma.conversation.updateMany({
      where: {
        id: conversation.id,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: params.timestamp } }],
      },
      data: { lastMessageText: displayText, lastMessageAt: params.timestamp },
    })

    return true
  }

  /**
   * Phase 1 of the connect-time backfill: list the account's conversations
   * touched within the configured window, upsert their shells, and return refs so
   * the caller can enqueue a per-conversation message backfill job for each.
   *
   * WhatsApp is intentionally excluded — its history is delivered through
   * Coexistence webhooks (no pull API), handled in WebhookService.
   */
  async listHistoryConversations(socialAccountId: string): Promise<HistoryConversationRef[]> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        disabled: true,
        featureDisabled: true,
      },
    })
    if (!account) return []
    if (this.common.isMessagingDisabled(account)) {
      this.logger.warn(
        `[History] messaging disabled for account ${socialAccountId} — skipping list`,
      )
      return []
    }

    const cutoff = this.common.historyCutoff()
    if (account.provider === 'FACEBOOK' || account.provider === 'INSTAGRAM') {
      const accessToken = await this.common.getDecryptedToken(socialAccountId)
      return this.listMetaHistoryConversations(
        account.id,
        account.providerAccountId,
        accessToken,
        cutoff,
        account.provider,
      )
    }
    if (account.provider === 'TIKTOK') {
      const accessToken = await this.common.getDecryptedToken(socialAccountId)
      return this.listTikTokHistoryConversations(
        account.id,
        account.providerAccountId,
        accessToken,
        cutoff,
      )
    }
    return []
  }

  /** Phase 2 of the connect-time backfill: pull this conversation's messages. */
  async syncConversationHistory(
    socialAccountId: string,
    ref: HistoryConversationRef,
  ): Promise<number> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        disabled: true,
        featureDisabled: true,
      },
    })
    if (!account) return 0
    if (this.common.isMessagingDisabled(account)) return 0

    const cutoff = this.common.historyCutoff()
    const accessToken = await this.common.getDecryptedToken(socialAccountId)

    if (account.provider === 'FACEBOOK' || account.provider === 'INSTAGRAM') {
      return this.syncMetaConversationHistory(
        account.id,
        account.providerAccountId,
        accessToken,
        ref,
        cutoff,
        account.provider,
      )
    }
    if (account.provider === 'TIKTOK') {
      return this.syncTikTokConversationHistory(
        account.id,
        account.providerAccountId,
        accessToken,
        ref,
        cutoff,
      )
    }
    return 0
  }

  // ─── Meta (Messenger / Instagram) backfill ───

  private async listMetaHistoryConversations(
    socialAccountId: string,
    pageOrIgId: string,
    accessToken: string,
    cutoff: Date,
    provider: 'FACEBOOK' | 'INSTAGRAM',
  ): Promise<HistoryConversationRef[]> {
    const base =
      provider === 'INSTAGRAM'
        ? `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/me`
        : `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${pageOrIgId}`
    const params = new URLSearchParams({
      fields: 'id,participants,updated_time,unread_count',
      limit: '50',
      access_token: accessToken,
    })
    if (provider === 'INSTAGRAM') params.set('platform', 'instagram')

    let url: string | null = `${base}/conversations?${params.toString()}`
    const refs: HistoryConversationRef[] = []
    let pages = 0

    while (url && pages < HISTORY_MAX_PAGES) {
      pages++
      let body: MetaConversationListResponse
      try {
        const response = await fetch(url)
        if (!response.ok) {
          this.logger.warn(
            `[History] ${provider} conversation list failed (${response.status}): ${await response.text()}`,
          )
          break
        }
        body = (await response.json()) as MetaConversationListResponse
      } catch (error) {
        this.logger.warn(
          `[History] ${provider} conversation list threw: ${error instanceof Error ? error.message : error}`,
        )
        break
      }

      let reachedWindowEdge = false
      for (const conv of body.data || []) {
        const updatedAt = conv.updated_time ? new Date(conv.updated_time) : null
        if (updatedAt && updatedAt < cutoff) {
          reachedWindowEdge = true
          continue
        }
        const participant = conv.participants?.data?.find((p) => p.id !== pageOrIgId)
        if (!participant) continue

        const fallbackName = provider === 'INSTAGRAM' ? 'Utilisateur Instagram' : 'Utilisateur'
        const conversation = await this.prisma.conversation.upsert({
          where: {
            socialAccountId_participantId: { socialAccountId, participantId: participant.id },
          },
          create: {
            socialAccountId,
            platformThreadId: conv.id,
            participantId: participant.id,
            participantName: participant.username || participant.name || fallbackName,
            participantUsername: participant.username || null,
          },
          update: {
            platformThreadId: conv.id,
            ...(participant.username || participant.name
              ? { participantName: participant.username || participant.name }
              : {}),
            ...(participant.username ? { participantUsername: participant.username } : {}),
          },
        })
        refs.push({
          conversationId: conversation.id,
          platformThreadId: conv.id,
          participantId: participant.id,
        })
      }

      // The conversations edge is ordered most-recent first, so once a page
      // contains a thread older than the cutoff we can stop paginating.
      url = reachedWindowEdge ? null : body.paging?.next || null
    }

    this.logger.log(
      `[History] ${provider} listed ${refs.length} conversation(s) within window for account ${socialAccountId}`,
    )
    return refs
  }

  private async syncMetaConversationHistory(
    socialAccountId: string,
    pageOrIgId: string,
    accessToken: string,
    ref: HistoryConversationRef,
    cutoff: Date,
    provider: 'FACEBOOK' | 'INSTAGRAM',
  ): Promise<number> {
    const threadId = ref.platformThreadId
    const participantId = ref.participantId
    if (!threadId || !participantId) return 0

    const host =
      provider === 'INSTAGRAM' ? 'https://graph.instagram.com' : 'https://graph.facebook.com'
    const params = new URLSearchParams({
      fields: 'id,message,from,created_time,attachments{mime_type,name,size,image_data}',
      limit: '50',
      access_token: accessToken,
    })
    let url: string | null =
      `${host}/${FACEBOOK_GRAPH_API_VERSION}/${threadId}/messages?${params.toString()}`
    let inserted = 0
    let pages = 0

    while (url && pages < HISTORY_MAX_PAGES) {
      pages++
      let body: MetaMessageListResponse
      try {
        const response = await fetch(url)
        if (!response.ok) {
          this.logger.warn(
            `[History] ${provider} message list failed (${response.status}) thread ${threadId}: ${await response.text()}`,
          )
          break
        }
        body = (await response.json()) as MetaMessageListResponse
      } catch (error) {
        this.logger.warn(
          `[History] ${provider} message list threw thread ${threadId}: ${error instanceof Error ? error.message : error}`,
        )
        break
      }

      let reachedWindowEdge = false
      for (const msg of body.data || []) {
        const createdTime = new Date(msg.created_time)
        if (createdTime < cutoff) {
          reachedWindowEdge = true
          continue
        }
        const isFromPage = msg.from?.id === pageOrIgId
        const attachment = msg.attachments?.data?.[0]
        const mediaUrl = attachment?.image_data?.url || null
        const created = await this.handleHistoricalMessage({
          socialAccountId,
          participantId,
          platformThreadId: threadId,
          platformMsgId: msg.id,
          message: msg.message || '',
          senderId: msg.from?.id || (isFromPage ? pageOrIgId : participantId),
          senderName: msg.from?.username || msg.from?.name || (isFromPage ? 'Page' : 'Utilisateur'),
          isFromPage,
          mediaUrl,
          mediaType: mediaUrl ? 'image' : null,
          timestamp: createdTime,
        })
        if (created) inserted++
      }

      url = reachedWindowEdge ? null : body.paging?.next || null
    }

    await this.markConversationHistorySynced(ref.conversationId)
    this.logger.log(
      `[History] ${provider} backfilled ${inserted} message(s) for conversation ${ref.conversationId}`,
    )
    return inserted
  }

  // ─── TikTok backfill ───

  private async listTikTokHistoryConversations(
    socialAccountId: string,
    businessId: string,
    accessToken: string,
    cutoff: Date,
  ): Promise<HistoryConversationRef[]> {
    const refs: HistoryConversationRef[] = []
    for (const conversationType of ['SINGLE', 'STRANGER'] as const) {
      let cursor: string | undefined
      let pages = 0
      do {
        pages++
        const url = new URL(
          'https://business-api.tiktok.com/open_api/v1.3/business/message/conversation/list/',
        )
        url.searchParams.set('business_id', businessId)
        url.searchParams.set('conversation_type', conversationType)
        url.searchParams.set('limit', '100')
        if (cursor) url.searchParams.set('cursor', cursor)

        const response = await fetch(url.toString(), { headers: { 'Access-Token': accessToken } })
        const body = await this.common.readTikTokResponse<{
          conversations?: Array<{ conversation_id: string; update_time?: string | number }>
          has_more?: boolean
          next_cursor?: string
        }>(response, `history list ${conversationType} conversations`)

        for (const conv of body.data?.conversations || []) {
          if (!conv.conversation_id) continue
          const updatedAt = this.common.parseTikTokTimestamp(conv.update_time)
          if (updatedAt < cutoff) continue
          refs.push({
            conversationId: null,
            platformThreadId: conv.conversation_id,
            participantId: null,
          })
        }
        cursor = body.data?.has_more ? body.data?.next_cursor : undefined
      } while (cursor && pages < HISTORY_MAX_PAGES)
    }

    this.logger.log(
      `[History] TikTok listed ${refs.length} conversation(s) within window for account ${socialAccountId}`,
    )
    return refs
  }

  private async syncTikTokConversationHistory(
    socialAccountId: string,
    businessId: string,
    accessToken: string,
    ref: HistoryConversationRef,
    cutoff: Date,
  ): Promise<number> {
    const conversationId = ref.platformThreadId
    if (!conversationId) return 0

    const body = await this.common.fetchTikTokConversationContent(
      businessId,
      accessToken,
      conversationId,
      'history conversation messages',
    )

    const messages = (body.data?.messages || []).sort(
      (a, b) =>
        this.common.parseTikTokTimestamp(a.timestamp).getTime() -
        this.common.parseTikTokTimestamp(b.timestamp).getTime(),
    )
    const personalParticipant = this.common.findTikTokConversationParticipant(
      body.data?.participants || [],
    )
    const fallbackUser = messages.find((m) =>
      this.common.isTikTokPersonalRole(m.from_user?.role),
    )?.from_user
    const participantId =
      personalParticipant?.id ||
      fallbackUser?.id ||
      messages.find((m) => m.sender && m.sender !== businessId)?.sender ||
      conversationId
    const participantName =
      personalParticipant?.display_name ||
      fallbackUser?.display_name ||
      personalParticipant?.id ||
      'Utilisateur TikTok'
    const participantAvatar = await this.sync.mirrorTikTokParticipantAvatar(
      socialAccountId,
      participantId,
      personalParticipant?.profile_image || null,
    )

    let inserted = 0
    for (const msg of messages) {
      if (!msg.message_id) continue
      const createdTime = this.common.parseTikTokTimestamp(msg.timestamp)
      if (createdTime < cutoff) continue

      const isFromPage =
        this.common.isTikTokBusinessRole(msg.from_user?.role) || msg.sender === businessId
      const mapped = await this.sync.mapTikTokMessageForStorage(
        businessId,
        accessToken,
        conversationId,
        msg,
      )
      const created = await this.handleHistoricalMessage({
        socialAccountId,
        participantId,
        platformThreadId: conversationId,
        participantName,
        participantAvatar,
        platformMsgId: msg.message_id,
        message: mapped.message,
        senderId: msg.from_user?.id || msg.sender || (isFromPage ? businessId : participantId),
        senderName: isFromPage ? 'Page' : msg.from_user?.display_name || participantName,
        isFromPage,
        mediaUrl: mapped.mediaUrl,
        mediaType: mapped.mediaType,
        fileName: mapped.fileName,
        fileSize: mapped.fileSize,
        replyToMid: msg.referenced_message_info?.referenced_message_id || null,
        metadata: (mapped.metadata as unknown as Record<string, unknown> | undefined) ?? null,
        timestamp: createdTime,
      })
      if (created) inserted++
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { socialAccountId_participantId: { socialAccountId, participantId } },
      select: { id: true },
    })
    await this.markConversationHistorySynced(conversation?.id ?? null)

    this.logger.log(
      `[History] TikTok backfilled ${inserted} message(s) for conversation ${conversationId}`,
    )
    return inserted
  }

  private async markConversationHistorySynced(conversationId: string | null): Promise<void> {
    if (!conversationId) return
    await this.prisma.conversation
      .update({ where: { id: conversationId }, data: { historySyncedAt: new Date() } })
      .catch(() => undefined)
  }
}

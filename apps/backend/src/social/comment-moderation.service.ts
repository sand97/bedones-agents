import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { AIService, type AIAnalysisResult } from './ai.service'
import { CatalogService } from '../catalog/catalog.service'
import { EventsGateway } from '../gateway/events.gateway'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { SocialHealthService } from './social-health.service'

/**
 * AI comment moderation: analyse an incoming comment, reconstruct its thread,
 * resolve referenced products, and execute the resulting action (hide / delete /
 * reply) across Meta (Facebook + Instagram) and TikTok.
 */
@Injectable()
export class CommentModerationService {
  private readonly logger = new Logger(CommentModerationService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private aiService: AIService,
    private catalogService: CatalogService,
    private eventsGateway: EventsGateway,
    private socialHealth: SocialHealthService,
  ) {}

  // ─── AI analysis + auto-action ───

  async analyzeAndAct(
    socialAccountId: string,
    commentId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK',
    orgId: string,
    comment: { id: string; message: string; fromName: string; fromId: string },
  ) {
    try {
      // Load page settings + FAQ rules
      const settings = await this.prisma.pageSettings.findUnique({
        where: { socialAccountId },
        include: { faqRules: true },
      })

      if (!settings) {
        this.logger.warn(`[AI] No settings found for account ${socialAccountId}, skipping AI`)
        return
      }

      if (!settings.isConfigured) {
        this.logger.log(`[AI] AI not configured for account ${socialAccountId}, skipping`)
        return
      }

      // Per-post agent override: a post toggled OFF disables agent replies to its comments.
      const dbComment = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      })
      if (dbComment) {
        const dbPost = await this.prisma.post.findUnique({
          where: { id: dbComment.postId },
          select: { aiOverride: true },
        })
        if (dbPost?.aiOverride === 'FORCE_OFF') {
          this.logger.log(
            `[AI] Agent disabled for post ${dbComment.postId}; skipping comment ${commentId}`,
          )
          return
        }
      }

      // Resolve access token once — used for the thread fetch and (later) for the action.
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { accessToken: true, providerAccountId: true },
      })
      if (!account) throw new NotFoundException('Social account not found')
      const accessToken = await this.encryptionService.decrypt(account.accessToken)

      // Pull the parent reply chain from the platform so the agent can see what was
      // already said and avoid repeating the same canned answer.
      const { post, thread } = await this.fetchCommentThread({
        commentId,
        provider,
        socialAccountId,
        pageId: account.providerAccountId,
        accessToken,
      })

      // If a catalog is linked to this page, resolve any product code mentioned in the
      // post so the agent can answer price/availability questions on the right item.
      const products = await this.resolvePostProducts({
        catalogId: settings.catalogId,
        postMessage: post?.message ?? null,
        accessToken,
      })

      const result = await this.aiService.analyzeComment({
        comment,
        post,
        thread,
        products,
        pageSettings: {
          undesiredCommentsAction: settings.undesiredCommentsAction,
          spamAction: settings.spamAction,
          customInstructions: settings.customInstructions,
          faqRules: settings.faqRules.map((r) => ({
            question: r.question,
            answer: r.answer,
          })),
        },
      })

      this.logger.log(`[AI] Comment ${commentId}: action=${result.action}, reason=${result.reason}`)

      if (result.action === 'none') return

      await this.executeAIAction(
        commentId,
        provider,
        result,
        accessToken,
        orgId,
        socialAccountId,
        comment,
      )
    } catch (error) {
      this.logger.error(`[AI] Failed to analyze/act on comment ${commentId}:`, error)
    }
  }

  // ─── Comment thread reconstruction ───

  /**
   * Walk the parent chain of the given comment so the AI can see the full
   * conversation up to (but not including) the comment being analyzed. The result
   * is ordered oldest → newest. The post itself is returned separately.
   *
   * Tries the platform API first (fresh data, includes parents we may never have
   * stored locally); falls back to walking local DB rows by `parentId` when the API
   * call fails.
   */
  private async fetchCommentThread(args: {
    commentId: string
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK'
    socialAccountId: string
    pageId: string
    accessToken: string
  }): Promise<{
    post: { message: string | null; permalinkUrl: string | null } | undefined
    thread: Array<{ fromName: string; message: string; isPageReply: boolean }>
  }> {
    // Locate the comment + its post in DB so we always have post context, even if
    // the platform call fails.
    const localComment = await this.prisma.comment.findUnique({
      where: { id: args.commentId },
      select: {
        id: true,
        parentId: true,
        post: { select: { id: true, message: true, permalinkUrl: true } },
      },
    })

    const post = localComment?.post
      ? { message: localComment.post.message, permalinkUrl: localComment.post.permalinkUrl }
      : undefined

    // No parent → it's a top-level comment, no thread to surface.
    if (!localComment?.parentId) {
      return { post, thread: [] }
    }

    let thread: Array<{ fromName: string; message: string; isPageReply: boolean }> = []

    try {
      if (args.provider === 'FACEBOOK' || args.provider === 'INSTAGRAM') {
        thread = await this.fetchMetaCommentThread(
          localComment.parentId,
          args.provider,
          args.pageId,
          args.accessToken,
        )
      } else if (args.provider === 'TIKTOK') {
        thread = await this.fetchTikTokCommentThread(
          localComment.parentId,
          args.pageId,
          localComment.post?.id || '',
          args.accessToken,
        )
      }
    } catch (error) {
      this.logger.warn(
        `[AI] Thread fetch failed for ${args.commentId} on ${args.provider}: ${error instanceof Error ? error.message : error}`,
      )
    }

    // Fallback to local DB walk when the platform returned nothing usable.
    if (thread.length === 0) {
      thread = await this.walkLocalCommentThread(localComment.parentId)
    }

    return { post, thread }
  }

  /**
   * Facebook & Instagram: a single Graph call with nested `parent` selectors retrieves
   * up to 4 ancestors. Returns ordered oldest → newest.
   */
  private async fetchMetaCommentThread(
    startCommentId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM',
    pageId: string,
    accessToken: string,
  ): Promise<Array<{ fromName: string; message: string; isPageReply: boolean }>> {
    const baseUrl =
      provider === 'INSTAGRAM'
        ? `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}`
        : `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`

    // Nested parent selector: each level adds one ancestor. 4 levels is enough for
    // virtually every real comment chain we'll encounter.
    const leaf = 'id,message,from{id,name,username},created_time'
    const fields = `${leaf},parent{${leaf},parent{${leaf},parent{${leaf}}}}`
    const url = `${baseUrl}/${startCommentId}?fields=${fields}&access_token=${accessToken}`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Graph API ${response.status}: ${await response.text()}`)
    }

    type Node = {
      id?: string
      message?: string
      from?: { id?: string; name?: string; username?: string }
      created_time?: string
      parent?: Node
    }
    const data = (await response.json()) as Node

    const chain: Node[] = []
    let cursor: Node | undefined = data
    while (cursor && cursor.id) {
      chain.push(cursor)
      cursor = cursor.parent
    }

    // chain is currently newest → oldest (current parent first), reverse it.
    chain.reverse()

    return chain.map((n) => {
      const fromId = n.from?.id || ''
      return {
        fromName: n.from?.username || n.from?.name || (fromId === pageId ? 'Page' : 'User'),
        message: n.message || '',
        isPageReply: !!fromId && fromId === pageId,
      }
    })
  }

  /**
   * TikTok: walks up via `parent_comment_id`, fetching one comment per level via the
   * business comment list API. Capped at 5 levels to avoid runaway recursion on
   * pathological threads.
   */
  private async fetchTikTokCommentThread(
    startCommentId: string,
    openId: string,
    videoId: string,
    accessToken: string,
  ): Promise<Array<{ fromName: string; message: string; isPageReply: boolean }>> {
    if (!videoId) return []

    const visited = new Set<string>()
    const chain: Array<{ fromName: string; message: string; isPageReply: boolean }> = []
    let cursor: string | null = startCommentId

    for (let i = 0; i < 5 && cursor && !visited.has(cursor); i++) {
      visited.add(cursor)

      const params = new URLSearchParams({
        business_id: openId,
        video_id: videoId,
      })
      params.append('comment_ids', JSON.stringify([cursor]))
      const url = `https://business-api.tiktok.com/open_api/v1.3/business/comment/list/?${params}`

      const response = await fetch(url, {
        headers: { 'Access-Token': accessToken },
      })
      if (!response.ok) break

      const raw = await response.text()
      const body = JSON.parse(raw) as {
        code: number
        data?: {
          comments?: Array<{
            comment_id: string
            text: string
            owner?: boolean
            display_name?: string
            username?: string
          }>
        }
      }
      if (body.code !== 0) break
      const found = body.data?.comments?.[0]
      if (!found) break

      chain.push({
        fromName: found.display_name || found.username || (found.owner ? 'Page' : 'User'),
        message: found.text || '',
        isPageReply: found.owner === true,
      })

      // Extract the parent_comment_id straight from the raw JSON to avoid BigInt
      // precision loss on big TikTok IDs.
      const parentMatch = raw.match(/"parent_comment_id"\s*:\s*"?(\d+)"?/)
      const next = parentMatch?.[1] || null
      cursor = next && next !== '0' ? next : null
    }

    chain.reverse()
    return chain
  }

  /**
   * Last-resort fallback that uses whatever we already stored locally. Only useful
   * for comments we've previously upserted (so it's reliable for self-replies and
   * recently-active threads where every parent already passed through a webhook).
   */
  private async walkLocalCommentThread(
    startCommentId: string,
  ): Promise<Array<{ fromName: string; message: string; isPageReply: boolean }>> {
    const chain: Array<{ fromName: string; message: string; isPageReply: boolean }> = []
    const visited = new Set<string>()
    let cursor: string | null = startCommentId

    for (let i = 0; i < 5 && cursor && !visited.has(cursor); i++) {
      visited.add(cursor)
      const node: {
        parentId: string | null
        message: string
        fromName: string
        isPageReply: boolean
      } | null = await this.prisma.comment.findUnique({
        where: { id: cursor },
        select: { parentId: true, message: true, fromName: true, isPageReply: true },
      })
      if (!node) break
      chain.push({
        fromName: node.fromName,
        message: node.message,
        isPageReply: node.isPageReply,
      })
      cursor = node.parentId
    }

    chain.reverse()
    return chain
  }

  // ─── Product codes referenced in the post ───

  /**
   * When a catalog is linked to the commented page, scan the post caption for product
   * codes (merchant/retailer IDs) and resolve them against Meta so the agent can answer
   * with the real product name/price instead of replying generically. Returns [] when
   * no catalog is linked, no code is found, or nothing matches.
   *
   * Meta lets us look products up by `retailer_id` directly (no full-catalog scan), and
   * the lookup is cached in CatalogService so repeated comments on the same post don't
   * hammer the Graph API.
   */
  private async resolvePostProducts(args: {
    catalogId: string | null
    postMessage: string | null
    accessToken: string
  }): Promise<
    Array<{
      retailerId: string
      name: string | null
      price: number | null
      currency: string | null
    }>
  > {
    if (!args.catalogId || !args.postMessage) return []

    const codes = this.extractProductCodes(args.postMessage)
    if (codes.length === 0) return []

    const catalog = await this.prisma.catalog.findUnique({
      where: { id: args.catalogId },
      select: { providerId: true },
    })
    if (!catalog?.providerId) return []

    try {
      const hydrated = await this.catalogService.hydrateProductsByRetailerIdsWithAccessToken(
        catalog.providerId,
        codes,
        args.accessToken,
      )
      // Keep only entries Meta actually resolved (a real product name means it matched).
      return hydrated
        .filter((p) => p.name)
        .map((p) => ({
          retailerId: p.retailerId,
          name: p.name,
          price: p.price,
          currency: p.currency,
        }))
    } catch (error) {
      this.logger.warn(
        `[AI] Product code resolution failed: ${error instanceof Error ? error.message : error}`,
      )
      return []
    }
  }

  /**
   * Extract candidate product codes from a post caption. We look for codes that follow
   * a keyword (ref / réf / code / sku / art / article / produit / product) and for
   * hashtag-style tokens. Meta does the final matching against real retailer IDs, so
   * over-extracting a few extra candidates is harmless — we just cap the count.
   */
  private extractProductCodes(text: string): string[] {
    const codes = new Set<string>()

    const keywordRegex =
      /\b(?:r[ée]f(?:[ée]rence)?|code|sku|art(?:icle)?|produit|product)\s*(?:n[°o]\s*)?[:#-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{1,40})/gi
    const hashtagRegex = /#([A-Za-z0-9][A-Za-z0-9_-]{1,40})/g

    let match: RegExpExecArray | null
    while ((match = keywordRegex.exec(text)) !== null) {
      if (match[1]) codes.add(match[1])
    }
    while ((match = hashtagRegex.exec(text)) !== null) {
      if (match[1]) codes.add(match[1])
    }

    // Cap to keep the Meta filter payload bounded.
    return Array.from(codes).slice(0, 15)
  }

  /**
   * Feeds the result of an automated moderation call into the circuit breaker:
   * a success resets the counter, a failure increments it (tripping past the
   * threshold) so a page that lost its permissions eventually stops being hit.
   */
  private async recordModerationOutcome(
    ok: boolean,
    socialAccountId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK',
    action: string,
    errorText?: string,
  ) {
    if (ok) {
      await this.socialHealth.recordSuccess(socialAccountId)
      return
    }
    await this.socialHealth.recordError({
      socialAccountId,
      provider,
      operation: `aiModerate:${action}`,
      feature: 'COMMENT',
      resource: provider === 'INSTAGRAM' ? 'instagram' : provider === 'TIKTOK' ? 'tiktok' : 'page',
      error: new Error(errorText || `aiModerate ${action} failed`),
    })
  }

  private async executeAIAction(
    commentId: string,
    provider: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK',
    result: AIAnalysisResult,
    accessToken: string,
    orgId: string,
    socialAccountId: string,
    comment: { fromName: string; fromId: string },
  ) {
    // Circuit breaker: keep ingesting the incoming comment, but skip the
    // automated outbound moderation when the account / COMMENT feature is
    // disabled after repeated errors or missing permissions.
    const health = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true, provider: true, disabled: true, featureDisabled: true },
    })
    if (!health) return
    try {
      this.socialHealth.ensureOutboundAllowed(health, 'COMMENT')
    } catch {
      this.logger.warn(
        `[AI] Skipping ${result.action} on disabled account ${socialAccountId} (provider=${provider})`,
      )
      return
    }

    if (provider === 'TIKTOK') {
      await this.executeTikTokAIAction(commentId, result, accessToken, orgId, socialAccountId)
      return
    }

    const baseUrl =
      provider === 'INSTAGRAM'
        ? `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}`
        : `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`

    if (result.action === 'hide') {
      const hideUrl =
        provider === 'INSTAGRAM'
          ? `${baseUrl}/${commentId}?hide=true&access_token=${accessToken}`
          : `${baseUrl}/${commentId}?access_token=${accessToken}`

      const body = provider === 'FACEBOOK' ? JSON.stringify({ is_hidden: true }) : undefined
      const response = await fetch(hideUrl, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })

      if (response.ok) {
        await this.prisma.comment.update({
          where: { id: commentId },
          data: { status: 'HIDDEN', action: 'HIDE', actionReason: result.reason, isRead: true },
        })
        this.logger.log(`[AI] Hidden comment ${commentId}`)
        await this.recordModerationOutcome(true, socialAccountId, provider, 'hide')
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'hide',
        })
      } else {
        const errorText = await response.text()
        this.logger.error(`[AI] Failed to hide comment: ${errorText}`)
        await this.recordModerationOutcome(false, socialAccountId, provider, 'hide', errorText)
      }
    }

    if (result.action === 'delete') {
      const response = await fetch(`${baseUrl}/${commentId}?access_token=${accessToken}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await this.prisma.comment.update({
          where: { id: commentId },
          data: { status: 'DELETED', action: 'DELETE', actionReason: result.reason, isRead: true },
        })
        this.logger.log(`[AI] Deleted comment ${commentId}`)
        await this.recordModerationOutcome(true, socialAccountId, provider, 'delete')
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'delete',
        })
      } else {
        const errorText = await response.text()
        this.logger.error(`[AI] Failed to delete comment: ${errorText}`)
        await this.recordModerationOutcome(false, socialAccountId, provider, 'delete', errorText)
      }
    }

    if (result.action === 'reply' && result.replyMessage) {
      // Tag the user so they get a notification
      const taggedMessage =
        provider === 'FACEBOOK'
          ? `@[${comment.fromId}] ${result.replyMessage}`
          : `@${comment.fromName} ${result.replyMessage}`

      const replyUrl =
        provider === 'INSTAGRAM'
          ? `${baseUrl}/${commentId}/replies?access_token=${accessToken}`
          : `${baseUrl}/${commentId}/comments?access_token=${accessToken}`

      const response = await fetch(replyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: taggedMessage }),
      })

      if (response.ok) {
        // Use the real Facebook/Instagram comment ID to avoid duplicates with incoming webhooks
        const responseData = (await response.json()) as { id?: string }
        const replyId = responseData.id || `ai_reply_${Date.now()}_${commentId}`

        const replyComment = await this.prisma.comment.findUnique({
          where: { id: commentId },
          select: { postId: true },
        })

        if (replyComment) {
          await this.prisma.comment.upsert({
            where: { id: replyId },
            create: {
              id: replyId,
              postId: replyComment.postId,
              parentId: commentId,
              message: taggedMessage,
              fromId: 'ai',
              fromName: 'Page (IA)',
              createdTime: new Date(),
              isRead: true,
              isPageReply: true,
              action: 'REPLY',
              actionReason: result.reason,
              replyMessage: result.replyMessage,
            },
            update: {},
          })
        }

        await this.prisma.comment.update({
          where: { id: commentId },
          data: { action: 'REPLY', actionReason: result.reason, isRead: true },
        })

        this.logger.log(`[AI] Replied to comment ${commentId}`)
        await this.recordModerationOutcome(true, socialAccountId, provider, 'reply')
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'reply',
        })
      } else {
        const errorText = await response.text()
        this.logger.error(`[AI] Failed to reply to comment: ${errorText}`)
        await this.recordModerationOutcome(false, socialAccountId, provider, 'reply', errorText)
      }
    }
  }

  private async executeTikTokAIAction(
    commentId: string,
    result: AIAnalysisResult,
    accessToken: string,
    orgId: string,
    socialAccountId: string,
  ) {
    const provider = 'TIKTOK' as const

    // TikTok: hide via Business API
    if (result.action === 'hide') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      })
      if (!comment) return

      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { providerAccountId: true },
      })
      if (!account) return

      try {
        const hideResponse = await fetch(
          'https://business-api.tiktok.com/open_api/v1.3/business/comment/hide/',
          {
            method: 'POST',
            headers: {
              'Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              business_id: account.providerAccountId,
              video_id: comment.postId,
              comment_id: commentId,
              action: 'HIDE',
            }),
          },
        )
        const hideBody = (await hideResponse.json()) as { code: number; message: string }
        if (hideBody.code !== 0) {
          this.logger.error(`[AI] TikTok hide failed: ${hideBody.code} — ${hideBody.message}`)
        }
      } catch (error) {
        this.logger.error(`[AI] TikTok hide error: ${error}`)
      }

      await this.prisma.comment.update({
        where: { id: commentId },
        data: { status: 'HIDDEN', action: 'HIDE', actionReason: result.reason, isRead: true },
      })
      this.logger.log(`[AI] Hidden TikTok comment ${commentId}`)
      this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
        commentId,
        socialAccountId,
        provider,
        action: 'hide',
      })
    }

    // TikTok: delete via Business API
    if (result.action === 'delete') {
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { providerAccountId: true },
      })

      if (account) {
        try {
          const deleteResponse = await fetch(
            'https://business-api.tiktok.com/open_api/v1.3/business/comment/delete/',
            {
              method: 'POST',
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                business_id: account.providerAccountId,
                comment_id: commentId,
              }),
            },
          )
          const deleteBody = (await deleteResponse.json()) as { code: number; message: string }
          if (deleteBody.code !== 0) {
            this.logger.error(
              `[AI] TikTok delete failed: ${deleteBody.code} — ${deleteBody.message}`,
            )
          }
        } catch (error) {
          this.logger.error(`[AI] TikTok delete error: ${error}`)
        }
      }

      await this.prisma.comment.delete({
        where: { id: commentId },
      })
      this.logger.log(`[AI] Deleted TikTok comment ${commentId}`)
      this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
        commentId,
        socialAccountId,
        provider,
        action: 'delete',
      })
    }

    if (result.action === 'reply' && result.replyMessage) {
      const replyComment = await this.prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      })
      if (!replyComment) return

      // Get the open_id (business_id) for the Business API
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { providerAccountId: true },
      })
      if (!account) throw new NotFoundException('Social account not found')

      const response = await fetch(
        'https://business-api.tiktok.com/open_api/v1.3/business/comment/reply/create/',
        {
          method: 'POST',
          headers: {
            'Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            business_id: account.providerAccountId,
            video_id: replyComment.postId,
            comment_id: commentId,
            text: result.replyMessage,
          }),
        },
      )

      const replyText = await response.text()
      this.logger.log(`[AI] TikTok reply response: ${replyText}`)

      // Extract comment_id from raw text to avoid BigInt precision loss
      const replyIdMatch = replyText.match(/"comment_id"\s*:\s*"?(\d+)"?/)
      const replyBody = JSON.parse(replyText) as {
        code: number
        message: string
      }

      if (replyBody.code === 0) {
        const replyId = replyIdMatch?.[1] || `tiktok_ai_reply_${Date.now()}_${commentId}`

        await this.prisma.comment.upsert({
          where: { id: replyId },
          create: {
            id: replyId,
            postId: replyComment.postId,
            parentId: commentId,
            message: result.replyMessage,
            fromId: 'ai',
            fromName: 'Page (IA)',
            createdTime: new Date(),
            isRead: true,
            isPageReply: true,
            action: 'REPLY',
            actionReason: result.reason,
            replyMessage: result.replyMessage,
          },
          update: {},
        })

        await this.prisma.comment.update({
          where: { id: commentId },
          data: { action: 'REPLY', actionReason: result.reason, isRead: true },
        })

        this.logger.log(`[AI] Replied to TikTok comment ${commentId}`)
        this.eventsGateway.emitToOrg(orgId, 'comment:updated', {
          commentId,
          socialAccountId,
          provider,
          action: 'reply',
        })
      } else {
        this.logger.error(
          `[AI] Failed to reply to TikTok comment: ${replyBody.code} — ${replyBody.message}`,
        )
      }
    }
  }
}

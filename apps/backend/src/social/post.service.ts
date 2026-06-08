import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../auth/encryption.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { SocialHealthService } from './social-health.service'
import { SocialCommonService } from './social-common.service'

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name)

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private socialHealth: SocialHealthService,
    private common: SocialCommonService,
  ) {}

  // ─── Get posts with comments for a social account ───

  async getPostsForAccount(userId: string, socialAccountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { organisationId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    await this.common.assertMembership(userId, account.organisationId)

    const posts = await this.prisma.post.findMany({
      where: { socialAccountId },
      include: {
        comments: {
          orderBy: { createdTime: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return posts.map((post) => ({
      ...post,
      totalComments: post.comments.length,
      unreadComments: post.comments.filter((c) => !c.isRead && !c.isPageReply).length,
    }))
  }

  // ─── Per-post agent activation (comment replies) ───

  /**
   * Returns the agent attached to this post's social account, the per-post override,
   * and whether the agent would currently reply to this post's comments. Used by the
   * post options menu to toggle agent replies on/off.
   */
  async getAgentStatusForPost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        aiOverride: true,
        socialAccount: {
          select: {
            organisationId: true,
            agentLink: {
              include: { agent: { select: { id: true, name: true, score: true, status: true } } },
            },
          },
        },
      },
    })
    if (!post) throw new NotFoundException('Post not found')
    await this.common.assertMembership(userId, post.socialAccount.organisationId)

    const agent = post.socialAccount.agentLink?.agent ?? null
    const override = post.aiOverride ?? null

    if (!agent) return { agent: null, override: null, isActive: false }

    const agentReady =
      agent.score >= 80 && agent.status !== 'DRAFT' && agent.status !== 'CONFIGURING'
    const isActive = override === 'FORCE_OFF' ? false : agentReady

    return { agent, override, isActive }
  }

  async setPostAgentOverride(userId: string, postId: string, override: 'FORCE_ON' | 'FORCE_OFF') {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        socialAccount: {
          select: {
            organisationId: true,
            agentLink: { include: { agent: { select: { score: true } } } },
          },
        },
      },
    })
    if (!post) throw new NotFoundException('Post not found')
    await this.common.assertMembership(userId, post.socialAccount.organisationId)

    const agent = post.socialAccount.agentLink?.agent
    if (!agent) {
      throw new BadRequestException('No agent is attached to this social account')
    }
    if (agent.score < 80) {
      throw new BadRequestException(
        "L'agent n'a pas encore un score suffisant pour être activé sur une publication.",
      )
    }

    await this.prisma.post.update({ where: { id: postId }, data: { aiOverride: override } })
    return this.getAgentStatusForPost(userId, postId)
  }

  // ─── Fetch fresh page posts straight from Meta ───
  // Local Post rows are only created when comments arrive via webhook, so the
  // table starts empty for inactive pages. This method talks to the Graph API
  // directly and upserts each result so FKs from ProductPostLink stay valid.

  async fetchProviderPosts(
    userId: string,
    socialAccountId: string,
    params?: { search?: string; limit?: number; after?: string },
  ): Promise<{
    posts: Array<{
      id: string
      message: string | null
      imageUrl: string | null
      permalinkUrl: string | null
      createdTime: string | null
    }>
    cursorAfter?: string
  }> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      omit: { accessToken: false },
    })
    if (!account) throw new NotFoundException('Social account not found')
    await this.common.assertMembership(userId, account.organisationId)

    if (account.provider === 'WHATSAPP') {
      return { posts: [] }
    }

    // TikTok has no live posts endpoint we can hit here — videos are synced
    // periodically into the local Post table via the Business API. Serve that
    // table directly with the same shape as Meta returns.
    if (account.provider === 'TIKTOK') {
      const search = params?.search?.trim().toLowerCase()
      const limit = Math.min(params?.limit ?? 25, 50)
      const posts = await this.prisma.post.findMany({
        where: {
          socialAccountId: account.id,
          ...(search ? { message: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return {
        posts: posts.map((p) => ({
          id: p.id,
          message: p.message,
          imageUrl: p.imageUrl,
          permalinkUrl: p.permalinkUrl,
          createdTime: p.createdAt.toISOString(),
        })),
      }
    }

    const accessToken = await this.encryptionService.decrypt(account.accessToken)
    const limit = Math.min(params?.limit ?? 25, 50)

    const { edge, fields, baseHost } =
      account.provider === 'FACEBOOK'
        ? {
            edge: 'posts',
            fields: 'id,message,full_picture,permalink_url,created_time',
            baseHost: 'https://graph.facebook.com',
          }
        : {
            edge: 'media',
            fields: 'id,caption,media_url,thumbnail_url,permalink,timestamp',
            // Instagram Basic Display / IG Login tokens go through graph.instagram.com.
            // Using graph.facebook.com here returns "Cannot parse access token".
            baseHost: 'https://graph.instagram.com',
          }

    const query = new URLSearchParams({
      fields,
      limit: String(limit),
      access_token: accessToken,
    })
    if (params?.after) query.set('after', params.after)

    const url = `${baseHost}/${FACEBOOK_GRAPH_API_VERSION}/${account.providerAccountId}/${edge}?${query}`
    const response = await fetch(url)
    if (!response.ok) {
      const errorText = await response.text()
      this.logger.warn(`fetchProviderPosts ${account.provider} error: ${errorText}`)
      const httpError = new BadRequestException(`Meta API error: ${errorText}`)
      // User-triggered read: log it (no breaker trip) so we don't lock the page out.
      await this.socialHealth.logError({
        socialAccountId: account.id,
        provider: account.provider,
        operation: 'fetchProviderPosts',
        resource: this.common.resourceForProvider(account.provider),
        error: httpError,
      })
      throw httpError
    }

    const data = (await response.json()) as {
      data: Array<Record<string, unknown>>
      paging?: { cursors?: { after?: string } }
    }

    const rawPosts = data.data ?? []
    const mapped = rawPosts.map((p) => {
      if (account.provider === 'FACEBOOK') {
        return {
          id: String(p.id ?? ''),
          message: (p.message as string | undefined) ?? null,
          imageUrl: (p.full_picture as string | undefined) ?? null,
          permalinkUrl: (p.permalink_url as string | undefined) ?? null,
          createdTime: (p.created_time as string | undefined) ?? null,
        }
      }
      return {
        id: String(p.id ?? ''),
        message: (p.caption as string | undefined) ?? null,
        imageUrl:
          (p.thumbnail_url as string | undefined) ?? (p.media_url as string | undefined) ?? null,
        permalinkUrl: (p.permalink as string | undefined) ?? null,
        createdTime: (p.timestamp as string | undefined) ?? null,
      }
    })

    // Optional client-side search — Meta's posts/media edges don't support it.
    const search = params?.search?.trim().toLowerCase()
    const filtered = search
      ? mapped.filter((p) => (p.message ?? '').toLowerCase().includes(search))
      : mapped

    // Mirror into local Post table so ProductPostLink / CollectionPostLink FKs
    // can reference these rows. Best-effort: failures shouldn't block the UI.
    await Promise.all(
      filtered.map((p) =>
        this.prisma.post
          .upsert({
            where: { id: p.id },
            create: {
              id: p.id,
              socialAccountId: account.id,
              message: p.message,
              imageUrl: p.imageUrl,
              permalinkUrl: p.permalinkUrl,
            },
            update: {
              message: p.message ?? undefined,
              imageUrl: p.imageUrl ?? undefined,
              permalinkUrl: p.permalinkUrl ?? undefined,
            },
          })
          .catch(() => null),
      ),
    )

    return { posts: filtered, cursorAfter: data.paging?.cursors?.after }
  }
}

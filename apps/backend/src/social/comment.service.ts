import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FACEBOOK_GRAPH_API_VERSION } from '../common/config/facebook-scopes.config'
import { SocialHealthService } from './social-health.service'
import { SocialCommonService } from './social-common.service'

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name)

  constructor(
    private prisma: PrismaService,
    private socialHealth: SocialHealthService,
    private common: SocialCommonService,
  ) {}

  // ─── User stats ───

  async getUserStats(userId: string, accountId: string, fromId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { organisationId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    await this.common.assertMembership(userId, account.organisationId)

    const comments = await this.prisma.comment.findMany({
      where: {
        fromId,
        isPageReply: false,
        post: { socialAccountId: accountId },
      },
      select: { status: true, fromName: true, fromAvatar: true },
    })

    const first = comments[0]

    return {
      fromId,
      fromName: first?.fromName || fromId,
      fromAvatar: first?.fromAvatar || null,
      totalComments: comments.length,
      hiddenComments: comments.filter((c) => c.status === 'HIDDEN').length,
      deletedComments: comments.filter((c) => c.status === 'DELETED').length,
    }
  }

  // ─── Mark comments as read ───

  async markCommentsAsRead(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { socialAccount: { select: { organisationId: true } } },
    })
    if (!post) throw new NotFoundException('Post not found')

    await this.common.assertMembership(userId, post.socialAccount.organisationId)

    await this.prisma.comment.updateMany({
      where: { postId, isRead: false },
      data: { isRead: true },
    })
  }

  // ─── Comment on a post (top-level) ───

  async commentOnPost(userId: string, postId: string, message: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            organisationId: true,
            disabled: true,
            featureDisabled: true,
          },
        },
      },
    })
    if (!post) throw new NotFoundException('Post not found')

    await this.common.assertMembership(userId, post.socialAccount.organisationId)
    const provider = post.socialAccount.provider

    if (provider === 'TIKTOK') {
      throw new BadRequestException('TikTok does not support top-level comments via API')
    }

    const accessToken = await this.common.getDecryptedToken(post.socialAccount.id)

    await this.socialHealth.wrapOutbound(
      post.socialAccount,
      {
        operation: 'commentOnPost',
        feature: 'COMMENT',
        resource: this.common.resourceForProvider(provider),
      },
      async () => {
        if (provider === 'FACEBOOK') {
          await this.facebookReplyToComment(postId, message, accessToken)
        } else if (provider === 'INSTAGRAM') {
          // Instagram: POST /{media-id}/comments
          const response = await fetch(
            `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${postId}/comments?access_token=${accessToken}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message }),
            },
          )
          if (!response.ok) {
            this.logger.error(`[Instagram] Comment on post failed: ${await response.text()}`)
            throw new BadRequestException('Failed to comment on Instagram post')
          }
        }
      },
    )

    const commentId = `comment_${Date.now()}_${postId}`
    return this.prisma.comment.create({
      data: {
        id: commentId,
        postId,
        message,
        fromId: post.socialAccount.id,
        fromName: 'Page',
        createdTime: new Date(),
        isRead: true,
        isPageReply: true,
      },
    })
  }

  // ─── Reply to a comment ───

  async replyToComment(userId: string, commentId: string, message: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                organisationId: true,
                disabled: true,
                featureDisabled: true,
              },
            },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.common.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.common.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    // Tag the user so they get a notification
    const taggedMessage =
      provider === 'FACEBOOK'
        ? `@[${comment.fromId}] ${message}`
        : `@${comment.fromName} ${message}`

    await this.socialHealth.wrapOutbound(
      comment.post.socialAccount,
      {
        operation: 'replyToComment',
        feature: 'COMMENT',
        resource: this.common.resourceForProvider(provider),
      },
      async () => {
        if (provider === 'FACEBOOK') {
          await this.facebookReplyToComment(commentId, taggedMessage, accessToken)
        } else if (provider === 'INSTAGRAM') {
          await this.instagramReplyToComment(commentId, taggedMessage, accessToken)
        }
      },
    )

    // Save the reply as a new comment (with tag)
    const replyId = `reply_${Date.now()}_${commentId}`
    return this.prisma.comment.create({
      data: {
        id: replyId,
        postId: comment.postId,
        parentId: commentId,
        message: taggedMessage,
        fromId: comment.post.socialAccount.id,
        fromName: 'Page',
        createdTime: new Date(),
        isRead: true,
        isPageReply: true,
      },
    })
  }

  // ─── Hide a comment ───

  async hideComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                organisationId: true,
                disabled: true,
                featureDisabled: true,
              },
            },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.common.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.common.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    await this.socialHealth.wrapOutbound(
      comment.post.socialAccount,
      {
        operation: 'hideComment',
        feature: 'COMMENT',
        resource: this.common.resourceForProvider(provider),
      },
      async () => {
        if (provider === 'FACEBOOK') {
          await this.facebookHideComment(commentId, accessToken)
        } else if (provider === 'INSTAGRAM') {
          await this.instagramHideComment(commentId, accessToken)
        } else if (provider === 'TIKTOK') {
          await this.tiktokHideComment(
            comment.post.socialAccount.id,
            comment.postId,
            commentId,
            accessToken,
            'HIDE',
          )
        }
      },
    )

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { status: 'HIDDEN', action: 'HIDE' },
    })
  }

  // ─── Unhide a comment ───

  async unhideComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                organisationId: true,
                disabled: true,
                featureDisabled: true,
              },
            },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.common.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.common.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    await this.socialHealth.wrapOutbound(
      comment.post.socialAccount,
      {
        operation: 'unhideComment',
        feature: 'COMMENT',
        resource: this.common.resourceForProvider(provider),
      },
      async () => {
        if (provider === 'FACEBOOK') {
          await this.facebookUnhideComment(commentId, accessToken)
        } else if (provider === 'INSTAGRAM') {
          await this.instagramUnhideComment(commentId, accessToken)
        } else if (provider === 'TIKTOK') {
          await this.tiktokHideComment(
            comment.post.socialAccount.id,
            comment.postId,
            commentId,
            accessToken,
            'UNHIDE',
          )
        }
      },
    )

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { status: 'VISIBLE', action: 'NONE', actionReason: null },
    })
  }

  // ─── Delete a comment ───

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            socialAccount: {
              select: {
                id: true,
                provider: true,
                organisationId: true,
                disabled: true,
                featureDisabled: true,
              },
            },
          },
        },
      },
    })
    if (!comment) throw new NotFoundException('Comment not found')

    await this.common.assertMembership(userId, comment.post.socialAccount.organisationId)

    const accessToken = await this.common.getDecryptedToken(comment.post.socialAccount.id)
    const provider = comment.post.socialAccount.provider

    await this.socialHealth.wrapOutbound(
      comment.post.socialAccount,
      {
        operation: 'deleteComment',
        feature: 'COMMENT',
        resource: this.common.resourceForProvider(provider),
      },
      async () => {
        if (provider === 'FACEBOOK') {
          await this.facebookDeleteComment(commentId, accessToken)
        } else if (provider === 'INSTAGRAM') {
          await this.instagramDeleteComment(commentId, accessToken)
        } else if (provider === 'TIKTOK') {
          await this.tiktokDeleteComment(comment.post.socialAccount.id, commentId, accessToken)
        }
      },
    )

    return this.prisma.comment.delete({
      where: { id: commentId },
    })
  }

  // ─── Facebook API actions ───

  private async facebookReplyToComment(commentId: string, message: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}/comments?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Reply failed: ${await response.text()}`)
      throw new BadRequestException('Failed to reply to comment')
    }
  }

  private async facebookHideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: true }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Hide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to hide comment')
    }
  }

  private async facebookUnhideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: false }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Unhide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to unhide comment')
    }
  }

  private async facebookDeleteComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      this.logger.error(`[Facebook] Delete failed: ${await response.text()}`)
      throw new BadRequestException('Failed to delete comment')
    }
  }

  // ─── Instagram API actions ───

  private async instagramReplyToComment(commentId: string, message: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}/replies?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Reply failed: ${await response.text()}`)
      throw new BadRequestException('Failed to reply to comment')
    }
  }

  private async instagramHideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?hide=true&access_token=${accessToken}`,
      { method: 'POST' },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Hide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to hide comment')
    }
  }

  private async instagramUnhideComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?hide=false&access_token=${accessToken}`,
      { method: 'POST' },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Unhide failed: ${await response.text()}`)
      throw new BadRequestException('Failed to unhide comment')
    }
  }

  private async instagramDeleteComment(commentId: string, accessToken: string) {
    const response = await fetch(
      `https://graph.instagram.com/${FACEBOOK_GRAPH_API_VERSION}/${commentId}?access_token=${accessToken}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      this.logger.error(`[Instagram] Delete failed: ${await response.text()}`)
      throw new BadRequestException('Failed to delete comment')
    }
  }

  private async tiktokDeleteComment(
    socialAccountId: string,
    commentId: string,
    accessToken: string,
  ) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { providerAccountId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    const response = await fetch(
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

    const body = (await response.json()) as { code: number; message: string }
    if (body.code !== 0) {
      this.logger.error(`[TikTok] Delete comment failed: ${body.code} — ${body.message}`)
      throw new BadRequestException(`Failed to delete TikTok comment: ${body.message}`)
    }

    this.logger.log(`[TikTok] Deleted comment ${commentId} on TikTok`)
  }

  private async tiktokHideComment(
    socialAccountId: string,
    videoId: string,
    commentId: string,
    accessToken: string,
    action: 'HIDE' | 'UNHIDE',
  ) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { providerAccountId: true },
    })
    if (!account) throw new NotFoundException('Social account not found')

    const response = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/business/comment/hide/',
      {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          business_id: account.providerAccountId,
          video_id: videoId,
          comment_id: commentId,
          action,
        }),
      },
    )

    const body = (await response.json()) as { code: number; message: string }
    if (body.code !== 0) {
      this.logger.error(`[TikTok] ${action} comment failed: ${body.code} — ${body.message}`)
      throw new BadRequestException(
        `Failed to ${action.toLowerCase()} TikTok comment: ${body.message}`,
      )
    }

    this.logger.log(`[TikTok] ${action} comment ${commentId} on TikTok`)
  }
}

import { Injectable } from '@nestjs/common'
import { SocialCommonService } from './social-common.service'
import { SocialConnectService } from './social-connect.service'
import { TikTokContentService } from './tiktok-content.service'
import { SocialAccountService } from './social-account.service'
import { PostService } from './post.service'
import { CommentService } from './comment.service'

/**
 * Thin facade over the focused social sub-services. Every public method here
 * delegates to the appropriate sub-service. Other modules import `SocialService`
 * and controllers call it, so its public surface must stay stable.
 */
@Injectable()
export class SocialService {
  constructor(
    private readonly common: SocialCommonService,
    private readonly connect: SocialConnectService,
    private readonly tiktokContent: TikTokContentService,
    private readonly account: SocialAccountService,
    private readonly post: PostService,
    private readonly comment: CommentService,
  ) {}

  // ─── Connect ───

  connectFacebookPages(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    return this.connect.connectFacebookPages(userId, organisationId, code, redirectUri, scopes)
  }

  connectFacebookCatalog(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    return this.connect.connectFacebookCatalog(userId, organisationId, code, redirectUri, scopes)
  }

  connectInstagramAccount(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    return this.connect.connectInstagramAccount(userId, organisationId, code, redirectUri, scopes)
  }

  connectWhatsAppAccount(
    userId: string,
    organisationId: string,
    code: string,
    clientWabaId?: string,
    clientPhoneId?: string,
  ) {
    return this.connect.connectWhatsAppAccount(
      userId,
      organisationId,
      code,
      clientWabaId,
      clientPhoneId,
    )
  }

  connectTikTokAccount(
    userId: string,
    organisationId: string,
    code: string,
    redirectUri: string,
    scopes?: string[],
  ) {
    return this.connect.connectTikTokAccount(userId, organisationId, code, redirectUri, scopes)
  }

  checkTikTokBusinessAccount(userId: string, accountId: string) {
    return this.connect.checkTikTokBusinessAccount(userId, accountId)
  }

  // ─── TikTok content ───

  syncTikTokVideos(userId: string, accountId: string) {
    return this.tiktokContent.syncTikTokVideos(userId, accountId)
  }

  syncTikTokComments(userId: string, accountId: string, videoId: string) {
    return this.tiktokContent.syncTikTokComments(userId, accountId, videoId)
  }

  replyTikTokComment(userId: string, commentId: string, message: string) {
    return this.tiktokContent.replyTikTokComment(userId, commentId, message)
  }

  setupTikTokWebhook() {
    return this.tiktokContent.setupTikTokWebhook()
  }

  setupTikTokDirectMessageWebhook() {
    return this.tiktokContent.setupTikTokDirectMessageWebhook()
  }

  listTikTokWebhooks() {
    return this.tiktokContent.listTikTokWebhooks()
  }

  deleteTikTokWebhook() {
    return this.tiktokContent.deleteTikTokWebhook()
  }

  // ─── Accounts ───

  getAccountsForOrg(userId: string, organisationId: string) {
    return this.account.getAccountsForOrg(userId, organisationId)
  }

  getAccountHealth(userId: string, accountId: string) {
    return this.account.getAccountHealth(userId, accountId)
  }

  disconnectAccount(userId: string, accountId: string) {
    return this.account.disconnectAccount(userId, accountId)
  }

  getUnreadCounts(userId: string, organisationId: string) {
    return this.account.getUnreadCounts(userId, organisationId)
  }

  updatePageSettings(
    userId: string,
    socialAccountId: string,
    data: {
      undesiredCommentsAction?: string
      spamAction?: string
      customInstructions?: string
      faqRules?: { question: string; answer: string }[]
      catalogId?: string | null
    },
  ) {
    return this.account.updatePageSettings(userId, socialAccountId, data)
  }

  // ─── Posts ───

  getPostsForAccount(userId: string, socialAccountId: string) {
    return this.post.getPostsForAccount(userId, socialAccountId)
  }

  getAgentStatusForPost(userId: string, postId: string) {
    return this.post.getAgentStatusForPost(userId, postId)
  }

  setPostAgentOverride(userId: string, postId: string, override: 'FORCE_ON' | 'FORCE_OFF') {
    return this.post.setPostAgentOverride(userId, postId, override)
  }

  fetchProviderPosts(
    userId: string,
    socialAccountId: string,
    params?: { search?: string; limit?: number; after?: string },
  ) {
    return this.post.fetchProviderPosts(userId, socialAccountId, params)
  }

  // ─── Comments ───

  getUserStats(userId: string, accountId: string, fromId: string) {
    return this.comment.getUserStats(userId, accountId, fromId)
  }

  markCommentsAsRead(userId: string, postId: string) {
    return this.comment.markCommentsAsRead(userId, postId)
  }

  commentOnPost(userId: string, postId: string, message: string) {
    return this.comment.commentOnPost(userId, postId, message)
  }

  replyToComment(userId: string, commentId: string, message: string) {
    return this.comment.replyToComment(userId, commentId, message)
  }

  hideComment(userId: string, commentId: string) {
    return this.comment.hideComment(userId, commentId)
  }

  unhideComment(userId: string, commentId: string) {
    return this.comment.unhideComment(userId, commentId)
  }

  deleteComment(userId: string, commentId: string) {
    return this.comment.deleteComment(userId, commentId)
  }

  // ─── Shared ───

  getDecryptedToken(socialAccountId: string): Promise<string> {
    return this.common.getDecryptedToken(socialAccountId)
  }
}

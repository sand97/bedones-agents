import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { SocialService } from './social.service'
import {
  ConnectPagesDto,
  ConnectWhatsAppDto,
  UpdatePageSettingsDto,
  SocialAccountResponseDto,
  PostResponseDto,
  PageSettingsResponseDto,
  CommentResponseDto,
  UnreadCountDto,
  UserStatsResponseDto,
  MarkReadDto,
  ReplyToCommentDto,
  CommentOnPostDto,
  CommentActionDto,
} from './dto/social.dto'

@ApiTags('Social')
@Controller('social')
@UseGuards(AuthGuard)
export class SocialController {
  constructor(private socialService: SocialService) {}

  // ─── Connect Facebook pages ───

  @Post('connect/facebook')
  @ApiBody({ type: ConnectPagesDto })
  @ApiCreatedResponse({ type: [SocialAccountResponseDto] })
  async connectFacebook(@CurrentUser() user: { id: string }, @Body() body: ConnectPagesDto) {
    return this.socialService.connectFacebookPages(
      user.id,
      body.organisationId,
      body.code,
      body.redirectUri,
      body.scopes,
    )
  }

  // ─── Connect Instagram account ───

  @Post('connect/instagram')
  @ApiBody({ type: ConnectPagesDto })
  @ApiCreatedResponse({ type: SocialAccountResponseDto })
  async connectInstagram(@CurrentUser() user: { id: string }, @Body() body: ConnectPagesDto) {
    return this.socialService.connectInstagramAccount(
      user.id,
      body.organisationId,
      body.code,
      body.redirectUri,
      body.scopes,
    )
  }

  // ─── Get accounts for org ───

  @Get('accounts/:organisationId')
  @ApiOkResponse({ type: [SocialAccountResponseDto] })
  async getAccounts(@CurrentUser() user: { id: string }, @Param('organisationId') orgId: string) {
    return this.socialService.getAccountsForOrg(user.id, orgId)
  }

  // ─── Unread counts per provider ───

  @Get('unread-counts/:organisationId')
  @ApiOkResponse({ type: [UnreadCountDto] })
  async getUnreadCounts(
    @CurrentUser() user: { id: string },
    @Param('organisationId') orgId: string,
  ) {
    return this.socialService.getUnreadCounts(user.id, orgId)
  }

  // ─── Get posts for a social account ───

  @Get('accounts/:accountId/posts')
  @ApiOkResponse({ type: [PostResponseDto] })
  async getPosts(@CurrentUser() user: { id: string }, @Param('accountId') accountId: string) {
    return this.socialService.getPostsForAccount(user.id, accountId)
  }

  // ─── Update page settings ───

  @Patch('accounts/:accountId/settings')
  @ApiBody({ type: UpdatePageSettingsDto })
  @ApiOkResponse({ type: PageSettingsResponseDto })
  async updateSettings(
    @CurrentUser() user: { id: string },
    @Param('accountId') accountId: string,
    @Body() body: UpdatePageSettingsDto,
  ) {
    return this.socialService.updatePageSettings(user.id, accountId, body)
  }

  // ─── User stats ───

  @Get('accounts/:accountId/user-stats/:fromId')
  @ApiOkResponse({ type: UserStatsResponseDto })
  async getUserStats(
    @CurrentUser() user: { id: string },
    @Param('accountId') accountId: string,
    @Param('fromId') fromId: string,
  ) {
    return this.socialService.getUserStats(user.id, accountId, fromId)
  }

  // ─── Mark comments as read ───

  @Post('comments/mark-read')
  @ApiBody({ type: MarkReadDto })
  async markRead(@CurrentUser() user: { id: string }, @Body() body: MarkReadDto) {
    await this.socialService.markCommentsAsRead(user.id, body.postId)
    return { status: 'success' }
  }

  // ─── Comment on a post (top-level) ───

  @Post('comments/post')
  @ApiBody({ type: CommentOnPostDto })
  @ApiCreatedResponse({ type: CommentResponseDto })
  async commentOnPost(@CurrentUser() user: { id: string }, @Body() body: CommentOnPostDto) {
    return this.socialService.commentOnPost(user.id, body.postId, body.message)
  }

  // ─── Reply to a comment ───

  @Post('comments/reply')
  @ApiBody({ type: ReplyToCommentDto })
  @ApiCreatedResponse({ type: CommentResponseDto })
  async reply(@CurrentUser() user: { id: string }, @Body() body: ReplyToCommentDto) {
    return this.socialService.replyToComment(user.id, body.commentId, body.message)
  }

  // ─── Hide a comment ───

  @Post('comments/hide')
  @ApiBody({ type: CommentActionDto })
  @ApiOkResponse({ type: CommentResponseDto })
  async hide(@CurrentUser() user: { id: string }, @Body() body: CommentActionDto) {
    return this.socialService.hideComment(user.id, body.commentId)
  }

  // ─── Unhide a comment ───

  @Post('comments/unhide')
  @ApiBody({ type: CommentActionDto })
  @ApiOkResponse({ type: CommentResponseDto })
  async unhide(@CurrentUser() user: { id: string }, @Body() body: CommentActionDto) {
    return this.socialService.unhideComment(user.id, body.commentId)
  }

  // ─── Delete a comment ───

  @Post('comments/delete')
  @ApiBody({ type: CommentActionDto })
  @ApiOkResponse({ type: CommentResponseDto })
  async delete(@CurrentUser() user: { id: string }, @Body() body: CommentActionDto) {
    return this.socialService.deleteComment(user.id, body.commentId)
  }

  // ─── Connect WhatsApp (Embedded Signup) ───

  @Post('connect/whatsapp')
  @ApiBody({ type: ConnectWhatsAppDto })
  @ApiCreatedResponse({ type: SocialAccountResponseDto })
  async connectWhatsApp(@CurrentUser() user: { id: string }, @Body() body: ConnectWhatsAppDto) {
    return this.socialService.connectWhatsAppAccount(
      user.id,
      body.organisationId,
      body.code,
      body.wabaId,
      body.phoneNumberId,
    )
  }

  // ─── Connect TikTok ───

  @Post('connect/tiktok')
  @ApiBody({ type: ConnectPagesDto })
  @ApiCreatedResponse({ type: SocialAccountResponseDto })
  async connectTikTok(@CurrentUser() user: { id: string }, @Body() body: ConnectPagesDto) {
    return this.socialService.connectTikTokAccount(
      user.id,
      body.organisationId,
      body.code,
      body.redirectUri,
      body.scopes,
    )
  }

  // ─── TikTok: Sync videos ───

  @Post('tiktok/:accountId/sync-videos')
  async syncTikTokVideos(
    @CurrentUser() user: { id: string },
    @Param('accountId') accountId: string,
  ) {
    return this.socialService.syncTikTokVideos(user.id, accountId)
  }

  // ─── TikTok: Sync comments for a video ───

  @Post('tiktok/:accountId/sync-comments/:videoId')
  async syncTikTokComments(
    @CurrentUser() user: { id: string },
    @Param('accountId') accountId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.socialService.syncTikTokComments(user.id, accountId, videoId)
  }

  // ─── TikTok: Reply to comment ───

  @Post('tiktok/comments/reply')
  @ApiBody({ type: ReplyToCommentDto })
  @ApiCreatedResponse({ type: CommentResponseDto })
  async replyTikTok(@CurrentUser() user: { id: string }, @Body() body: ReplyToCommentDto) {
    return this.socialService.replyTikTokComment(user.id, body.commentId, body.message)
  }
}

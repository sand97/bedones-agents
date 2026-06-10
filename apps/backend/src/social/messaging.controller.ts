import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { MessagingService } from './messaging.service'
import {
  ConversationResponseDto,
  ConversationAgentStatusDto,
  DirectMessageResponseDto,
  SendMessageDto,
  SendProductMessageDto,
  SendReactionDto,
  SendTemplateMessageDto,
  MarkConversationReadDto,
  SetConversationAgentOverrideDto,
} from './dto/messaging.dto'

@ApiTags('Messaging')
@Controller('messaging')
@UseGuards(AuthGuard)
export class MessagingController {
  constructor(private messagingService: MessagingService) {}

  // ─── Get conversations for a social account ───

  @Get('conversations/:accountId')
  @ApiOkResponse({ type: [ConversationResponseDto] })
  async getConversations(
    @CurrentUser() user: { id: string },
    @Param('accountId') accountId: string,
  ) {
    return this.messagingService.getConversations(user.id, accountId)
  }

  // ─── Get messages for a conversation ───

  @Get('conversations/:conversationId/messages')
  @ApiOkResponse({ type: [DirectMessageResponseDto] })
  async getMessages(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.getMessages(user.id, conversationId)
  }

  // ─── Send a message ───

  @Post('send')
  @ApiBody({ type: SendMessageDto })
  @ApiCreatedResponse({ type: DirectMessageResponseDto })
  async sendMessage(@CurrentUser() user: { id: string }, @Body() body: SendMessageDto) {
    return this.messagingService.sendMessage(
      user.id,
      body.conversationId,
      body.message,
      body.mediaUrl,
      body.mediaType,
      body.fileName,
      body.fileSize,
      body.replyToId,
      body.tiktokMessageType,
      body.tiktokSharePostId,
      body.tiktokTemplate,
      body.tiktokSenderAction,
    )
  }

  // ─── Send product message (WhatsApp only) ───

  @Post('send-products')
  @ApiBody({ type: SendProductMessageDto })
  @ApiCreatedResponse({ type: DirectMessageResponseDto })
  async sendProductMessage(
    @CurrentUser() user: { id: string },
    @Body() body: SendProductMessageDto,
  ) {
    return this.messagingService.sendProductMessage(
      user.id,
      body.conversationId,
      body.productRetailerIds,
      body.catalogId,
      body.format,
      body.headerText,
      body.bodyText,
      body.footerText,
    )
  }

  @Post('send-template')
  @ApiBody({ type: SendTemplateMessageDto })
  @ApiCreatedResponse({ type: DirectMessageResponseDto })
  async sendTemplateMessage(
    @CurrentUser() user: { id: string },
    @Body() body: SendTemplateMessageDto,
  ) {
    return this.messagingService.sendTemplateMessage(
      user.id,
      body.conversationId,
      body.metaTemplateName,
      body.metaTemplateLanguage,
      body.variables,
      body.renderedBody,
      body.metaTemplateId,
    )
  }

  // ─── Send a reaction (WhatsApp) ───

  @Post('send-reaction')
  @ApiBody({ type: SendReactionDto })
  async sendReaction(@CurrentUser() user: { id: string }, @Body() body: SendReactionDto) {
    return this.messagingService.sendReaction(user.id, body.messageId, body.emoji)
  }

  // ─── Mark conversation as read ───

  @Post('mark-read')
  @ApiBody({ type: MarkConversationReadDto })
  async markRead(@CurrentUser() user: { id: string }, @Body() body: MarkConversationReadDto) {
    return this.messagingService.markConversationAsRead(user.id, body.conversationId)
  }

  // ─── Send typing indicator (best-effort) ───

  @Post('typing/:conversationId')
  async sendTyping(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
  ) {
    await this.messagingService.sendTypingIndicator(conversationId, user.id)
    return { ok: true }
  }

  // ─── Sync conversations from platform ───

  @Post('sync/:accountId')
  @ApiOkResponse({ type: [ConversationResponseDto] })
  async syncConversations(
    @CurrentUser() user: { id: string },
    @Param('accountId') accountId: string,
  ) {
    return this.messagingService.syncConversations(user.id, accountId)
  }

  // ─── Per-conversation agent activation ───

  @Get('conversations/:conversationId/agent-status')
  @ApiOkResponse({ type: ConversationAgentStatusDto })
  async getAgentStatus(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.getAgentStatusForConversation(user.id, conversationId)
  }

  @Put('conversations/:conversationId/agent-override')
  @ApiBody({ type: SetConversationAgentOverrideDto })
  @ApiOkResponse({ type: ConversationAgentStatusDto })
  async setAgentOverride(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
    @Body() body: SetConversationAgentOverrideDto,
  ) {
    return this.messagingService.setConversationAgentOverride(
      user.id,
      conversationId,
      body.override,
    )
  }

  // ─── Clear a conversation's stored messages (admin only) ───

  @Delete('conversations/:conversationId/messages')
  @ApiOkResponse({ schema: { type: 'object', properties: { cleared: { type: 'number' } } } })
  async clearConversationMessages(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.clearConversationMessages(user.id, conversationId)
  }
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { MessagingService } from './messaging.service'
import {
  ConversationResponseDto,
  DirectMessageResponseDto,
  SendMessageDto,
  MarkConversationReadDto,
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
    )
  }

  // ─── Mark conversation as read ───

  @Post('mark-read')
  @ApiBody({ type: MarkConversationReadDto })
  async markRead(@CurrentUser() user: { id: string }, @Body() body: MarkConversationReadDto) {
    return this.messagingService.markConversationAsRead(user.id, body.conversationId)
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
}

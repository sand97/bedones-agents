import { Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import PasswordGuard from '../guards/password.guard'
import { SocialService } from './social.service'

@ApiTags('TikTok Webhooks')
@Controller('webhooks/tiktok')
@UseGuards(PasswordGuard('MIGRATION_TOKEN'))
export class TikTokWebhookController {
  constructor(private socialService: SocialService) {}

  @Post('setup')
  @ApiQuery({ name: 'token', required: true, description: 'Admin token' })
  @ApiOkResponse({ description: 'Register the COMMENT webhook on TikTok Business API' })
  async setup(@Query('token') _token: string) {
    return this.socialService.setupTikTokWebhook()
  }

  @Get('list')
  @ApiQuery({ name: 'token', required: true, description: 'Admin token' })
  @ApiOkResponse({ description: 'List registered TikTok webhooks' })
  async list(@Query('token') _token: string) {
    return this.socialService.listTikTokWebhooks()
  }

  @Delete('delete')
  @ApiQuery({ name: 'token', required: true, description: 'Admin token' })
  @ApiOkResponse({ description: 'Delete the COMMENT webhook from TikTok Business API' })
  async delete(@Query('token') _token: string) {
    return this.socialService.deleteTikTokWebhook()
  }
}

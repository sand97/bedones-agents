import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { WhatsappOptinService } from './whatsapp-optin.service'

class SendTemplateBody {
  userId!: string
  organisationId!: string
}

@ApiTags('WhatsAppOptIn')
@Controller('whatsapp-optin')
@UseGuards(AuthGuard)
export class WhatsappOptinController {
  constructor(private optin: WhatsappOptinService) {}

  @Get('status')
  async status(@Query('userId') userId: string, @Query('organisationId') organisationId: string) {
    return { open: await this.optin.isWindowOpen(userId, organisationId) }
  }

  @Post('template/send')
  async sendTemplate(@Body() body: SendTemplateBody) {
    await this.optin.sendOptInTemplate(body.userId, body.organisationId)
    return { ok: true }
  }

  @Post('tick')
  async tick() {
    return this.optin.tickHourly()
  }
}

import { Body, Controller, Get, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common'

import { ExecutePageScriptDto } from './dto/execute-page-script.dto'
import { TargetInstanceGuard } from './guards/target-instance.guard'
import { WhatsAppClientService } from './whatsapp-client.service'

@Controller('whatsapp')
@UseGuards(TargetInstanceGuard)
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppClientService) {}

  /**
   * Run a JS script in the WhatsApp Web page context (WPP + window.nodeFetch
   * are injected first). bedones-agents uses this to inject the catalogue
   * extraction script and read a number's public catalogue.
   */
  @Post('execute-script')
  async executeScript(@Body() dto: ExecutePageScriptDto) {
    try {
      const result = await this.whatsapp.executePageScript(dto.script)
      return { success: true, result }
    } catch (error) {
      throw new HttpException(
        { success: false, error: error instanceof Error ? error.message : String(error) },
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  @Post('restart')
  async restart() {
    await this.whatsapp.restartClient()
    return { success: true, message: 'WhatsApp client restarted — a new QR code will be emitted' }
  }

  @Get('status')
  status() {
    return this.whatsapp.getStatus()
  }

  @Get('qr')
  qr() {
    const qrCode = this.whatsapp.getQrCode()
    if (!qrCode) {
      throw new HttpException(
        {
          success: false,
          message: 'No QR code available. The client may already be authenticated.',
        },
        HttpStatus.NOT_FOUND,
      )
    }
    return { success: true, qrCode }
  }
}

import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'

import { ExecutePageScriptDto } from './dto/execute-page-script.dto'
import { TargetInstanceGuard } from './guards/target-instance.guard'
import { WhatsAppClientService } from './whatsapp-client.service'

@ApiTags('WhatsApp')
@ApiSecurity('target-instance')
@Controller('whatsapp')
@UseGuards(TargetInstanceGuard)
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppClientService) {}

  @Post('execute-script')
  @ApiOperation({
    summary: 'Run a JS script in the WhatsApp Web page context',
    description:
      'WPP (@wppconnect/wa-js) and window.nodeFetch are injected first, then the script runs and its return value is sent back. Used by bedones-agents to extract a public catalogue.',
  })
  @ApiResponse({ status: 200, description: 'Script executed; its return value is in `result`.' })
  @ApiResponse({ status: 400, description: 'Client not ready or script error.' })
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
  @ApiOperation({ summary: 'Restart the client to force a fresh QR code' })
  async restart() {
    await this.whatsapp.restartClient()
    return { success: true, message: 'WhatsApp client restarted — a new QR code will be emitted' }
  }

  @Get('status')
  @ApiOperation({ summary: 'Client status (isReady, hasQrCode, ...)' })
  status() {
    return this.whatsapp.getStatus()
  }

  @Get('catalog/:phoneNumber')
  @ApiOperation({
    summary: "Read a number's public catalogue (test helper)",
    description:
      'Returns the products inline (name, price/currency, image CDN URLs) — no image download, no migration.',
  })
  @ApiParam({
    name: 'phoneNumber',
    description: 'Target WhatsApp number, digits only with country code, no "+"',
    example: '237657888690',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalogue read: { phoneNumber, wid, productCount, products }.',
  })
  async catalog(@Param('phoneNumber') phoneNumber: string) {
    try {
      return await this.whatsapp.getCatalogPreview(phoneNumber)
    } catch (error) {
      throw new HttpException(
        { success: false, error: error instanceof Error ? error.message : String(error) },
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  @Get('qr')
  @ApiOperation({ summary: 'Current QR code string (if not yet authenticated)' })
  @ApiResponse({ status: 404, description: 'No QR available (already authenticated).' })
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

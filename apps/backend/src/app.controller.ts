import { Controller, Get, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  getHealth() {
    return { status: 'ok', name: 'bedones-agents-api' }
  }

  // ─── Favicon on the MCP host ───
  // AI connector directories (Claude, ChatGPT) fetch the logo shown for the
  // connector from the MCP domain's favicon (via google.com/s2/favicons).
  // Since this host serves the API, redirect favicon requests to the public
  // site's Bedones logo so the directory displays the right icon.
  @Get('favicon.ico')
  @ApiExcludeEndpoint()
  faviconIco(@Res() res: Response) {
    res.redirect(301, `${this.frontendUrl}/favicon.ico`)
  }

  @Get('favicon.svg')
  @ApiExcludeEndpoint()
  faviconSvg(@Res() res: Response) {
    res.redirect(301, `${this.frontendUrl}/favicon.svg`)
  }

  private get frontendUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') ?? 'https://moderator.bedones.com').replace(
      /\/$/,
      '',
    )
  }
}

import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

@ApiTags('Health')
@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  getHealth() {
    return { status: 'ok', name: 'bedones-agents-api' }
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AgentService } from './agent.service'
import { CreateAgentDto, SendMessageDto } from './dto/agent.dto'

@ApiTags('Agent')
@Controller('agent')
@UseGuards(AuthGuard)
export class AgentController {
  constructor(private agentService: AgentService) {}

  @Get('org/:organisationId')
  async findAll(@Param('organisationId') organisationId: string) {
    return this.agentService.findAllByOrg(organisationId)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.agentService.findById(id)
  }

  @Post()
  async create(@Body() dto: CreateAgentDto) {
    return this.agentService.create(dto)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.agentService.remove(id)
  }

  // ─── Messages ───

  @Get(':id/messages')
  async getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.agentService.getMessages(id, limit ? parseInt(limit) : undefined, before)
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Query('organisationId') organisationId: string,
  ) {
    return this.agentService.processUserMessage(id, dto.content, organisationId)
  }

  // ─── Onboarding ───

  @Post(':id/analyze-catalogs')
  async analyzeCatalogs(@Param('id') id: string, @Query('organisationId') organisationId: string) {
    // Fire and forget - results come via WebSocket
    this.agentService.analyzeCatalogs(id, organisationId)
    return { status: 'analyzing' }
  }

  @Post(':id/initial-evaluation')
  async initialEvaluation(
    @Param('id') id: string,
    @Query('organisationId') organisationId: string,
  ) {
    return this.agentService.performInitialEvaluation(id, organisationId)
  }

  @Get(':id/catalogs-analyzed')
  async areCatalogsAnalyzed(@Param('id') id: string) {
    const analyzed = await this.agentService.areCatalogsAnalyzed(id)
    return { analyzed }
  }

  // ─── Ticket Statuses ───

  @Get(':id/ticket-statuses')
  async getTicketStatuses(@Param('id') id: string) {
    return this.agentService.getTicketStatuses(id)
  }

  @Put(':id/ticket-statuses')
  async updateTicketStatuses(
    @Param('id') id: string,
    @Body()
    statuses: Array<{
      id?: string
      name: string
      color: string
      order: number
      isDefault: boolean
    }>,
  ) {
    return this.agentService.updateTicketStatuses(id, statuses)
  }
}

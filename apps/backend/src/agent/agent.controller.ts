import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOkResponse } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AgentService } from './agent.service'
import { AgentFeedbackService } from './feedback.service'
import {
  ActivateAgentDto,
  CreateAgentDto,
  SendAgentMessageDto,
  UpdateAgentModelDto,
  UpdateAgentSocialAccountsDto,
} from './dto/agent.dto'
import { AgentFeedbackRequestDto, AgentFeedbackResponseDto } from './dto/feedback.dto'

@ApiTags('Agent')
@Controller('agent')
@UseGuards(AuthGuard)
export class AgentController {
  constructor(
    private agentService: AgentService,
    private feedbackService: AgentFeedbackService,
  ) {}

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

  @Put(':id/social-accounts')
  async updateSocialAccounts(@Param('id') id: string, @Body() dto: UpdateAgentSocialAccountsDto) {
    return this.agentService.updateSocialAccounts(id, dto.socialAccountIds)
  }

  @Put(':id/model')
  async updateModel(@Param('id') id: string, @Body() dto: UpdateAgentModelDto) {
    return this.agentService.updateLiveModelTier(id, dto.tier)
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
    @Body() dto: SendAgentMessageDto,
    @Query('organisationId') organisationId: string,
  ) {
    return this.agentService.processUserMessage(id, dto.content, organisationId)
  }

  // ─── Onboarding ───

  @Post(':id/start-setup')
  async startSetup(@Param('id') id: string, @Query('organisationId') organisationId: string) {
    // Fire and forget — progress comes via WebSocket
    this.agentService.startSetup(id, organisationId)
    return { status: 'setup-started' }
  }

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

  // ─── Activation ───

  @Put(':id/activate')
  async activate(@Param('id') id: string, @Body() dto: ActivateAgentDto) {
    return this.agentService.activate(id, dto)
  }

  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.agentService.deactivate(id)
  }

  @Get(':id/labels')
  async getLabels(@Param('id') id: string) {
    return this.agentService.getLabelsForAgent(id)
  }

  // ─── Feedback loop ───

  @Post('feedback/:messageId')
  @ApiOkResponse({ type: AgentFeedbackResponseDto })
  async submitFeedback(
    @Param('messageId') messageId: string,
    @Body() dto: AgentFeedbackRequestDto,
  ): Promise<AgentFeedbackResponseDto> {
    return this.feedbackService.submitFeedback(messageId, dto.conversation)
  }
}

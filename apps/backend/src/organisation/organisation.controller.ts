import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { OrganisationService } from './organisation.service'
import { SetupStatusService } from './setup-status.service'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import {
  CreateOrganisationDto,
  UpdateOrganisationDto,
  OrganisationResponseDto,
} from './dto/organisation.dto'
import { SetupStatusResponseDto } from './dto/setup-status.dto'

@ApiTags('Organisations')
@Controller('organisations')
@UseGuards(AuthGuard)
export class OrganisationController {
  constructor(
    private organisationService: OrganisationService,
    private setupStatusService: SetupStatusService,
  ) {}

  @Post()
  @ApiBody({ type: CreateOrganisationDto })
  @ApiCreatedResponse({ type: OrganisationResponseDto })
  async create(@CurrentUser() user: { id: string }, @Body() body: CreateOrganisationDto) {
    return this.organisationService.create(user.id, body.name, body.timezone)
  }

  @Patch(':id')
  @ApiBody({ type: UpdateOrganisationDto })
  @ApiOkResponse({ type: OrganisationResponseDto })
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') orgId: string,
    @Body() body: UpdateOrganisationDto,
  ) {
    return this.organisationService.update(user.id, orgId, body)
  }

  @Get(':id')
  @ApiOkResponse({ type: OrganisationResponseDto })
  async findById(@CurrentUser() user: { id: string }, @Param('id') orgId: string) {
    return this.organisationService.findById(user.id, orgId)
  }

  /**
   * Snapshot of remaining setup work (catalog, comment pages, agents). Used by the
   * dashboard to drive the onboarding carousel and by the success modal after a step
   * is completed.
   */
  @Get(':id/setup-status')
  @ApiOkResponse({ type: SetupStatusResponseDto })
  async getSetupStatus(@CurrentUser() user: { id: string }, @Param('id') orgId: string) {
    // Reuse findById to enforce membership before exposing the status.
    await this.organisationService.findById(user.id, orgId)
    return this.setupStatusService.getStatus(orgId)
  }
}

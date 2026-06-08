import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { CatalogMigrationService } from './catalog-migration.service'
import { StartCatalogMigrationDto } from './dto/catalog-migration.dto'

@ApiTags('Catalog Migration')
@Controller('catalog-migration')
@UseGuards(AuthGuard)
export class CatalogMigrationController {
  constructor(private readonly service: CatalogMigrationService) {}

  @Post()
  @ApiOperation({ summary: 'Queue a WhatsApp catalogue → Commerce Manager migration' })
  async start(@CurrentUser() user: { id: string }, @Body() dto: StartCatalogMigrationDto) {
    return this.service.startMigration(user.id, dto)
  }

  @Get('org/:organisationId/active')
  @ApiOperation({ summary: 'Latest in-flight migration for an org (for resuming the wizard)' })
  async getActive(
    @CurrentUser() user: { id: string },
    @Param('organisationId') organisationId: string,
  ) {
    return this.service.getActiveForOrg(user.id, organisationId)
  }

  @Get('catalog/:catalogId/last-sync')
  @ApiOperation({ summary: 'Last completed sync (number + date) for a catalogue, for the banner' })
  async lastSync(@CurrentUser() user: { id: string }, @Param('catalogId') catalogId: string) {
    return this.service.getLastSync(user.id, catalogId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Status + live queue position of a migration' })
  async getOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.getMigrationStatus(user.id, id)
  }
}

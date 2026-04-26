import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { BulkUpdateNotificationPreferenceDto } from './dto/notification-preference.dto'
import { NotificationPreferenceService } from './notification-preference.service'

@ApiTags('NotificationPreference')
@Controller('notification-preferences')
@UseGuards(AuthGuard)
export class NotificationPreferenceController {
  constructor(private notificationPreferenceService: NotificationPreferenceService) {}

  @Get('org/:organisationId')
  async getForOrg(
    @CurrentUser() user: { id: string },
    @Param('organisationId') organisationId: string,
    @Query('userIds') userIds?: string,
  ) {
    return this.notificationPreferenceService.getForOrg(user.id, organisationId, userIds)
  }

  @Post('org/:organisationId/bulk')
  async bulkUpdate(
    @CurrentUser() user: { id: string },
    @Param('organisationId') organisationId: string,
    @Body() dto: BulkUpdateNotificationPreferenceDto,
  ) {
    return this.notificationPreferenceService.bulkUpdate(user.id, organisationId, dto)
  }
}

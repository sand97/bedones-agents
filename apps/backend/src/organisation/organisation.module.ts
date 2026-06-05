import { Module } from '@nestjs/common'
import { OrganisationController } from './organisation.controller'
import { OrganisationService } from './organisation.service'
import { SetupStatusService } from './setup-status.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [OrganisationController],
  providers: [OrganisationService, SetupStatusService],
  exports: [OrganisationService, SetupStatusService],
})
export class OrganisationModule {}

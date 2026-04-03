import { Module } from '@nestjs/common'
import { OrganisationController } from './organisation.controller'
import { OrganisationService } from './organisation.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [OrganisationController],
  providers: [OrganisationService],
  exports: [OrganisationService],
})
export class OrganisationModule {}

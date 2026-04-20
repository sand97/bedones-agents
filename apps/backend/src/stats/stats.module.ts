import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StatsController } from './stats.controller'
import { StatsService } from './stats.service'
import { CreditService } from './credit.service'

@Module({
  imports: [AuthModule],
  controllers: [StatsController],
  providers: [StatsService, CreditService],
  exports: [CreditService],
})
export class StatsModule {}

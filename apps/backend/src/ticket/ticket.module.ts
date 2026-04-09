import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { TicketController } from './ticket.controller'
import { TicketService } from './ticket.service'

@Module({
  imports: [AuthModule],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}

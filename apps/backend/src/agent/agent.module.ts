import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuthModule } from '../auth/auth.module'
import { CatalogModule } from '../catalog/catalog.module'
import { ImageProcessingModule } from '../image-processing/image-processing.module'
import { QueueModule, TICKET_AGENT_QUEUE, MESSAGE_PROCESSING_QUEUE } from '../queue/queue.module'
import { SocialModule } from '../social/social.module'
import { StatsModule } from '../stats/stats.module'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { AgentGateway } from './agent.gateway'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import { AgentDbToolsService } from './tools/agent-db-tools.service'
import { AgentMessageProcessorService } from './agent-message-processor.service'
import { MessageRunCoordinator } from './message-run-coordinator'
import { MessageProcessingProcessor } from './message-processing.processor'
import { AgentFeedbackService } from './feedback.service'
import { TicketAgentService } from './ticket-agent.service'
import { TicketAgentProcessor } from './ticket-agent.processor'

@Module({
  imports: [
    AuthModule,
    CatalogModule,
    ImageProcessingModule,
    QueueModule,
    SocialModule,
    StatsModule,
    BullModule.registerQueue({ name: TICKET_AGENT_QUEUE }),
    BullModule.registerQueue({ name: MESSAGE_PROCESSING_QUEUE }),
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentGateway,
    AgentPromptsService,
    AgentDbToolsService,
    AgentMessageProcessorService,
    MessageRunCoordinator,
    MessageProcessingProcessor,
    AgentFeedbackService,
    TicketAgentService,
    TicketAgentProcessor,
  ],
  exports: [AgentService],
})
export class AgentModule {}

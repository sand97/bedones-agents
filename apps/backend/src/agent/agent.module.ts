import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ImageProcessingModule } from '../image-processing/image-processing.module'
import { QueueModule } from '../queue/queue.module'
import { SocialModule } from '../social/social.module'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { AgentGateway } from './agent.gateway'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import { AgentDbToolsService } from './tools/agent-db-tools.service'
import { AgentMessageProcessorService } from './agent-message-processor.service'

@Module({
  imports: [AuthModule, ImageProcessingModule, QueueModule, SocialModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentGateway,
    AgentPromptsService,
    AgentDbToolsService,
    AgentMessageProcessorService,
  ],
  exports: [AgentService],
})
export class AgentModule {}

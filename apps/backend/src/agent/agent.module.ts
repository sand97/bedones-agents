import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { AgentGateway } from './agent.gateway'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import { AgentDbToolsService } from './tools/agent-db-tools.service'

@Module({
  imports: [AuthModule],
  controllers: [AgentController],
  providers: [AgentService, AgentGateway, AgentPromptsService, AgentDbToolsService],
  exports: [AgentService],
})
export class AgentModule {}

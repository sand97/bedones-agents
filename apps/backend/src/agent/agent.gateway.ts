import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Socket } from 'socket.io'
import { AgentService } from './agent.service'

/**
 * WebSocket gateway for real-time agent interactions.
 * Complements the REST API for the onboarding chat.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'https://moderator.bedones.local',
    credentials: true,
  },
})
export class AgentGateway {
  private readonly logger = new Logger(AgentGateway.name)

  constructor(private agentService: AgentService) {}

  @SubscribeMessage('agent:send_message')
  async handleMessage(
    @MessageBody() data: { agentId: string; content: string; organisationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Agent message from ${client.id}: ${data.content.substring(0, 50)}`)

    try {
      await this.agentService.processUserMessage(data.agentId, data.content, data.organisationId)
    } catch (error) {
      this.logger.error(`Agent message processing failed: ${error}`)
      client.emit('agent:error', {
        agentId: data.agentId,
        message: 'Erreur de traitement',
        retryable: true,
      })
    }
  }

  @SubscribeMessage('agent:start_analysis')
  async handleStartAnalysis(
    @MessageBody() data: { agentId: string; organisationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Starting catalog analysis for agent ${data.agentId}`)

    try {
      await this.agentService.analyzeCatalogs(data.agentId, data.organisationId)
    } catch (error) {
      this.logger.error(`Catalog analysis failed: ${error}`)
      client.emit('agent:error', {
        agentId: data.agentId,
        message: "Erreur lors de l'analyse du catalogue",
        retryable: true,
      })
    }
  }
}

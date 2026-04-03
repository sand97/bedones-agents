import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'

/**
 * Global WebSocket gateway.
 * Clients join rooms by organisation slug so they only receive relevant events.
 *
 * Events emitted to the frontend:
 *   - "comment:new"      → a new comment was received
 *   - "comment:updated"  → a comment was updated (hidden, deleted, replied)
 *   - "comment:removed"  → a comment was deleted from DB
 *   - "post:updated"     → a post was created or updated
 *   - "unread:updated"   → unread counts changed
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'https://moderator.bedones.local',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name)

  @WebSocketServer()
  server!: Server

  handleConnection(client: Socket) {
    const orgId = client.handshake.query.orgId as string
    if (orgId) {
      client.join(`org:${orgId}`)
      this.logger.log(`Client ${client.id} joined org:${orgId}`)
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`)
  }

  /** Emit an event to all clients in an organisation room */
  emitToOrg(orgId: string, event: string, data: unknown) {
    this.server.to(`org:${orgId}`).emit(event, data)
  }
}

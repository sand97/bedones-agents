import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

/** Event types emitted by the backend gateway */
export interface CommentEvent {
  commentId: string
  postId: string
  socialAccountId: string
  provider: 'FACEBOOK' | 'INSTAGRAM'
  action?: string
}

export interface CommentRemovedEvent {
  commentId: string
}

/** Catalogue migration websocket events (catalog:migration-*). */
export interface MigrationQueueEvent {
  migrationId: string
  position: number
  etaMinutes: number
}

export interface MigrationProgressEvent {
  migrationId: string
  status: string
  imported: number
  failed: number
  total: number
  percentage: number
}

export interface MigrationDoneEvent {
  migrationId: string
  catalogId: string
  imported?: number
  failed?: number
  total?: number
  error?: string
  errorCode?: string
}

export function getSocket(orgId: string): Socket {
  // Reuse the existing socket as long as it targets the same org — even while it
  // is still establishing the connection. Requiring `connected` here was a bug:
  // effects run child-first, so a page (e.g. the agents chat) would create the
  // socket and attach its handlers, then the parent SocketProvider would call
  // getSocket() before the socket finished connecting, tear it down and recreate
  // a new one — orphaning the page's handlers on the dead socket. The result was
  // that real-time agent events were lost until a manual refresh.
  if (socket && socket.io.opts.query?.orgId === orgId) {
    return socket
  }

  // Disconnect previous socket if org changed
  if (socket) {
    socket.disconnect()
    socket = null
  }

  const backendUrl = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

  socket = io(backendUrl, {
    query: { orgId },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    console.log('[Socket] Connected to', backendUrl, 'for org', orgId)
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

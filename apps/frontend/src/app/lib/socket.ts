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

export function getSocket(orgId: string): Socket {
  if (socket?.connected && socket.io.opts.query?.orgId === orgId) {
    return socket
  }

  // Disconnect previous socket if org changed
  if (socket) {
    socket.disconnect()
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

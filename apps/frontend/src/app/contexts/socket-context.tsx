import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  getSocket,
  disconnectSocket,
  type CommentEvent,
  type CommentRemovedEvent,
} from '@app/lib/socket'
import type { Socket } from 'socket.io-client'

interface SocketContextType {
  /** Whether the socket is currently connected */
  connected: boolean
}

const SocketContext = createContext<SocketContextType>({ connected: false })

/** Plays a short notification sound when a new comment arrives while the tab is not visible */
function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.frequency.value = 880
    oscillator.type = 'sine'
    gain.gain.value = 0.15
    oscillator.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    oscillator.stop(ctx.currentTime + 0.3)
  } catch {
    // Audio not available (e.g. no user interaction yet)
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const queryClient = useQueryClient()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!orgSlug) return

    const socket = getSocket(orgSlug)
    socketRef.current = socket

    const handleCommentNew = (_data: CommentEvent) => {
      // Invalidate posts cache for the relevant account
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/accounts/{accountId}/posts'],
      })
      // Invalidate unread counts
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/unread-counts/{organisationId}'],
      })

      // Play notification sound if tab is not visible
      if (document.hidden) {
        playNotificationSound()
      }
    }

    const handleCommentUpdated = (_data: CommentEvent) => {
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/accounts/{accountId}/posts'],
      })
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/unread-counts/{organisationId}'],
      })
    }

    const handleCommentRemoved = (_data: CommentRemovedEvent) => {
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/accounts/{accountId}/posts'],
      })
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/unread-counts/{organisationId}'],
      })
    }

    socket.on('comment:new', handleCommentNew)
    socket.on('comment:updated', handleCommentUpdated)
    socket.on('comment:removed', handleCommentRemoved)

    return () => {
      socket.off('comment:new', handleCommentNew)
      socket.off('comment:updated', handleCommentUpdated)
      socket.off('comment:removed', handleCommentRemoved)
      disconnectSocket()
    }
  }, [orgSlug, queryClient])

  return (
    <SocketContext.Provider value={{ connected: !!socketRef.current?.connected }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}

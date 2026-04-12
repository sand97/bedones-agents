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

/** Plays a short notification sound when a new event arrives */
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

/**
 * Check if the user is currently viewing a specific conversation.
 * Returns true if the URL matches /chats/<provider>?conv=<conversationId>
 */
function isViewingConversation(conversationId: string): boolean {
  if (document.hidden) return false
  const url = new URL(window.location.href)
  return url.searchParams.get('conv') === conversationId
}

/** Check if the user is currently on a comments page for a provider. */
function isViewingComments(provider: string): boolean {
  if (document.hidden) return false
  const providerPath = provider === 'FACEBOOK' ? 'comments/facebook' : 'comments/instagram'
  return window.location.pathname.includes(providerPath)
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const queryClient = useQueryClient()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!orgSlug) return

    const socket = getSocket(orgSlug)
    socketRef.current = socket

    const handleCommentNew = (data: CommentEvent) => {
      // Invalidate posts cache for the relevant account
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/accounts/{accountId}/posts'],
      })
      // Invalidate unread counts
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/unread-counts/{organisationId}'],
      })

      // Play sound if user is NOT currently viewing comments for this provider
      if (!isViewingComments(data.provider)) {
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

    const handleMessageNew = (data: { conversationId: string }) => {
      queryClient.invalidateQueries({
        queryKey: ['get', '/messaging/conversations/{accountId}'],
      })
      queryClient.invalidateQueries({
        queryKey: ['get', '/messaging/conversations/{conversationId}/messages'],
      })
      // Invalidate unread counts for sidebar badges
      queryClient.invalidateQueries({
        queryKey: ['get', '/social/unread-counts/{organisationId}'],
      })

      // Play sound if user is NOT currently viewing this conversation
      if (!isViewingConversation(data.conversationId)) {
        playNotificationSound()
      }
    }

    const handleMessageReaction = (data: {
      conversationId: string
      messageId: string
      reactions: { senderId: string; emoji: string }[]
    }) => {
      // Update the message reactions in cache directly
      queryClient.setQueriesData<{ id: string; reactions?: unknown }[]>(
        { queryKey: ['get', '/messaging/conversations/{conversationId}/messages'] },
        (old) => {
          if (!old) return old
          return old.map((msg) =>
            msg.id === data.messageId ? { ...msg, reactions: data.reactions } : msg,
          )
        },
      )
    }

    const handleMessageStatus = (data: {
      conversationId: string
      messageId: string
      platformMsgId: string
      deliveryStatus: 'sent' | 'delivered' | 'read'
    }) => {
      // Update the message deliveryStatus in cache directly
      queryClient.setQueriesData<{ id: string; deliveryStatus?: string }[]>(
        { queryKey: ['get', '/messaging/conversations/{conversationId}/messages'] },
        (old) => {
          if (!old) return old
          return old.map((msg) =>
            msg.id === data.messageId ? { ...msg, deliveryStatus: data.deliveryStatus } : msg,
          )
        },
      )
    }

    const handleCatalogIndexingProgress = (data: {
      catalogId: string
      percentage: number
      processed?: number
      total?: number
    }) => {
      // Update the catalog in the catalogs list cache directly
      queryClient.setQueriesData<
        { id: string; analysisStatus: string; indexedCount: number; productCount: number }[]
      >({ queryKey: ['catalogs'] }, (old) => {
        if (!old) return old
        return old.map((c) =>
          c.id === data.catalogId
            ? {
                ...c,
                analysisStatus: 'INDEXING' as const,
                indexedCount: data.processed ?? c.indexedCount,
                productCount: data.total ?? c.productCount,
              }
            : c,
        )
      })
    }

    const handleCatalogIndexingCompleted = (data: { catalogId: string; indexedCount: number }) => {
      // Invalidate catalogs to refresh the list with COMPLETED status
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      queryClient.removeQueries({ queryKey: ['catalog-indexing-progress', data.catalogId] })
    }

    const handleCatalogIndexingFailed = (data: { catalogId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      queryClient.removeQueries({ queryKey: ['catalog-indexing-progress', data.catalogId] })
    }

    socket.on('comment:new', handleCommentNew)
    socket.on('comment:updated', handleCommentUpdated)
    socket.on('comment:removed', handleCommentRemoved)
    socket.on('message:new', handleMessageNew)
    socket.on('message:reaction', handleMessageReaction)
    socket.on('message:status', handleMessageStatus)
    socket.on('catalog:indexing-progress', handleCatalogIndexingProgress)
    socket.on('catalog:indexing-completed', handleCatalogIndexingCompleted)
    socket.on('catalog:indexing-failed', handleCatalogIndexingFailed)

    return () => {
      socket.off('comment:new', handleCommentNew)
      socket.off('comment:updated', handleCommentUpdated)
      socket.off('comment:removed', handleCommentRemoved)
      socket.off('message:new', handleMessageNew)
      socket.off('message:reaction', handleMessageReaction)
      socket.off('message:status', handleMessageStatus)
      socket.off('catalog:indexing-progress', handleCatalogIndexingProgress)
      socket.off('catalog:indexing-completed', handleCatalogIndexingCompleted)
      socket.off('catalog:indexing-failed', handleCatalogIndexingFailed)
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

import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message as antdMessage } from 'antd'
import { useNavigate, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { $api } from '@app/lib/api/$api'
import type { Conversation, Message } from './mock-data'
import { TicketCard } from './ticket-card'
import { TicketDrawer, type RealTicket } from './ticket-drawer'
import { ChatInput } from './chat-input'
import { FeedbackModal, type FeedbackSubmitResult, type FeedbackTurn } from './feedback-modal'
import { groupMessagesByDate, type ChatProvider } from './chat-window/chat-message-utils'
import { MessageBubble } from './chat-window/message-bubble'
import { ChatHeader } from './chat-window/chat-header'

interface ChatWindowProps {
  conversation: Conversation
  provider?: ChatProvider
  onSend?: (
    message: string,
    media?: { url: string; type: 'image' | 'video' | 'audio' | 'file' },
    replyToId?: string,
  ) => Promise<void>
  onUploadAndSend?: (
    file: File,
    type: 'image' | 'video' | 'audio' | 'file',
    replyToId?: string,
  ) => Promise<void>
  onTyping?: () => void
  onRetry?: (messageId: string) => void
  hasCatalog?: boolean
  onProductClick?: () => void
  onCatalogClick?: () => void
  onTemplateClick?: () => void
  onTikTokMessageClick?: () => void
}

/* ── Main component ── */

export function ChatWindow({
  conversation,
  provider = 'whatsapp',
  onSend,
  onUploadAndSend,
  onTyping,
  onRetry,
  hasCatalog,
  onProductClick,
  onCatalogClick,
  onTemplateClick,
  onTikTokMessageClick,
}: ChatWindowProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { conv?: string; ticket?: string }
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<Message | null>(null)

  const feedbackMutation = $api.useMutation('post', '/agent/feedback/{messageId}')
  const reactionMutation = $api.useMutation('post', '/messaging/send-reaction')

  const handleReact = useCallback(
    async (message: Message, emoji: string) => {
      // Strip the optimistic prefix — backend only knows real message IDs.
      if (message.id.startsWith('optimistic-')) return
      try {
        await reactionMutation.mutateAsync({
          body: { messageId: message.id, emoji },
        })
      } catch (err) {
        antdMessage.error(err instanceof Error ? err.message : t('chat.react_error'))
      }
    },
    [reactionMutation, t],
  )

  const handleFeedbackSubmit = useCallback(
    async (params: {
      originalMessage: Message
      conversation: FeedbackTurn[]
    }): Promise<FeedbackSubmitResult> => {
      const result = await feedbackMutation.mutateAsync({
        params: { path: { messageId: params.originalMessage.id } },
        body: {
          conversation: params.conversation.map((c) => ({ from: c.from, text: c.text })),
        },
      })
      return {
        question: result.mode === 'clarify' ? result.question : undefined,
        successMessage: result.mode === 'complete' ? result.successMessage : undefined,
      }
    },
    [feedbackMutation],
  )

  // Clear reply when conversation changes
  useEffect(() => {
    setReplyTo(null)
    setFeedbackMessage(null)
  }, [conversation.id])

  const tickets = conversation.tickets ?? []

  const drawerTicket = useMemo(
    () => tickets.find((t) => t.id === search.ticket) || null,
    [tickets, search.ticket],
  )

  const openTicket = useCallback(
    (ticket: { id: string }) => {
      navigate({ search: { conv: search.conv, ticket: ticket.id } as never })
    },
    [navigate, search.conv],
  )

  const closeTicket = useCallback(() => {
    navigate({ search: { conv: search.conv } as never })
  }, [navigate, search.conv])

  const groups = useMemo(
    () => groupMessagesByDate(conversation.messages, t),
    [conversation.messages, t],
  )

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [])

  // Scroll to bottom on conversation change or new messages
  const messageCount = conversation.messages.length
  useEffect(() => {
    scrollToBottom()
  }, [conversation.id, messageCount, scrollToBottom])

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('chat-message-highlight')
      setTimeout(() => el.classList.remove('chat-message-highlight'), 1500)
    }
  }, [])

  const allMessages = conversation.messages

  const getPosition = (
    index: number,
    messages: Message[],
  ): 'first' | 'middle' | 'last' | 'single' => {
    const current = messages[index]
    const prev = messages[index - 1]
    const next = messages[index + 1]
    const samePrev = prev && prev.from === current.from
    const sameNext = next && next.from === current.from

    if (samePrev && sameNext) return 'middle'
    if (samePrev) return 'last'
    if (sameNext) return 'first'
    return 'single'
  }

  // Tickets are only shown as sticky, not inline

  // Show the most recent active (non-resolved, non-cancelled) ticket pinned
  const activeTicket = useMemo(() => {
    const active = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'cancelled')
    return active.length > 0 ? active[active.length - 1] : null
  }, [tickets])

  // Customer-service window. WhatsApp closes after 24h since the last inbound
  // message; TikTok Business Messaging closes after 48h.
  const windowClosed = useMemo(() => {
    if (provider !== 'whatsapp' && provider !== 'tiktok') return false
    const lastInbound = [...conversation.messages].reverse().find((msg) => msg.from === 'customer')
    if (!lastInbound) return false
    const limitHours = provider === 'tiktok' ? 48 : 24
    return dayjs().diff(dayjs(lastInbound.timestamp), 'hour', true) > limitHours
  }, [conversation.messages, provider])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatHeader conversation={conversation} />

      {/* Sticky pinned ticket — most recent active */}
      {activeTicket && (
        <div className="ticket-sticky-bar">
          <TicketCard ticket={activeTicket} onClick={openTicket} />
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-2 pb-10">
        {groups.map((group) => (
          <div key={group.date}>
            <div className="flex items-center justify-center py-3">
              <span className="rounded-full bg-bg-subtle px-3 py-1 text-xs text-text-muted">
                {group.date}
              </span>
            </div>
            {group.messages.map((msg) => {
              const globalIndex = allMessages.indexOf(msg)
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  position={getPosition(globalIndex, allMessages)}
                  provider={provider}
                  onScrollToMessage={scrollToMessage}
                  onRetry={onRetry}
                  onReply={provider !== 'instagram-dm' ? setReplyTo : undefined}
                  onReact={provider === 'whatsapp' ? handleReact : undefined}
                  onImprove={setFeedbackMessage}
                  onMediaLoad={scrollToBottom}
                  windowClosed={windowClosed}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Input area */}
      <ChatInput
        onSend={
          onSend
            ? (msg) => {
                const rid = replyTo?.id
                setReplyTo(null)
                return onSend(msg, undefined, rid)
              }
            : undefined
        }
        onUploadAndSend={
          onUploadAndSend
            ? (file, type) => {
                const rid = replyTo?.id
                setReplyTo(null)
                return onUploadAndSend(file, type as 'image' | 'video' | 'audio' | 'file', rid)
              }
            : undefined
        }
        onTyping={onTyping}
        provider={provider}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        hasCatalog={hasCatalog}
        onProductClick={onProductClick}
        onCatalogClick={onCatalogClick}
        onTemplateClick={onTemplateClick}
        onTikTokMessageClick={onTikTokMessageClick}
        windowClosed={windowClosed}
      />

      {/* Ticket drawer */}
      <TicketDrawer
        ticket={drawerTicket as RealTicket | null}
        allTickets={tickets as unknown as RealTicket[]}
        open={!!drawerTicket}
        onClose={closeTicket}
        onSwitchTicket={openTicket}
      />

      {/* Feedback / Improve-with-AI modal */}
      <FeedbackModal
        open={!!feedbackMessage}
        onClose={() => setFeedbackMessage(null)}
        originalMessage={feedbackMessage}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  )
}

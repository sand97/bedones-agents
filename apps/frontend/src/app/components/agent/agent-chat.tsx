import { useMemo, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import type { AgentMessage } from './mock-data'
import { AgentChatInput } from './agent-chat-input'

/* ── Helpers ── */

function formatTime(timestamp: string): string {
  return dayjs(timestamp).format('HH:mm')
}

function formatDateLabel(timestamp: string): string {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return "Aujourd'hui"
  if (date.isSame(now.subtract(1, 'day'), 'day')) return 'Hier'
  return date.format('D MMMM')
}

function groupMessagesByDate(
  messages: AgentMessage[],
): { date: string; messages: AgentMessage[] }[] {
  const groups: { date: string; messages: AgentMessage[] }[] = []

  for (const msg of messages) {
    const label = formatDateLabel(msg.timestamp)
    const last = groups[groups.length - 1]

    if (last && last.date === label) {
      last.messages.push(msg)
    } else {
      groups.push({ date: label, messages: [msg] })
    }
  }

  return groups
}

function getPosition(
  index: number,
  messages: AgentMessage[],
): 'first' | 'middle' | 'last' | 'single' {
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

/* ── Text Bubble ── */

function TextBubble({ message, position }: { message: AgentMessage; position: string }) {
  const isOutgoing = message.from === 'user'

  return (
    <div
      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} chat-message-row`}
      data-from={isOutgoing ? 'business' : 'customer'}
    >
      <div
        className={[
          'chat-bubble',
          isOutgoing ? 'chat-bubble--outgoing' : 'chat-bubble--incoming',
          isOutgoing ? `chat-bubble--outgoing-${position}` : `chat-bubble--incoming-${position}`,
        ].join(' ')}
      >
        {message.text && <p className="m-0 text-sm text-text-primary">{message.text}</p>}
        <div className="mt-1 flex items-center justify-end text-[10px] text-text-muted">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  )
}

/* ── Main chat component ── */

interface AgentChatProps {
  messages: AgentMessage[]
  onSendMessage: (text: string) => void
  /** The last pending MCQ/SCQ question (not yet answered) */
  pendingQuestion: AgentMessage | null
  onDismissQuestion: () => void
}

export function AgentChat({
  messages,
  onSendMessage,
  pendingQuestion,
  onDismissQuestion,
}: AgentChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Only show text messages in the chat (MCQ/SCQ questions show as text bubbles,
  // their options appear in the input area)
  const textMessages = useMemo(
    () => messages.filter((m) => m.type === 'text' || m.from === 'user'),
    [messages],
  )

  const groups = useMemo(() => groupMessagesByDate(textMessages), [textMessages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const pendingOptions = pendingQuestion
    ? {
        type: pendingQuestion.type as 'mcq' | 'scq',
        text: pendingQuestion.text,
        options: pendingQuestion.options || [],
      }
    : null

  const handleOptionSelect = () => {
    onDismissQuestion()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        <div className="mx-auto max-w-3xl">
          {groups.map((group) => (
            <div key={group.date}>
              <div className="flex items-center justify-center py-3">
                <span className="rounded-full bg-bg-subtle px-3 py-1 text-xs text-text-muted">
                  {group.date}
                </span>
              </div>
              {group.messages.map((msg) => {
                const globalIndex = textMessages.indexOf(msg)
                return (
                  <TextBubble
                    key={msg.id}
                    message={msg}
                    position={getPosition(globalIndex, textMessages)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <AgentChatInput
        onSend={onSendMessage}
        pendingOptions={pendingOptions}
        onOptionSelect={handleOptionSelect}
      />
    </div>
  )
}

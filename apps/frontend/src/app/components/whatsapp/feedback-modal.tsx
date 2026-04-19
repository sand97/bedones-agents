import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Button, Input, Spin, Avatar } from 'antd'
import { Sparkles, CheckCircle2, Send } from 'lucide-react'
import dayjs from 'dayjs'
import type { Message } from './mock-data'

type ChatProvider = 'whatsapp' | 'instagram-dm' | 'messenger'
type FeedbackStep = 'input' | 'analyzing' | 'chat' | 'success'

export interface FeedbackTurn {
  id: string
  from: 'user' | 'agent'
  text: string
  timestamp: string
}

interface FeedbackModalProps {
  open: boolean
  onClose: () => void
  originalMessage: Message | null
  provider?: ChatProvider
  /**
   * Called when the front-end wants to send the accumulated conversation to the backend.
   * Should resolve with either a clarifying question (keeps the chat open) or `null` when
   * the backend considers the feedback clear enough (moves to success).
   */
  onSubmit?: (params: {
    originalMessage: Message
    conversation: FeedbackTurn[]
  }) => Promise<{ followUp: string | null }>
}

function previewOriginal(message: Message | null, t: (k: string) => string): string {
  if (!message) return ''
  if (message.text) return message.text
  switch (message.type) {
    case 'image':
      return message.imageCaption || t('chat.image')
    case 'video':
      return t('chat.video')
    case 'audio':
      return t('chat.audio')
    case 'file':
      return message.fileName || t('chat.document')
    case 'catalog':
    case 'catalog_message':
      return t('chat.catalog_sent')
    case 'order':
      return t('chat.order_title')
    default:
      return ''
  }
}

function formatTime(iso: string): string {
  return dayjs(iso).format('HH:mm')
}

/** Mock backend that decides if the feedback is clear enough. */
async function mockAnalyze(conversation: FeedbackTurn[]): Promise<{ followUp: string | null }> {
  await new Promise((resolve) => setTimeout(resolve, 1400))
  const lastUser = [...conversation].reverse().find((m) => m.from === 'user')
  const userText = lastUser?.text.trim() ?? ''
  const userTurns = conversation.filter((m) => m.from === 'user').length
  // Very short feedback on the first turn → ask for clarification.
  if (userText.length < 25 && userTurns < 2) {
    return {
      followUp:
        "Merci pour ce retour. Pourriez-vous préciser ce qui n'allait pas (ton, information manquante, format) afin que je puisse ajuster la réponse ?",
    }
  }
  return { followUp: null }
}

export function FeedbackModal({
  open,
  onClose,
  originalMessage,
  provider = 'whatsapp',
  onSubmit,
}: FeedbackModalProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<FeedbackStep>('input')
  const [input, setInput] = useState('')
  const [conversation, setConversation] = useState<FeedbackTurn[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset state when the modal (re)opens
  useEffect(() => {
    if (open) {
      setStep('input')
      setInput('')
      setConversation([])
    }
  }, [open, originalMessage?.id])

  // Auto-scroll conversation on new messages / step changes
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [conversation.length, step])

  const originalPreview = useMemo(() => previewOriginal(originalMessage, t), [originalMessage, t])
  const originalTime = useMemo(
    () => (originalMessage ? formatTime(originalMessage.timestamp) : ''),
    [originalMessage],
  )

  const bubbleClass =
    provider === 'whatsapp' ? 'feedback-bubble--whatsapp' : 'feedback-bubble--neutral'

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || !originalMessage) return

    const userTurn: FeedbackTurn = {
      id: `fb-${Date.now()}`,
      from: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    }
    const nextConversation = [...conversation, userTurn]
    setConversation(nextConversation)
    setInput('')
    setStep('analyzing')

    try {
      const analyze = onSubmit ?? (() => mockAnalyze(nextConversation))
      const result = await analyze({ originalMessage, conversation: nextConversation })
      if (result.followUp) {
        const agentTurn: FeedbackTurn = {
          id: `fb-ag-${Date.now()}`,
          from: 'agent',
          text: result.followUp,
          timestamp: new Date().toISOString(),
        }
        setConversation((prev) => [...prev, agentTurn])
        setStep('chat')
      } else {
        setStep('success')
      }
    } catch {
      setStep('chat')
    }
  }

  const canSend = input.trim().length > 0 && step !== 'analyzing'
  const showComposer = step === 'input' || step === 'chat' || step === 'analyzing'

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div className="flex items-center gap-2">
          <Sparkles size={18} strokeWidth={2} />
          <span>{t('feedback.title')}</span>
        </div>
      }
      footer={null}
      width={560}
      centered
      destroyOnHidden
      styles={{ body: { padding: 0, maxHeight: '70vh', display: 'flex', flexDirection: 'column' } }}
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Scrollable area: original message + conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-4 pb-3">
          <div className="mb-3 text-xs text-text-muted">{t('feedback.subtitle')}</div>

          {/* Original AI response */}
          <div className="mb-1 text-xs font-semibold text-text-muted">
            {t('feedback.original_response')}
          </div>
          <div className="mb-5 flex justify-end">
            <div className={`feedback-bubble ${bubbleClass}`}>
              <p className="m-0 whitespace-pre-wrap text-sm">{originalPreview}</p>
              <div className="mt-1 text-right text-[10px] opacity-80">{originalTime}</div>
            </div>
          </div>

          {/* Feedback conversation */}
          {conversation.length > 0 && (
            <div className="flex flex-col gap-2">
              {conversation.map((turn) => {
                const isUser = turn.from === 'user'
                return (
                  <div
                    key={turn.id}
                    className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <Avatar
                        size={24}
                        className="flex-shrink-0 bg-black text-white"
                        icon={<Sparkles size={12} />}
                      />
                    )}
                    <div
                      className={`feedback-bubble ${
                        isUser ? 'feedback-bubble--user' : 'feedback-bubble--agent'
                      }`}
                    >
                      <p className="m-0 whitespace-pre-wrap text-sm">{turn.text}</p>
                      <div className="mt-1 text-right text-[10px] opacity-70">
                        {formatTime(turn.timestamp)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Analysis indicator */}
          {step === 'analyzing' && (
            <div className="mt-3 flex items-start gap-2">
              <Avatar
                size={24}
                className="flex-shrink-0 bg-black text-white"
                icon={<Sparkles size={12} />}
              />
              <div className="feedback-bubble feedback-bubble--agent flex items-center gap-3">
                <Spin size="small" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">
                    {t('feedback.analyzing_title')}
                  </span>
                  <span className="text-xs text-text-muted">{t('feedback.analyzing_desc')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Success state */}
          {step === 'success' && (
            <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-whatsapp)_15%,transparent)] text-[color:var(--color-brand-whatsapp)]">
                <CheckCircle2 size={32} strokeWidth={2} />
              </div>
              <div className="text-base font-semibold text-text-primary">
                {t('feedback.success_title')}
              </div>
              <div className="max-w-xs text-sm text-text-muted">{t('feedback.success_desc')}</div>
            </div>
          )}
        </div>

        {/* Footer: composer or close */}
        {showComposer ? (
          <div className="flex items-end gap-2 border-t border-border-subtle px-5 py-3">
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('feedback.placeholder')}
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={step === 'analyzing'}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              className="flex-1"
            />
            <Button
              type="primary"
              shape="circle"
              icon={<Send size={16} />}
              onClick={handleSend}
              disabled={!canSend}
              loading={step === 'analyzing'}
            />
          </div>
        ) : (
          <div className="flex justify-end border-t border-border-subtle px-5 py-3">
            <Button type="primary" onClick={onClose}>
              {t('feedback.close')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

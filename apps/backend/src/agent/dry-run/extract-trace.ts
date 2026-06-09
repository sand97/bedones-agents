import type { BaseMessage } from '@langchain/core/messages'
import type { CapturedSend } from './capturing-messaging.double'
import type { CapturedWrite } from './dry-run-prisma'

export interface RecordedToolCall {
  order: number
  id?: string
  name: string
  args: unknown
  result?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Number of LLM round-trips the agent made for this turn. */
  llmCalls: number
}

export interface AgentRunSignals {
  toolCalls: number
  /** Total customer-facing sends (reply + buttons + product messages). */
  customerFacingSends: number
  /** Number of reply_to_message sends specifically. */
  replyMessages: number
  /**
   * TRUE when the agent sent more than one message to the customer in a single
   * turn — this must NEVER happen in production (see system prompt rules).
   */
  multipleSends: boolean
  /** Total characters across the reply messages (brevity signal). */
  replyChars: number
}

export interface AgentRunTrace {
  toolCalls: RecordedToolCall[]
  capturedSends: CapturedSend[]
  simulatedDbWrites: CapturedWrite[]
  /** Customer-facing reply, reconstructed from the captured sends. */
  finalReplyText: string
  /** Raw text content of the last assistant message (fallback / debugging). */
  lastAssistantText: string
  /** Aggregated token usage across all LLM calls in the turn. */
  tokenUsage: TokenUsage
  /** Quality signals to drive system-prompt / model iteration. */
  signals: AgentRunSignals
}

type LooseMessage = {
  getType?: () => string
  _getType?: () => string
  tool_calls?: { id?: string; name: string; args: unknown }[]
  tool_call_id?: string
  content?: unknown
  usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  response_metadata?: {
    tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  }
}

function messageType(m: LooseMessage): string {
  if (typeof m.getType === 'function') return m.getType()
  if (typeof m._getType === 'function') return m._getType()
  return ''
}

function contentToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : typeof (part as { text?: unknown })?.text === 'string'
            ? (part as { text: string }).text
            : '',
      )
      .join('')
  }
  return content == null ? '' : JSON.stringify(content)
}

/**
 * Walk the message list returned by `createReactAgent.invoke` and pull out the
 * ordered tool calls (name + args) paired with their tool results. Uses
 * duck-typing rather than `instanceof` so it is robust across duplicated
 * @langchain/core instances.
 */
export function extractToolCalls(messages: BaseMessage[]): RecordedToolCall[] {
  const calls: RecordedToolCall[] = []
  const byId = new Map<string, RecordedToolCall>()
  let order = 0

  for (const raw of messages as unknown as LooseMessage[]) {
    const toolCalls = Array.isArray(raw.tool_calls) ? raw.tool_calls : undefined
    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const rec: RecordedToolCall = { order: order++, id: tc.id, name: tc.name, args: tc.args }
        calls.push(rec)
        if (tc.id) byId.set(tc.id, rec)
      }
      continue
    }

    if (messageType(raw) === 'tool' || typeof raw.tool_call_id === 'string') {
      const rec = raw.tool_call_id ? byId.get(raw.tool_call_id) : undefined
      if (rec) rec.result = contentToString(raw.content)
    }
  }

  return calls
}

export function extractLastAssistantText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as unknown as LooseMessage
    if (messageType(m) === 'ai') {
      const text = contentToString(m.content)
      if (text.trim().length > 0) return text
    }
  }
  return ''
}

/** Reconstruct the customer-facing reply from the captured sends. */
export function reconstructReply(sends: CapturedSend[]): string {
  const parts: string[] = []
  for (const s of sends) {
    if (s.kind === 'reply') parts.push(s.message)
    else if (s.kind === 'buttons') {
      parts.push(`${s.body} [${s.buttons.map((b) => b.label).join(' | ')}]`)
    } else if (s.kind === 'products') {
      parts.push(
        `[${s.productRetailerIds.length} produit(s) envoyé(s)${s.bodyText ? `: ${s.bodyText}` : ''}]`,
      )
    }
  }
  return parts.join('\n')
}

/** Sum token usage across every assistant (LLM) message in the turn. */
export function aggregateTokenUsage(messages: BaseMessage[]): TokenUsage {
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let llmCalls = 0

  for (const raw of messages as unknown as LooseMessage[]) {
    if (messageType(raw) !== 'ai') continue
    const um = raw.usage_metadata
    const rm = raw.response_metadata
    const input = um?.input_tokens ?? rm?.usage?.input_tokens ?? rm?.tokenUsage?.promptTokens
    const output = um?.output_tokens ?? rm?.usage?.output_tokens ?? rm?.tokenUsage?.completionTokens
    const total = um?.total_tokens ?? rm?.usage?.total_tokens ?? rm?.tokenUsage?.totalTokens

    if (input === undefined && output === undefined && total === undefined) continue
    inputTokens += input ?? 0
    outputTokens += output ?? 0
    totalTokens += total ?? (input ?? 0) + (output ?? 0)
    llmCalls += 1
  }

  return { inputTokens, outputTokens, totalTokens, llmCalls }
}

function computeSignals(toolCalls: RecordedToolCall[], sends: CapturedSend[]): AgentRunSignals {
  const replies = sends.filter(
    (s): s is Extract<CapturedSend, { kind: 'reply' }> => s.kind === 'reply',
  )
  return {
    toolCalls: toolCalls.length,
    customerFacingSends: sends.length,
    replyMessages: replies.length,
    multipleSends: sends.length > 1,
    replyChars: replies.reduce((n, s) => n + s.message.length, 0),
  }
}

export function buildAgentRunTrace(
  messages: BaseMessage[],
  sends: CapturedSend[],
  writes: CapturedWrite[],
): AgentRunTrace {
  const toolCalls = extractToolCalls(messages)
  return {
    toolCalls,
    capturedSends: sends,
    simulatedDbWrites: writes,
    finalReplyText: reconstructReply(sends),
    lastAssistantText: extractLastAssistantText(messages),
    tokenUsage: aggregateTokenUsage(messages),
    signals: computeSignals(toolCalls, sends),
  }
}

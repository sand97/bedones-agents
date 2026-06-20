import { Command, END } from '@langchain/langgraph'
import { ToolMessage } from '@langchain/core/messages'

/**
 * Per-turn guard that guarantees the agent delivers AT MOST ONE customer-facing
 * message per turn (a single reply_to_message / send_buttons / send_products).
 *
 * The system prompt asks the model to end its turn after replying, but a model
 * can ignore that and send two messages — which must NEVER reach the customer.
 * This guard enforces it in code: the first customer-facing send wins, any
 * subsequent one is suppressed (not delivered) and the model is told to stop.
 *
 * One guard instance is shared across the three customer-facing tools of a
 * single turn (created in buildLiveAgentTools).
 */
export interface SingleReplyGuard {
  /** Set to true once a customer-facing message has been successfully sent. */
  sent: boolean
}

export function createSingleReplyGuard(): SingleReplyGuard {
  return { sent: false }
}

/**
 * Atomically claim the single customer-facing send of this turn. Returns true if
 * the caller may send, false if another tool already claimed it. The claim is
 * synchronous (set BEFORE any await), so two tool calls executed in parallel
 * within one model turn can't both pass the check and double-send.
 */
export function claimReply(guard?: SingleReplyGuard): boolean {
  if (!guard) return true
  if (guard.sent) return false
  guard.sent = true
  return true
}

/** Release a claim after a failed send, so another tool may still deliver. */
export function releaseReply(guard?: SingleReplyGuard): void {
  if (guard) guard.sent = false
}

/** Returned to the model when it tries to send a second message in one turn. */
export const REPLY_ALREADY_SENT_NOTICE =
  'A reply has already been sent to the customer this turn. Do NOT send another message — end your turn now.'

/**
 * Returned to the model when this turn has been cancelled by a newer message from
 * the same contact: the customer-facing send is dropped so the superseded run can
 * never deliver a (now stale) reply. Prevents two messages on the same conversation.
 */
export const RUN_CANCELLED_NOTICE =
  'This turn was cancelled because the customer sent a newer message. Do NOT send anything — end your turn now.'

/** Runtime config slice exposed to a tool by the ToolNode: the id of the model's
 *  tool call. Set by LangChain when a tool is invoked from a react agent. */
type ToolCallConfig = { toolCall?: { id?: string } }

/**
 * Result returned by a customer-facing tool after a SUCCESSFUL send. It routes
 * the react agent straight to END so the turn stops WITHOUT a second (wasted)
 * LLM round-trip: once the single allowed message is delivered there is nothing
 * left for the model to decide.
 *
 * Before this, the agent always looped back to the model after the send; the
 * model then re-emitted the very same reply (immediately blocked by the guard /
 * post-model hook), billing a second LLM call per turn for nothing. Ending here
 * removes that call entirely. Internal tools (search_products, save_contact_note,
 * request_ticket…) keep looping normally — only the terminal customer-facing
 * send ends the turn.
 *
 * The ToolMessage carries the model's `tool_call_id` so the message history
 * stays valid even though the model is not called again this turn.
 */
export function endTurnAfterSend(content: string, config?: ToolCallConfig): Command {
  return new Command({
    goto: END,
    update: {
      messages: [new ToolMessage({ content, tool_call_id: config?.toolCall?.id ?? '' })],
    },
  })
}

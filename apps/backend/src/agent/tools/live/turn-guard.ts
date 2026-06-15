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

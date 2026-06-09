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

/** Returned to the model when it tries to send a second message in one turn. */
export const REPLY_ALREADY_SENT_NOTICE =
  'A reply has already been sent to the customer this turn. Do NOT send another message — end your turn now.'

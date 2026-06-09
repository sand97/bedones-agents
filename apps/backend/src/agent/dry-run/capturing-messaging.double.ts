import type { MessagingService } from '../../social/messaging.service'

/**
 * A customer-facing send the agent tried to perform. In dry-run mode nothing is
 * delivered to WhatsApp/Meta — we just record what WOULD have been sent.
 */
export type CapturedSend =
  | { kind: 'reply'; conversationId: string; message: string }
  | {
      kind: 'products'
      conversationId: string
      productRetailerIds: string[]
      catalogId: string
      format: string
      headerText?: string
      bodyText?: string
    }
  | {
      kind: 'buttons'
      conversationId: string
      body: string
      buttons: { id?: string; label: string }[]
    }

/**
 * Stand-in for {@link MessagingService} used in dry-run / sandbox runs. It
 * implements only the three methods the live agent's tools call
 * (`reply_to_message`, `send_products`, `send_buttons`) and records the calls
 * instead of performing any HTTP request to Meta. Cast to `MessagingService`
 * when building a {@link LiveAgentToolContext} — the tools never touch any other
 * method.
 */
export class CapturingMessagingDouble {
  readonly sends: CapturedSend[] = []

  sendMessageAsAgent: MessagingService['sendMessageAsAgent'] = async (conversationId, message) => {
    this.sends.push({ kind: 'reply', conversationId, message })
    return { id: `dry-run-${this.sends.length}`, message }
  }

  sendProductMessageAsAgent: MessagingService['sendProductMessageAsAgent'] = async (
    conversationId,
    productRetailerIds,
    catalogId,
    format,
    headerText,
    bodyText,
  ) => {
    this.sends.push({
      kind: 'products',
      conversationId,
      productRetailerIds,
      catalogId,
      format,
      headerText,
      bodyText,
    })
    return { id: `dry-run-${this.sends.length}`, message: '' }
  }

  sendInteractiveButtonsAsAgent: MessagingService['sendInteractiveButtonsAsAgent'] = async (
    conversationId,
    body,
    buttons,
  ) => {
    this.sends.push({
      kind: 'buttons',
      conversationId,
      body,
      buttons: buttons.map((b) => ({ id: b.id, label: b.label })),
    })
    return { id: `dry-run-${this.sends.length}`, message: '' }
  }

  /** No-op: typing indicators are irrelevant in a sandboxed run. */
  sendTypingIndicator: MessagingService['sendTypingIndicator'] = async () => {}

  asMessagingService(): MessagingService {
    return this as unknown as MessagingService
  }
}

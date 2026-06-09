/**
 * Per-platform limits and formatting for interactive "proposal" buttons the AI
 * agent sends to a customer.
 *
 * The common denominator across WhatsApp / Messenger / Instagram is "up to 3
 * reply buttons, label ≤ 20 chars", so we unify on that primitive. Meta
 * truncates over-long labels SILENTLY (confusing UX), so we truncate explicitly
 * and append an ellipsis instead.
 *
 * Sources (2024–2026):
 * - WhatsApp Cloud API interactive reply buttons: max 3 buttons, title ≤ 20,
 *   body ≤ 1024, footer ≤ 60. https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/
 * - Messenger quick replies / button template: title ≤ 20, button template text ≤ 640.
 *   https://developers.facebook.com/docs/messenger-platform/send-messages/quick-replies/
 * - Instagram quick replies (text-only): title ≤ 20.
 *   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/quick-replies/
 */

export interface AgentButton {
  /** Stable id echoed back when the customer taps it. Auto-generated if absent. */
  id?: string
  label: string
}

/** Max reply buttons we expose to the agent (WhatsApp's cap = the unified one). */
export const MAX_BUTTONS = 3

/** Max characters for a button label, per provider. */
const LABEL_MAX: Record<string, number> = {
  WHATSAPP: 20,
  FACEBOOK: 20,
  INSTAGRAM: 20,
  TIKTOK: 20,
}

/** Max characters for the accompanying body text, per provider. */
const BODY_MAX: Record<string, number> = {
  WHATSAPP: 1024,
  FACEBOOK: 640,
  INSTAGRAM: 1000,
  TIKTOK: 1000,
}

/** Truncate to `max` chars, appending an ellipsis (which counts toward `max`). */
export function truncateWithEllipsis(text: string, max: number): string {
  const t = (text ?? '').trim()
  if (t.length <= max) return t
  if (max <= 1) return t.slice(0, Math.max(0, max))
  return t.slice(0, max - 1).trimEnd() + '…'
}

export function formatButtonLabel(label: string, provider: string): string {
  return truncateWithEllipsis(label, LABEL_MAX[provider] ?? 20)
}

export function formatButtonBody(body: string, provider: string): string {
  return truncateWithEllipsis(body, BODY_MAX[provider] ?? 1024)
}

/**
 * Cap to MAX_BUTTONS, truncate each label for the provider, and ensure every
 * button has a stable id (≤ 256 chars, the WhatsApp reply id limit).
 */
export function normalizeButtons(
  buttons: AgentButton[],
  provider: string,
): Array<{ id: string; label: string }> {
  return buttons
    .filter((b) => b.label?.trim())
    .slice(0, MAX_BUTTONS)
    .map((b, i) => ({
      id: (b.id?.trim() || `opt_${i + 1}`).slice(0, 256),
      label: formatButtonLabel(b.label, provider),
    }))
}

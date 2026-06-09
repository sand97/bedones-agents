/**
 * Decide whether an `aiActivationContacts` entry matches a conversation.
 *
 * Contacts are entered by the user either as a phone number (WhatsApp) or a
 * profile name/handle (Messenger/Instagram). Phone numbers are notoriously
 * format-sensitive — "+237 657 888 690", "237657888690" and "657888690" all
 * denote the same person — so for numeric contacts we compare digit-only
 * sequences and treat one as a match when it is a suffix of the other (i.e.
 * tolerant of a present/absent country code). Non-numeric contacts fall back to
 * a case-insensitive name comparison, then to loose id containment.
 */
export function contactMatchesConversation(
  contact: string,
  conversation: { participantId: string; participantName?: string | null },
): boolean {
  const trimmed = contact.trim()
  if (!trimmed) return false

  // Phone-style match: compare digits, tolerant of +, spaces and country code.
  const contactDigits = trimmed.replace(/\D/g, '')
  const pidDigits = conversation.participantId.replace(/\D/g, '')
  if (contactDigits.length >= 6 && pidDigits.length >= 6) {
    if (
      contactDigits === pidDigits ||
      pidDigits.endsWith(contactDigits) ||
      contactDigits.endsWith(pidDigits)
    ) {
      return true
    }
  }

  // Name-style match (Messenger/Instagram handle).
  const name = (conversation.participantName ?? '').toLowerCase()
  const needle = trimmed.toLowerCase()
  if (name && (name.includes(needle) || needle.includes(name))) return true

  // Loose id containment fallback (non-numeric platform ids).
  return (
    conversation.participantId.includes(trimmed) || trimmed.includes(conversation.participantId)
  )
}

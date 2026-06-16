import countryCodes from '@app/data/CountryCodes.json'

/**
 * Lightweight per-country phone display formatting.
 *
 * Maps an ISO-2 country code to a digit-group pattern. Numbers are formatted
 * left-to-right by greedily consuming `groups[i]` digits, then inserting a
 * space. Digits that don't fit any group are appended at the end (so users
 * are never blocked from typing).
 *
 * We intentionally only cover the most common countries our users live in.
 * Anything not in the map falls back to grouping by 3.
 */
export const PHONE_GROUPS: Record<string, number[]> = {
  // Cameroon: 6 57 88 86 90 → groups of 3-2-2-2 after a leading 1 doesn't apply
  // Local format is 9 digits like "657 88 86 90"
  CM: [3, 2, 2, 2],
  // Senegal: "77 123 45 67" (9 digits)
  SN: [2, 3, 2, 2],
  // Côte d'Ivoire: "07 12 34 56 78" (10 digits)
  CI: [2, 2, 2, 2, 2],
  // France: "6 12 34 56 78" (9 digits without leading 0)
  FR: [1, 2, 2, 2, 2],
  // Benin: "01 23 45 67 89" (10 digits)
  BJ: [2, 2, 2, 2, 2],
  // Togo: "90 12 34 56" (8 digits)
  TG: [2, 2, 2, 2],
  // Mali: "65 12 34 56" (8 digits)
  ML: [2, 2, 2, 2],
  // Burkina Faso: "70 12 34 56" (8 digits)
  BF: [2, 2, 2, 2],
  // Gabon: "06 12 34 56" (8 digits)
  GA: [2, 2, 2, 2],
  // Congo: "06 123 45 67" (9 digits)
  CG: [2, 3, 2, 2],
  // DRC: "081 234 56 78" (9 digits)
  CD: [3, 3, 2, 2],
  // Nigeria: "80 1234 5678" (10 digits)
  NG: [2, 4, 4],
  // Belgium: "470 12 34 56" (9 digits)
  BE: [3, 2, 2, 2],
  // United States/Canada: "555 123 4567" (10 digits)
  US: [3, 3, 4],
  CA: [3, 3, 4],
  // United Kingdom: "7700 900123" (10 digits)
  GB: [4, 6],
}

const DEFAULT_GROUPS = [3, 3, 3, 3]

export function formatPhoneNumber(digits: string, countryIsoCode?: string | null): string {
  const clean = digits.replace(/[^0-9]/g, '')
  if (!clean) return ''

  const groups = (countryIsoCode && PHONE_GROUPS[countryIsoCode]) || DEFAULT_GROUPS

  const out: string[] = []
  let cursor = 0
  for (const g of groups) {
    if (cursor >= clean.length) break
    out.push(clean.slice(cursor, cursor + g))
    cursor += g
  }
  if (cursor < clean.length) {
    // Overflow digits — keep them visible so the user is never blocked.
    out.push(clean.slice(cursor))
  }
  return out.join(' ')
}

interface CountryDialEntry {
  name: string
  dial_code: string
  code: string
}

// Dial codes sorted longest-first so longer codes win over shorter prefixes
// when greedily matching the start of a number.
const DIAL_CODES_BY_LENGTH = (countryCodes as CountryDialEntry[])
  .slice()
  .sort((a, b) => b.dial_code.length - a.dial_code.length)

/**
 * Format a full international number for display, e.g.
 * "+237657888690" → "+237 657 88 86 90".
 *
 * Detects the country dial code (longest match first) from CountryCodes.json,
 * then groups the local part per-country via {@link formatPhoneNumber}. Numbers
 * whose dial code isn't recognised fall back to default grouping. Accepts values
 * with or without a leading "+" and tolerates existing spaces.
 */
export function formatInternationalPhone(value?: string | null): string {
  if (!value) return ''
  const digits = value.replace(/[^0-9]/g, '')
  if (!digits) return ''

  const match = DIAL_CODES_BY_LENGTH.find((c) => `+${digits}`.startsWith(c.dial_code))
  if (!match) return `+${formatPhoneNumber(digits)}`

  const dialDigits = match.dial_code.replace(/[^0-9]/g, '')
  const local = digits.slice(dialDigits.length)
  const localFormatted = formatPhoneNumber(local, match.code)
  return localFormatted ? `${match.dial_code} ${localFormatted}` : match.dial_code
}

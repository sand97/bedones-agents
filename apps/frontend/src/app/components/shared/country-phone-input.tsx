import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Input, Select } from 'antd'
import type { InputRef } from 'antd'
import countryCodes from '@app/data/CountryCodes.json'
import { formatPhoneNumber } from '@app/lib/phone-format'

const DEFAULT_DIAL_CODE = '+237'
const DEFAULT_ISO = 'CM'

interface CountryEntry {
  name: string
  dial_code: string
  code: string
}

const COUNTRY_OPTIONS = (countryCodes as CountryEntry[])
  .map((c) => ({
    value: c.dial_code,
    label: `${c.code} ${c.dial_code}`,
    iso: c.code,
  }))
  .sort((a, b) => a.value.localeCompare(b.value))

// Deduplicate dial codes (some countries share the same code).
const seen = new Set<string>()
const UNIQUE_OPTIONS = COUNTRY_OPTIONS.filter((o) => {
  if (seen.has(o.value)) return false
  seen.add(o.value)
  return true
})

// Resolve a dial code → ISO-2 (using the first matching country). Used to
// pick the right phone-grouping pattern.
function resolveIso(dialCode: string): string | undefined {
  return (countryCodes as CountryEntry[]).find((c) => c.dial_code === dialCode)?.code
}

interface CountryPhoneInputProps {
  /** Combined value, e.g. "+237657888690". */
  value?: string
  onChange?: (value: string) => void
  /** Called with the split parts whenever the value changes. */
  onPartsChange?: (parts: { countryCode: string; phoneLocal: string; iso: string }) => void
  addonAfter?: React.ReactNode
  size?: 'small' | 'middle' | 'large'
  /** If true, do NOT auto-detect the country from the user's IP. */
  disableGeoDetect?: boolean
  placeholder?: string
  disabled?: boolean
  /**
   * Show only the dial code (e.g. "+237") in the closed selector instead of the
   * ISO + dial code ("CM +237"). The dropdown still lists the full labels. Saves
   * horizontal space in cramped layouts.
   */
  dialCodeOnly?: boolean
}

export function CountryPhoneInput({
  value = '',
  onChange,
  onPartsChange,
  addonAfter,
  size,
  disableGeoDetect,
  placeholder,
  disabled,
  dialCodeOnly,
}: CountryPhoneInputProps) {
  const [defaultCode, setDefaultCode] = useState(DEFAULT_DIAL_CODE)
  const [initialized, setInitialized] = useState(disableGeoDetect ?? false)

  // Caret restoration: the input displays a *formatted* value (spaces inserted),
  // so re-rendering after a change would otherwise jump the caret to the end.
  // We remember how many digits sat before the caret and restore that position
  // once the formatted value is in the DOM.
  const inputRef = useRef<InputRef>(null)
  const caretDigitsRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const target = caretDigitsRef.current
    if (target === null) return
    caretDigitsRef.current = null
    const el = inputRef.current?.input
    if (!el) return
    // Walk the formatted value and place the caret right after `target` digits.
    let pos = 0
    let count = 0
    while (pos < el.value.length && count < target) {
      if (/[0-9]/.test(el.value[pos])) count++
      pos += 1
    }
    el.setSelectionRange(pos, pos)
  })

  // Detect country from IP on mount (skipped if the parent passes
  // disableGeoDetect — typically when the value is already prefilled).
  useEffect(() => {
    if (initialized) return
    fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
      .then((res) => res.json())
      .then((data: { country_calling_code?: string }) => {
        if (data.country_calling_code) {
          const code = data.country_calling_code
          const exists = (countryCodes as CountryEntry[]).some((c) => c.dial_code === code)
          if (exists) {
            setDefaultCode(code)
          }
        }
      })
      .catch(() => {
        // Fallback silently to default
      })
      .finally(() => setInitialized(true))
  }, [initialized])

  const parsed = parsePhone(value, defaultCode)
  const iso = resolveIso(parsed.countryCode) ?? DEFAULT_ISO

  const emit = (countryCode: string, number: string) => {
    const cleanNumber = number.replace(/[^0-9]/g, '')
    onChange?.(countryCode + cleanNumber)
    onPartsChange?.({
      countryCode,
      phoneLocal: cleanNumber,
      iso: resolveIso(countryCode) ?? DEFAULT_ISO,
    })
  }

  const handleCountryChange = (countryCode: string) => {
    emit(countryCode, parsed.number)
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const selectionStart = el.selectionStart ?? el.value.length
    // Count digits before the caret in the raw input so we can re-place the
    // caret after re-formatting (handles typing *and* pasting mid-string).
    caretDigitsRef.current = el.value.slice(0, selectionStart).replace(/[^0-9]/g, '').length
    emit(parsed.countryCode, el.value)
  }

  const selectBefore = (
    <Select
      value={parsed.countryCode}
      onChange={handleCountryChange}
      popupMatchSelectWidth={false}
      style={{ width: dialCodeOnly ? 76 : 100 }}
      showSearch
      optionFilterProp="label"
      // When compact, the closed selector shows the option `value` (dial code)
      // while the dropdown keeps the full "ISO +code" labels.
      optionLabelProp={dialCodeOnly ? 'value' : undefined}
      options={UNIQUE_OPTIONS}
      disabled={disabled}
    />
  )

  return (
    <Input
      ref={inputRef}
      addonBefore={selectBefore}
      addonAfter={addonAfter}
      value={formatPhoneNumber(parsed.number, iso)}
      onChange={handleNumberChange}
      placeholder={placeholder ?? '6 57 88 86 90'}
      maxLength={20}
      size={size}
      disabled={disabled}
    />
  )
}

function parsePhone(value: string, fallback: string): { countryCode: string; number: string } {
  if (!value) return { countryCode: fallback, number: '' }

  // Try to match a known country code (longest first to avoid partial matches)
  const sorted = [...(countryCodes as CountryEntry[])].sort(
    (a, b) => b.dial_code.length - a.dial_code.length,
  )
  for (const country of sorted) {
    if (value.startsWith(country.dial_code)) {
      return { countryCode: country.dial_code, number: value.slice(country.dial_code.length) }
    }
  }

  return { countryCode: fallback, number: value.replace('+', '') }
}

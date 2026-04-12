import { useEffect, useState } from 'react'
import { Input, Select } from 'antd'
import countryCodes from '@app/data/CountryCodes.json'

const DEFAULT_DIAL_CODE = '+237'

const COUNTRY_OPTIONS = countryCodes.map((c) => ({
  value: c.dial_code,
  label: `${c.code} ${c.dial_code}`,
}))

// Sort by dial code for easier scanning
COUNTRY_OPTIONS.sort((a, b) => a.value.localeCompare(b.value))

// Deduplicate dial codes (some countries share the same code)
const seen = new Set<string>()
const UNIQUE_OPTIONS = COUNTRY_OPTIONS.filter((o) => {
  if (seen.has(o.value)) return false
  seen.add(o.value)
  return true
})

interface CountryPhoneInputProps {
  value?: string
  onChange?: (value: string) => void
  addonAfter?: React.ReactNode
}

export function CountryPhoneInput({ value = '', onChange, addonAfter }: CountryPhoneInputProps) {
  const [defaultCode, setDefaultCode] = useState(DEFAULT_DIAL_CODE)
  const [initialized, setInitialized] = useState(false)

  // Detect country from IP on mount
  useEffect(() => {
    if (initialized) return
    fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
      .then((res) => res.json())
      .then((data: { country_calling_code?: string }) => {
        if (data.country_calling_code) {
          const code = data.country_calling_code
          const exists = countryCodes.some((c) => c.dial_code === code)
          if (exists) {
            setDefaultCode(code)
          }
        }
      })
      .catch(() => {
        // Fallback silently to default
      })
      .finally(() => setInitialized(true))
  }, [])

  const parsed = parsePhone(value, defaultCode)

  const handleCountryChange = (countryCode: string) => {
    onChange?.(countryCode + parsed.number)
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = e.target.value.replace(/[^0-9]/g, '')
    onChange?.(parsed.countryCode + num)
  }

  const selectBefore = (
    <Select
      value={parsed.countryCode}
      onChange={handleCountryChange}
      popupMatchSelectWidth={false}
      style={{ width: 100 }}
      showSearch
      optionFilterProp="label"
      options={UNIQUE_OPTIONS}
    />
  )

  return (
    <Input
      addonBefore={selectBefore}
      addonAfter={addonAfter}
      value={parsed.number}
      onChange={handleNumberChange}
      placeholder="07 01 02 03 04"
      maxLength={15}
    />
  )
}

function parsePhone(value: string, fallback: string): { countryCode: string; number: string } {
  if (!value) return { countryCode: fallback, number: '' }

  // Try to match a known country code (longest first to avoid partial matches)
  const sorted = [...countryCodes].sort((a, b) => b.dial_code.length - a.dial_code.length)
  for (const country of sorted) {
    if (value.startsWith(country.dial_code)) {
      return { countryCode: country.dial_code, number: value.slice(country.dial_code.length) }
    }
  }

  return { countryCode: fallback, number: value.replace('+', '') }
}

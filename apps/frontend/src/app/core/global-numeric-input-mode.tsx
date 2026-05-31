import { useEffect } from 'react'

const NUMERIC_SELECTOR = '.ant-input-number-input:not([inputmode])'

/**
 * Antd's InputNumber renders a regular text input, so mobile browsers default
 * to the alphanumeric keyboard. We sweep the DOM at mount time and on every
 * mutation to flag those inputs with `inputmode="decimal"`, which surfaces a
 * numeric pad without forcing every call site to thread the prop.
 */
export function GlobalNumericInputMode() {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const apply = () => {
      document.querySelectorAll<HTMLInputElement>(NUMERIC_SELECTOR).forEach((el) => {
        el.setAttribute('inputmode', 'decimal')
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}

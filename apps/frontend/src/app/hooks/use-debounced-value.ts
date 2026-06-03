import { useEffect, useState } from 'react'

/**
 * Returns `value` only after it has stopped changing for `delay` ms. Use it to
 * debounce a search input before it drives a query, so typing doesn't fire an
 * API call on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

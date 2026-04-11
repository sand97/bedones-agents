import { useEffect } from 'react'
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

const STORAGE_PREFIX = 'rq_cache:'

/**
 * A useQuery wrapper that persists data in localStorage.
 * On mount, cached data is used as `placeholderData` so the UI renders instantly
 * (no loading state). The query then refetches in the background and updates.
 *
 * This avoids visual glitches on page refresh for data that rarely changes.
 */
export function usePersistedQuery<T>(options: UseQueryOptions<T>) {
  const storageKey = `${STORAGE_PREFIX}${JSON.stringify(options.queryKey)}`

  // Read cached data from localStorage (sync, before render)
  let placeholderData: T | undefined
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) placeholderData = JSON.parse(raw) as T
  } catch {
    // ignore parse errors
  }

  const query = useQuery<T>({
    ...options,
    placeholderData: options.placeholderData ?? placeholderData,
    staleTime: options.staleTime ?? 60_000,
    gcTime: options.gcTime ?? Infinity,
  })

  // Persist fresh data to localStorage
  useEffect(() => {
    if (query.data !== undefined && !query.isPlaceholderData) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(query.data))
      } catch {
        // quota exceeded — ignore
      }
    }
  }, [query.data, query.isPlaceholderData, storageKey])

  return query
}

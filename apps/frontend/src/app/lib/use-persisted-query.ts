import { useEffect } from 'react'
import {
  useQuery,
  type UseQueryResult,
  type QueryKey,
  type QueryFunction,
} from '@tanstack/react-query'

const STORAGE_PREFIX = 'rq_cache:'

interface PersistedQueryOptions<T> {
  queryKey: QueryKey
  queryFn: QueryFunction<T>
  enabled?: boolean
  staleTime?: number
  gcTime?: number
}

/**
 * A useQuery wrapper that persists data in localStorage.
 * On mount, cached data is used as `placeholderData` so the UI renders instantly
 * (no loading state). The query then refetches in the background and updates.
 *
 * This avoids visual glitches on page refresh for data that rarely changes.
 */
export function usePersistedQuery<T>(options: PersistedQueryOptions<T>): UseQueryResult<T> {
  const storageKey = `${STORAGE_PREFIX}${JSON.stringify(options.queryKey)}`

  // Read cached data from localStorage (sync, before render)
  let cached: T | undefined
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) cached = JSON.parse(raw) as T
  } catch {
    // ignore parse errors
  }

  const query = useQuery({
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    enabled: options.enabled,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    placeholderData: cached as any,
    staleTime: options.staleTime ?? 60_000,
    gcTime: options.gcTime ?? Infinity,
  }) as UseQueryResult<T>

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

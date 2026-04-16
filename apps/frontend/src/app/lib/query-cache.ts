import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Helpers to patch React Query cache after mutations instead of invalidating.
 *
 * - `*ListItemCache` variants work on paginated responses shaped like
 *   `{ [listField]: T[]; total?: number; ...rest }` and iterate all cached
 *   queries whose key starts with `queryKeyPrefix`.
 *
 * - `*DirectListCache` variants work on queries whose data is a raw `T[]`.
 */

type WithId = { id: string }

type ListEnvelope<F extends string, T> = { [K in F]: T[] } & { total?: number }

function toListEnvelope<F extends string, T>(
  old: unknown,
  listField: F,
): ListEnvelope<F, T> | null {
  if (!old || typeof old !== 'object') return null
  const cast = old as ListEnvelope<F, T>
  if (!Array.isArray(cast[listField])) return null
  return cast
}

/** Replace (merge) an item inside every cached list that matches the prefix. */
export function updateListItemCache<T extends WithId, F extends string>(
  queryClient: QueryClient,
  queryKeyPrefix: QueryKey,
  listField: F,
  updated: Partial<T> & WithId,
) {
  queryClient.setQueriesData({ queryKey: queryKeyPrefix }, (old: unknown) => {
    const env = toListEnvelope<F, T>(old, listField)
    if (!env) return old
    return {
      ...env,
      [listField]: env[listField].map((item) =>
        item.id === updated.id ? ({ ...item, ...updated } as T) : item,
      ),
    }
  })
}

/** Remove an item by id from every cached list that matches the prefix. */
export function removeListItemCache<T extends WithId, F extends string>(
  queryClient: QueryClient,
  queryKeyPrefix: QueryKey,
  listField: F,
  id: string,
) {
  queryClient.setQueriesData({ queryKey: queryKeyPrefix }, (old: unknown) => {
    const env = toListEnvelope<F, T>(old, listField)
    if (!env) return old
    const list = env[listField]
    const wasPresent = list.some((item) => item.id === id)
    if (!wasPresent) return old
    return {
      ...env,
      [listField]: list.filter((item) => item.id !== id),
      total: typeof env.total === 'number' ? env.total - 1 : env.total,
    }
  })
}

/** Prepend an item to every cached list that matches the prefix. */
export function prependListItemCache<T extends WithId, F extends string>(
  queryClient: QueryClient,
  queryKeyPrefix: QueryKey,
  listField: F,
  item: T,
) {
  queryClient.setQueriesData({ queryKey: queryKeyPrefix }, (old: unknown) => {
    const env = toListEnvelope<F, T>(old, listField)
    if (!env) return old
    return {
      ...env,
      [listField]: [item, ...env[listField]],
      total: typeof env.total === 'number' ? env.total + 1 : env.total,
    }
  })
}

/* ─── Direct-array variants (data is `T[]`, not wrapped) ─── */

export function updateDirectListCache<T extends WithId>(
  queryClient: QueryClient,
  queryKeyPrefix: QueryKey,
  updated: Partial<T> & WithId,
) {
  queryClient.setQueriesData({ queryKey: queryKeyPrefix }, (old: unknown) => {
    if (!Array.isArray(old)) return old
    return (old as T[]).map((item) =>
      item.id === updated.id ? ({ ...item, ...updated } as T) : item,
    )
  })
}

export function removeDirectListCache<T extends WithId>(
  queryClient: QueryClient,
  queryKeyPrefix: QueryKey,
  id: string,
) {
  queryClient.setQueriesData({ queryKey: queryKeyPrefix }, (old: unknown) => {
    if (!Array.isArray(old)) return old
    return (old as T[]).filter((item) => item.id !== id)
  })
}

export function prependDirectListCache<T extends WithId>(
  queryClient: QueryClient,
  queryKeyPrefix: QueryKey,
  item: T,
) {
  queryClient.setQueriesData({ queryKey: queryKeyPrefix }, (old: unknown) => {
    if (!Array.isArray(old)) return [item]
    return [item, ...(old as T[])]
  })
}

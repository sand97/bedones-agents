import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { $api } from '@app/lib/api/$api'

interface UnreadCounts {
  FACEBOOK: number
  INSTAGRAM: number
  TIKTOK: number
  [key: string]: number
}

interface UnreadContextType {
  counts: UnreadCounts
  refresh: () => void
}

const defaultCounts: UnreadCounts = { FACEBOOK: 0, INSTAGRAM: 0, TIKTOK: 0 }

const UnreadContext = createContext<UnreadContextType>({
  counts: defaultCounts,
  refresh: () => {},
})

const POLL_INTERVAL = 30_000 // 30s

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const queryClient = useQueryClient()

  const { data } = $api.useQuery(
    'get',
    '/social/unread-counts/{organisationId}',
    { params: { path: { organisationId: orgSlug! } } },
    {
      enabled: !!orgSlug,
      refetchInterval: POLL_INTERVAL,
    },
  )

  const counts: UnreadCounts = { FACEBOOK: 0, INSTAGRAM: 0, TIKTOK: 0 }
  if (data) {
    for (const item of data) {
      counts[item.provider] = item.count
    }
  }

  const refresh = useCallback(() => {
    if (!orgSlug) return
    queryClient.invalidateQueries({
      queryKey: ['get', '/social/unread-counts/{organisationId}'],
    })
  }, [queryClient, orgSlug])

  return <UnreadContext.Provider value={{ counts, refresh }}>{children}</UnreadContext.Provider>
}

export function useUnreadCounts() {
  return useContext(UnreadContext)
}

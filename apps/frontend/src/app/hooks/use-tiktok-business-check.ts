import { useState, useEffect } from 'react'
import { $api } from '@app/lib/api/$api'

export function useTikTokBusinessCheck(accountId: string | null, provider?: string) {
  const [showGuide, setShowGuide] = useState(false)

  const enabled = !!accountId && provider === 'TIKTOK'

  const { data } = $api.useQuery(
    'get',
    '/social/tiktok/{accountId}/check-business',
    { params: { path: { accountId: accountId! } } },
    { enabled, staleTime: 5 * 60 * 1000 },
  )

  useEffect(() => {
    if (data && !data.isBusiness) {
      setShowGuide(true)
    }
  }, [data])

  const closeGuide = () => setShowGuide(false)

  return { showBusinessGuide: showGuide, closeGuide }
}

import { useEffect, useMemo, useState } from 'react'
import type { CampaignAudienceType } from '@app/lib/api/loyalty-api'
import { $api } from '@app/lib/api/$api'
import type { CampaignAudiencePreview } from './campaign-shared'

export function useCampaignAudiencePreview({
  socialAccountId,
  audienceType,
  audienceCriteria,
  audienceLimit,
  marketingTopic,
  previewEnabled,
}: {
  socialAccountId: string
  audienceType: CampaignAudienceType
  audienceCriteria: Record<string, unknown>
  audienceLimit: number | undefined
  marketingTopic: string
  previewEnabled: boolean
}) {
  const [previewData, setPreviewData] = useState<CampaignAudiencePreview | null>(null)
  const previewMutation = $api.useMutation(
    'post',
    '/loyalty/campaigns/account/{socialAccountId}/audience-preview',
  )
  const previewPayloadKey = useMemo(
    () => JSON.stringify({ audienceType, audienceCriteria, audienceLimit, marketingTopic }),
    [audienceCriteria, audienceLimit, audienceType, marketingTopic],
  )

  useEffect(() => {
    if (!previewEnabled) {
      setPreviewData(null)
      return
    }

    let cancelled = false
    previewMutation
      .mutateAsync({
        params: { path: { socialAccountId } },
        body: { audienceType, audienceCriteria, audienceLimit, marketingTopic },
      })
      .then((data) => {
        if (!cancelled) setPreviewData(data as unknown as CampaignAudiencePreview)
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null)
      })

    return () => {
      cancelled = true
    }
  }, [
    audienceCriteria,
    audienceLimit,
    audienceType,
    marketingTopic,
    previewEnabled,
    previewPayloadKey,
    socialAccountId,
  ])

  return { previewData, previewMutation }
}

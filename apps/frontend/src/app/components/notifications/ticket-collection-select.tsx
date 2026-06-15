import { useState } from 'react'
import { Select } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { catalogApi } from '@app/lib/api/agent-api'
import {
  useBulkUpdateNotificationPreferenceMutation,
  type NotificationType,
} from './notification-preferences-api'

interface TicketCollectionSelectProps {
  organisationId: string
  catalogId: string
  socialAccountId: string
  userIds: string[]
  type: NotificationType
  /** Current enabled state — persisted alongside the collections. */
  enabled: boolean
  /** The filter is only editable while the notification is enabled. */
  active?: boolean
  /** Currently selected collection ids (empty = all). */
  value: string[]
}

/**
 * Per-member collection filter for ticket notifications: pick the catalog
 * collections this member should be notified about (none = all). Persists on
 * blur so it doesn't fire a request per toggle.
 */
export function TicketCollectionSelect({
  organisationId,
  catalogId,
  socialAccountId,
  userIds,
  type,
  enabled,
  active = true,
  value,
}: TicketCollectionSelectProps) {
  const { t } = useTranslation()
  const [local, setLocal] = useState<string[]>(value)
  const mutation = useBulkUpdateNotificationPreferenceMutation(organisationId, userIds)

  const collectionsQuery = useQuery({
    queryKey: ['catalog-collections', catalogId],
    queryFn: () => catalogApi.listCollections(catalogId),
    staleTime: 5 * 60 * 1000,
  })

  const options = (collectionsQuery.data ?? []).map((c) => ({ label: c.name, value: c.id }))

  return (
    <Select
      className="notif-modal__collection-select"
      mode="multiple"
      size="small"
      placeholder={t('notifications.all_collections')}
      loading={collectionsQuery.isLoading}
      disabled={!active || mutation.isPending}
      options={options}
      value={local}
      maxTagCount="responsive"
      onChange={(next) => setLocal(next)}
      onBlur={() => {
        if (JSON.stringify([...local].sort()) !== JSON.stringify([...value].sort())) {
          mutation.mutate({ userIds, socialAccountId, type, enabled, collectionIds: local })
        }
      }}
    />
  )
}

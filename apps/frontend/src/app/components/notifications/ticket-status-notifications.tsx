import { useEffect, useState } from 'react'
import { Select, Switch } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { catalogApi } from '@app/lib/api/agent-api'
import {
  useBulkUpdateTicketStatusNotificationMutation,
  type NotifSocialAccount,
  type NotifTicketStatus,
  type TicketStatusNotificationRow,
} from './notification-preferences-api'

interface TicketStatusNotificationsProps {
  organisationId: string
  page: NotifSocialAccount
  /** Members the change applies to (mono-member in practice). */
  userIds: string[]
  statuses: NotifTicketStatus[]
  rows: TicketStatusNotificationRow[]
}

/**
 * Per-status ticket notifications (opt-in). Lists the org's ticket statuses;
 * each can be toggled on/off for the member and — when the account has a linked
 * catalog — filtered to specific product collections. Toggling persists
 * immediately; the collection filter persists on blur.
 */
export function TicketStatusNotifications({
  organisationId,
  page,
  userIds,
  statuses,
  rows,
}: TicketStatusNotificationsProps) {
  const { t } = useTranslation()

  const collectionsQuery = useQuery({
    queryKey: ['catalog-collections', page.catalogId],
    queryFn: () => catalogApi.listCollections(page.catalogId as string),
    enabled: !!page.catalogId,
    staleTime: 5 * 60 * 1000,
  })
  const collectionOptions = (collectionsQuery.data ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }))

  const primaryUser = userIds[0]
  const rowFor = (statusId: string) =>
    rows.find(
      (r) =>
        r.userId === primaryUser && r.socialAccountId === page.id && r.ticketStatusId === statusId,
    )

  return (
    <div className="notif-modal__statusgroup">
      <div className="notif-modal__statusgroup-head">
        {t('notifications.ticket_status_section')}
      </div>
      {statuses.map((status) => (
        <StatusRow
          key={status.id}
          organisationId={organisationId}
          socialAccountId={page.id}
          userIds={userIds}
          status={status}
          hasCatalog={!!page.catalogId}
          collectionOptions={collectionOptions}
          collectionsLoading={collectionsQuery.isLoading}
          row={rowFor(status.id)}
        />
      ))}
    </div>
  )
}

interface StatusRowProps {
  organisationId: string
  socialAccountId: string
  userIds: string[]
  status: NotifTicketStatus
  hasCatalog: boolean
  collectionOptions: { label: string; value: string }[]
  collectionsLoading: boolean
  row?: TicketStatusNotificationRow
}

function StatusRow({
  organisationId,
  socialAccountId,
  userIds,
  status,
  hasCatalog,
  collectionOptions,
  collectionsLoading,
  row,
}: StatusRowProps) {
  const { t } = useTranslation()
  const mutation = useBulkUpdateTicketStatusNotificationMutation(organisationId, userIds)

  const enabled = row?.enabled ?? false
  const persisted = row?.collectionIds ?? []
  const persistedKey = persisted.join(',')
  const [local, setLocal] = useState<string[]>(persisted)

  // Resync the collection filter if the persisted value changes elsewhere.
  // Depend on the stable string key so user edits aren't clobbered each render.
  useEffect(() => {
    setLocal(persistedKey === '' ? [] : persistedKey.split(','))
  }, [persistedKey])

  const save = (next: { enabled?: boolean; collectionIds?: string[] }) => {
    mutation.mutate({
      userIds,
      socialAccountId,
      ticketStatusId: status.id,
      enabled: next.enabled ?? enabled,
      collectionIds: next.collectionIds ?? local,
    })
  }

  return (
    <div className="notif-modal__statusrow">
      <span className="notif-modal__statusrow-label">
        <span className="notif-modal__statusdot" style={{ background: status.color }} />
        {status.name}
      </span>
      <div className="notif-modal__statusrow-controls">
        {hasCatalog && enabled && (
          <Select
            mode="multiple"
            size="small"
            style={{ minWidth: 150, maxWidth: 200 }}
            placeholder={t('notifications.all_collections')}
            loading={collectionsLoading}
            options={collectionOptions}
            value={local}
            maxTagCount="responsive"
            onChange={setLocal}
            onBlur={() => {
              if (JSON.stringify([...local].sort()) !== JSON.stringify([...persisted].sort())) {
                save({ collectionIds: local })
              }
            }}
          />
        )}
        <Switch
          size="small"
          checked={enabled}
          loading={mutation.isPending}
          onChange={(checked) => save({ enabled: checked })}
        />
      </div>
    </div>
  )
}

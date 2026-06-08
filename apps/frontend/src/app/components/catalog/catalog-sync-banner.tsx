import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from 'antd'
import { RefreshCw } from 'lucide-react'
import dayjs from 'dayjs'
import { catalogApi } from '@app/lib/api/agent-api'
import { writeCatalogMigrationDraft } from '@app/lib/catalog-migration-draft'
import { CommerceManagerMigrationModal } from './commerce-manager-migration-modal'

interface CatalogSyncBannerProps {
  orgSlug: string
  catalogId: string | null
}

/**
 * Gray banner shown above the products pagination footer for catalogues that
 * were fed by a WhatsApp number: "Products synced from <number> at <date>" +
 * a one-click re-sync. The re-sync re-runs the migration and shows its live
 * progress by reusing the wizard (resumed straight to the progress step via
 * the migration draft). On mobile the button label is hidden (icon only).
 */
export function CatalogSyncBanner({ orgSlug, catalogId }: CatalogSyncBannerProps) {
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)

  const lastSyncQuery = useQuery({
    queryKey: ['catalog-last-sync', catalogId],
    queryFn: () => catalogApi.getLastSync(catalogId as string),
    enabled: !!catalogId,
    staleTime: 60 * 1000,
  })
  const lastSync = lastSyncQuery.data

  const resync = useMutation({
    mutationFn: () =>
      catalogApi.startMigration({
        organisationId: orgSlug,
        catalogId: catalogId as string,
        sourcePhone: lastSync!.sourcePhone,
        sourceSocialAccountId: lastSync!.sourceSocialAccountId ?? undefined,
      }),
    onSuccess: (m) => {
      // Reuse the wizard's progress view by resuming straight to step 4.
      writeCatalogMigrationDraft({ open: true, step: 4, migrationId: m.id })
      setModalOpen(true)
    },
  })

  if (!catalogId || !lastSync) return null

  const date = lastSync.finishedAt ? dayjs(lastSync.finishedAt).format('DD MMM YYYY HH:mm') : ''

  return (
    <>
      <div className="catalog-sync-banner flex items-center gap-2 border-t border-border-subtle bg-bg-subtle px-4 py-2 text-[13px]">
        <span className="min-w-0 flex-1 truncate text-text-muted">
          {t('catalog.synced_from', { number: lastSync.sourcePhone, date })}
        </span>
        <Button
          size="small"
          icon={<RefreshCw size={14} />}
          loading={resync.isPending}
          onClick={() => resync.mutate()}
        >
          <span className="hidden sm:inline">{t('catalog.sync_now')}</span>
        </Button>
      </div>
      <CommerceManagerMigrationModal
        open={modalOpen}
        orgSlug={orgSlug}
        isResync
        onClose={() => {
          setModalOpen(false)
          void lastSyncQuery.refetch()
        }}
      />
    </>
  )
}

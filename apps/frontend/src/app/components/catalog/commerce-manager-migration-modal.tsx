import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Modal } from 'antd'
import { catalogApi, type CatalogMigration } from '@app/lib/api/agent-api'
import { $api } from '@app/lib/api/$api'
import { getSocket } from '@app/lib/socket'
import type {
  MigrationDoneEvent,
  MigrationProgressEvent,
  MigrationQueueEvent,
} from '@app/lib/socket'
import { buildFacebookOAuthUrl, setAuthRedirect } from '@app/lib/auth-redirect'
import {
  clearCatalogMigrationDraft,
  readCatalogMigrationDraft,
  writeCatalogMigrationDraft,
} from '@app/lib/catalog-migration-draft'
import { SupportModal } from '@app/components/support/support-modal'
import { Icon } from './commerce-manager-migration/icons'
import { Stepper } from './commerce-manager-migration/building-blocks'
import { IN_FLIGHT, isCommerceVertical, NS } from './commerce-manager-migration/shared'
import type { ScreenContext } from './commerce-manager-migration/shared'
import { buildSetupScreen } from './commerce-manager-migration/screens-setup'
import { buildProgressScreen } from './commerce-manager-migration/screens-progress'
import './commerce-manager-migration-modal.css'

/* ──────────────────────────── Modal ──────────────────────────── */

interface Props {
  open: boolean
  orgSlug: string
  onClose: () => void
  /** When opened from a specific WhatsApp number (e.g. the chat page), lock the
   * migration to that number and skip the number picker. */
  presetAccountId?: string
  /** When opened from the catalog resync banner, hide the "connect to number"
   * prompt on the success screen since the user is already on the catalog page. */
  isResync?: boolean
}

/**
 * Commerce Manager migration wizard — faithful implementation of the Bedones
 * design (5 steps in a modal) wired to the real backend: connect a catalogue
 * (Meta OAuth), import the products (queue + websocket progress), then link the
 * WhatsApp Business account to the new catalogue.
 */
export function CommerceManagerMigrationModal({
  open,
  orgSlug,
  onClose,
  presetAccountId,
  isResync,
}: Props) {
  const { t } = useTranslation()
  const tf = (key: string, opts?: Record<string, unknown>) => t(NS + key, opts)
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1) // 1..5
  const [phase, setPhase] = useState<string>('main')
  const [migrationId, setMigrationId] = useState<string>()
  const [collectionsCount, setCollectionsCount] = useState(0)
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(presetAccountId)
  // Step-2 catalogue choice (only relevant when the org already has catalogues).
  const [catalogChoice, setCatalogChoice] = useState<'connected' | 'new'>('connected')
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>()
  // True after coming back from the Meta connect redirect — used to validate the
  // freshly-connected catalogue's vertical.
  const [justConnected, setJustConnected] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)

  // ─── Data ───
  const catalogsQuery = useQuery({
    queryKey: ['catalogs', orgSlug],
    queryFn: () => catalogApi.list(orgSlug),
    enabled: open,
    staleTime: 60 * 1000,
  })
  const accountsQuery = $api.useQuery(
    'get',
    '/social/accounts/{organisationId}',
    { params: { path: { organisationId: orgSlug } } },
    { enabled: open },
  )

  const connectedCatalogs = useMemo(() => {
    const list = (catalogsQuery.data ?? []).filter((c) => !!c.providerId)
    return [...list].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  }, [catalogsQuery.data])
  const targetCatalog =
    connectedCatalogs.find((c) => c.id === selectedCatalogId) ?? connectedCatalogs[0]

  const whatsappAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.provider === 'WHATSAPP'),
    [accountsQuery.data],
  )
  const waAccount = whatsappAccounts.find((a) => a.id === selectedAccountId) ?? whatsappAccounts[0]
  const waNumber = waAccount?.username || waAccount?.providerAccountId || ''
  const sourcePhone = waNumber.replace(/\D/g, '')

  // Default the source-number selection to the first connected WhatsApp account.
  useEffect(() => {
    if (!selectedAccountId && whatsappAccounts.length > 0) {
      setSelectedAccountId(whatsappAccounts[0].id)
    }
  }, [selectedAccountId, whatsappAccounts])

  // When opened for a specific number, lock onto it.
  useEffect(() => {
    if (presetAccountId) setSelectedAccountId(presetAccountId)
  }, [presetAccountId])

  // Default the target catalogue to the most recently connected commerce
  // catalogue (only "commerce" can hold the imported products), falling back to
  // the most recent one when none qualifies.
  useEffect(() => {
    if (!selectedCatalogId && connectedCatalogs.length > 0) {
      const commerce = connectedCatalogs.find((c) => isCommerceVertical(c.vertical))
      setSelectedCatalogId((commerce ?? connectedCatalogs[0]).id)
    }
  }, [selectedCatalogId, connectedCatalogs])

  // ─── Resume after the connect redirect ───
  useEffect(() => {
    if (!open) return
    const draft = readCatalogMigrationDraft()
    if (draft.step != null) setStep(draft.step)
    if (draft.justConnected) setJustConnected(true)
    if (draft.migrationId) {
      setMigrationId(draft.migrationId)
      setStep(4)
    }
  }, [open])

  // After connecting on Meta, make sure at least one connected catalogue is a
  // "commerce" vertical — WhatsApp products can only be imported into those.
  // Otherwise we'd hit a "Wrong Catalog Vertical" error mid-import, so we surface
  // a clear, actionable message before the user starts the import.
  useEffect(() => {
    if (!open || !justConnected || step !== 3) return
    if (catalogsQuery.isLoading || connectedCatalogs.length === 0) return
    if (!connectedCatalogs.some((c) => isCommerceVertical(c.vertical))) {
      setPhase('wrong_vertical')
    }
  }, [open, justConnected, step, catalogsQuery.isLoading, connectedCatalogs])

  // ─── Live migration status (poll + websocket) ───
  const migrationQuery = useQuery({
    queryKey: ['catalog-migration', migrationId],
    queryFn: () => catalogApi.getMigration(migrationId as string),
    enabled: !!migrationId && step === 4,
    refetchInterval: (query) => {
      const status = (query.state.data as CatalogMigration | undefined)?.status
      return status && IN_FLIGHT.includes(status) ? 4000 : false
    },
  })
  const migration = migrationQuery.data

  useEffect(() => {
    if (step !== 4 || !migrationId) return
    const socket = getSocket(orgSlug)
    const key = ['catalog-migration', migrationId]
    const patch = (u: Partial<CatalogMigration>) =>
      queryClient.setQueryData<CatalogMigration>(key, (prev) => (prev ? { ...prev, ...u } : prev))

    const onQueue = (d: MigrationQueueEvent) => {
      if (d.migrationId === migrationId) patch({ position: d.position, etaMinutes: d.etaMinutes })
    }
    const onStarted = (d: { migrationId: string }) => {
      if (d.migrationId === migrationId) patch({ status: 'EXTRACTING' })
    }
    const onProgress = (d: MigrationProgressEvent) => {
      if (d.migrationId !== migrationId) return
      // Respect the phase: extraction (connector streaming products) vs import.
      patch({
        status: (d.status === 'EXTRACTING'
          ? 'EXTRACTING'
          : 'IMPORTING') as CatalogMigration['status'],
        importedProducts: d.imported,
        totalProducts: d.total,
      })
    }
    const onCompleted = (d: MigrationDoneEvent & { collections?: number }) => {
      if (d.migrationId !== migrationId) return
      patch({ status: 'COMPLETED', importedProducts: d.imported ?? 0, totalProducts: d.total ?? 0 })
      if (typeof d.collections === 'number') setCollectionsCount(d.collections)
      queryClient.invalidateQueries({ queryKey: ['catalogs', orgSlug] })
    }
    const onFailed = (d: MigrationDoneEvent) => {
      if (d.migrationId === migrationId)
        patch({ status: 'FAILED', error: d.error, errorCode: d.errorCode })
    }

    socket.on('catalog:migration-queue', onQueue)
    socket.on('catalog:migration-started', onStarted)
    socket.on('catalog:migration-progress', onProgress)
    socket.on('catalog:migration-completed', onCompleted)
    socket.on('catalog:migration-failed', onFailed)
    return () => {
      socket.off('catalog:migration-queue', onQueue)
      socket.off('catalog:migration-started', onStarted)
      socket.off('catalog:migration-progress', onProgress)
      socket.off('catalog:migration-completed', onCompleted)
      socket.off('catalog:migration-failed', onFailed)
    }
  }, [step, migrationId, orgSlug, queryClient])

  // Drive step-4 phase from the migration status.
  useEffect(() => {
    if (step !== 4) return
    if (migration?.status === 'COMPLETED') setPhase('result')
    else if (migration?.status === 'FAILED') setPhase('failed')
    else setPhase('progress')
  }, [step, migration?.status])

  const importProgress =
    migration?.status === 'EXTRACTING'
      ? 1
      : migration?.status === 'IMPORTING'
        ? 2
        : migration?.status === 'COMPLETED'
          ? 3
          : 0

  // ─── Mutations ───
  const startMutation = useMutation({
    mutationFn: () =>
      catalogApi.startMigration({
        organisationId: orgSlug,
        catalogId: targetCatalog!.id,
        sourcePhone,
        sourceSocialAccountId: waAccount?.id,
      }),
    onSuccess: (m) => {
      setMigrationId(m.id)
      queryClient.setQueryData(['catalog-migration', m.id], m)
      writeCatalogMigrationDraft({ open: true, step: 4, migrationId: m.id })
      setStep(4)
      setPhase('progress')
    },
  })

  const associateMutation = useMutation({
    mutationFn: () => {
      const phoneNumberId = waAccount?.providerAccountId
      if (!targetCatalog || !phoneNumberId) throw new Error('Numéro WhatsApp introuvable')
      return catalogApi.associatePhone(targetCatalog.id, phoneNumberId)
    },
  })

  // SMB (WhatsApp Business app) numbers are linked manually on the phone; this
  // records the link in our DB once the user confirms they've done it.
  const smbLinkMutation = useMutation({
    mutationFn: () => {
      const phoneNumberId = waAccount?.providerAccountId
      if (!targetCatalog || !phoneNumberId) throw new Error('Numéro WhatsApp introuvable')
      return catalogApi.linkSmbPhone(targetCatalog.id, phoneNumberId)
    },
  })

  // ─── Handlers ───
  const close = () => {
    const inFlight = migration ? IN_FLIGHT.includes(migration.status) : false
    if (!inFlight) {
      clearCatalogMigrationDraft()
      setJustConnected(false)
    }
    onClose()
  }

  // Before redirecting to Meta, remind the user that a brand-new catalogue must
  // use the "commerce" vertical — the only type that can hold WhatsApp products.
  const showConnectNotice = () => setPhase('connect_notice')

  // Always redirect to Meta to connect/create a brand-new catalogue. Reusing an
  // already-connected catalogue is handled by the step-2 radio (skips Meta).
  const connectCatalog = () => {
    setPhase('redirecting')
    writeCatalogMigrationDraft({ open: true, step: 3, justConnected: true })
    setAuthRedirect({
      intent: 'connect_pages',
      orgId: orgSlug,
      provider: 'facebook',
      pageId: 'catalog',
      scopes: ['catalog_management', 'commerce_account_manage_orders'],
    })
    const configId = import.meta.env.VITE_CATALOGUE_CONFIGGURATION_ID
    window.location.href = buildFacebookOAuthUrl(configId)
  }

  const connectAccount = async () => {
    const phoneNumberId = waAccount?.providerAccountId
    setStep(5)
    // SMB (WhatsApp Business app) numbers can't be linked through the Meta API,
    // so we guide the user to link it on their phone and confirm it ourselves.
    try {
      if (phoneNumberId) {
        const settings = await catalogApi.getWhatsappCommerceSettings(phoneNumberId)
        if (settings?.isSmb) {
          setPhase('smb_tutorial')
          return
        }
      }
    } catch {
      // ignore — fall back to the standard API association below
    }
    setPhase('linking')
    try {
      await associateMutation.mutateAsync()
      setPhase('linked')
    } catch {
      setPhase('manual')
    }
  }

  const smbDone = async () => {
    try {
      await smbLinkMutation.mutateAsync()
      setPhase('linked')
    } catch {
      // stay on the tutorial — the user can retry or report a problem
    }
  }

  const reportProblem = () => {
    const subject = encodeURIComponent('Bedones — problème de liaison du catalogue WhatsApp')
    window.location.href = `mailto:support@bedones.com?subject=${subject}`
  }

  // Pre-filled message for the "wrong catalog vertical" support request.
  const supportMessage = tf('support_vertical_message', {
    catalog: targetCatalog?.name ?? tf('your_catalog'),
    vertical: targetCatalog?.vertical || '—',
    number: waNumber || tf('your_number'),
  })
  const openSupport = () => setSupportOpen(true)

  const recheck = async () => {
    setPhase('checking')
    try {
      await associateMutation.mutateAsync()
      setPhase('linked')
    } catch {
      setPhase('stillfailed')
    }
  }

  // ─── Screen descriptor ───
  const total = 5

  const ctx: ScreenContext = {
    tf,
    step,
    phase,
    setStep,
    setPhase,
    setJustConnected,
    setMigrationId,
    collectionsCount,
    setCollectionsCount,
    connectedCatalogs,
    targetCatalog,
    selectedCatalogId,
    setSelectedCatalogId,
    catalogChoice,
    setCatalogChoice,
    whatsappAccounts,
    selectedAccountId,
    setSelectedAccountId,
    presetAccountId,
    isResync,
    waNumber,
    sourcePhone,
    migration,
    importProgress,
    startMutation: { isPending: startMutation.isPending, mutate: () => startMutation.mutate() },
    smbLinkMutation: { isPending: smbLinkMutation.isPending },
    close,
    showConnectNotice,
    connectCatalog,
    connectAccount,
    smbDone,
    reportProblem,
    openSupport,
    recheck,
  }

  const sc = step <= 3 ? buildSetupScreen(ctx) : buildProgressScreen(ctx)

  return (
    <>
      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        subject={tf('support_vertical_subject')}
        defaultMessage={supportMessage}
      />
      <Modal
        open={open}
        onCancel={close}
        footer={null}
        closable={false}
        width={552}
        centered
        className="cmm-modal"
        styles={{ body: { padding: 0 } }}
      >
        <div className={'cmm-root' + (sc.title ? '' : ' no-title')} role="dialog" aria-modal="true">
          <div className="mc-head">
            <div className="mc-head-tx">
              {sc.title && <div className="mc-title">{sc.title}</div>}
            </div>
            <button className="mc-close" aria-label={tf('close')} onClick={close}>
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="mc-bodyscroll" key={step + phase}>
            {sc.body}
          </div>

          <Stepper current={sc.current} total={total} />

          <div className="mc-foot">
            <div className="mc-foot-step">
              {sc.footStep || <span>{tf('step_of', { current: sc.current, total })}</span>}
            </div>
            <div className="mc-foot-actions">
              {sc.back && (
                <button className="mc-btn mc-btn-back" aria-label={tf('back')} onClick={sc.back}>
                  <Icon name="arrowLeft" size={16} />
                </button>
              )}
              {sc.primary && (
                <button
                  className="mc-btn mc-btn-primary"
                  disabled={sc.primary.disabled}
                  onClick={sc.primary.onClick}
                >
                  {sc.primary.label}
                  {sc.primary.icon && <Icon name={sc.primary.icon} size={16} />}
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}

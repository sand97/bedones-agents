import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Modal,
  Progress,
  Radio,
  Result,
  Select,
  Spin,
  Steps,
  Typography,
} from 'antd'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  PlusCircle,
  ShoppingBag,
  Smartphone,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { catalogApi, type CatalogMigration } from '@app/lib/api/agent-api'
import { $api } from '@app/lib/api/$api'
import { getSocket } from '@app/lib/socket'
import type {
  MigrationDoneEvent,
  MigrationProgressEvent,
  MigrationQueueEvent,
} from '@app/lib/socket'
import { buildFacebookOAuthUrl, setAuthRedirect } from '@app/lib/auth-redirect'
import { launchWhatsAppSignup } from '@app/lib/facebook-sdk'
import {
  clearCatalogMigrationDraft,
  readCatalogMigrationDraft,
  writeCatalogMigrationDraft,
} from '@app/lib/catalog-migration-draft'

const { Title, Paragraph, Text } = Typography

const COMMERCE_MANAGER_URL = 'https://business.facebook.com/commerce'

// Wizard steps
const STEP_INTRO = 0
const STEP_CREATE = 1
const STEP_CONNECT = 2
const STEP_NUMBER = 3
const STEP_MIGRATE = 4

const IN_FLIGHT: CatalogMigration['status'][] = ['QUEUED', 'EXTRACTING', 'IMPORTING']

interface Props {
  open: boolean
  orgSlug: string
  onClose: () => void
}

/**
 * Multi-step modal that walks a user from "what is a Commerce Manager
 * catalogue?" to importing the products of one of their WhatsApp numbers into
 * it. Opened from the catalogues page and the dashboard onboarding carousel.
 *
 * The flow survives the redirects it needs (Facebook OAuth to connect a
 * catalogue, embedded signup to add a number) via a localStorage draft, so the
 * user lands back in the modal at the next step.
 */
export function CommerceManagerMigrationModal({ open, orgSlug, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(STEP_INTRO)
  const [hasExisting, setHasExisting] = useState<'yes' | 'no' | 'unknown'>()
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>()
  const [selectedAccountId, setSelectedAccountId] = useState<string>()
  const [migrationId, setMigrationId] = useState<string>()
  const [connecting, setConnecting] = useState(false)

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

  const connectedCatalogs = useMemo(
    () => (catalogsQuery.data ?? []).filter((c) => !!c.providerId),
    [catalogsQuery.data],
  )
  const whatsappAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.provider === 'WHATSAPP'),
    [accountsQuery.data],
  )
  const newestConnected = useMemo(
    () => [...connectedCatalogs].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0],
    [connectedCatalogs],
  )

  // ─── Resume from a saved draft when the modal opens ───
  useEffect(() => {
    if (!open) return
    const draft = readCatalogMigrationDraft()
    if (draft.step != null) setStep(draft.step)
    if (draft.hasExistingCatalog) setHasExisting(draft.hasExistingCatalog)
    if (draft.catalogId) setSelectedCatalogId(draft.catalogId)
    if (draft.migrationId) setMigrationId(draft.migrationId)
  }, [open])

  // Persist the draft on every meaningful change so redirects can resume here.
  useEffect(() => {
    if (!open) return
    writeCatalogMigrationDraft({
      open: true,
      step,
      hasExistingCatalog: hasExisting,
      catalogId: selectedCatalogId,
      migrationId,
    })
  }, [open, step, hasExisting, selectedCatalogId, migrationId])

  // After connecting a catalogue (or when none is selected), default to the
  // most recently connected one — this is the one the user just connected.
  useEffect(() => {
    if (!open) return
    if (!selectedCatalogId && newestConnected) {
      setSelectedCatalogId(newestConnected.id)
    }
    const draft = readCatalogMigrationDraft()
    if (draft.justConnected && newestConnected) {
      writeCatalogMigrationDraft({ ...draft, justConnected: false, catalogId: newestConnected.id })
    }
  }, [open, selectedCatalogId, newestConnected])

  // Default the WhatsApp number selection to the first connected number.
  useEffect(() => {
    if (!selectedAccountId && whatsappAccounts.length > 0) {
      setSelectedAccountId(whatsappAccounts[0].id)
    }
  }, [selectedAccountId, whatsappAccounts])

  // ─── Live migration status (poll + websocket) ───
  const migrationQuery = useQuery({
    queryKey: ['catalog-migration', migrationId],
    queryFn: () => catalogApi.getMigration(migrationId as string),
    enabled: !!migrationId && step === STEP_MIGRATE,
    refetchInterval: (query) => {
      const status = (query.state.data as CatalogMigration | undefined)?.status
      return status && IN_FLIGHT.includes(status) ? 5000 : false
    },
  })
  const migration = migrationQuery.data

  useEffect(() => {
    if (step !== STEP_MIGRATE || !migrationId) return
    const socket = getSocket(orgSlug)
    const key = ['catalog-migration', migrationId]
    const patch = (updater: (prev?: CatalogMigration) => Partial<CatalogMigration>) =>
      queryClient.setQueryData<CatalogMigration>(key, (prev) =>
        prev ? { ...prev, ...updater(prev) } : prev,
      )

    const onQueue = (d: MigrationQueueEvent) => {
      if (d.migrationId !== migrationId) return
      patch(() => ({ position: d.position, etaMinutes: d.etaMinutes }))
    }
    const onStarted = (d: { migrationId: string }) => {
      if (d.migrationId !== migrationId) return
      patch(() => ({ status: 'EXTRACTING' }))
    }
    const onProgress = (d: MigrationProgressEvent) => {
      if (d.migrationId !== migrationId) return
      patch(() => ({
        status: 'IMPORTING',
        importedProducts: d.imported,
        failedProducts: d.failed,
        totalProducts: d.total,
      }))
    }
    const onCompleted = (d: MigrationDoneEvent) => {
      if (d.migrationId !== migrationId) return
      patch((prev) => ({
        status: 'COMPLETED',
        importedProducts: d.imported ?? prev?.importedProducts ?? 0,
        failedProducts: d.failed ?? prev?.failedProducts ?? 0,
        totalProducts: d.total ?? prev?.totalProducts ?? 0,
      }))
      queryClient.invalidateQueries({ queryKey: ['catalogs', orgSlug] })
    }
    const onFailed = (d: MigrationDoneEvent) => {
      if (d.migrationId !== migrationId) return
      patch(() => ({ status: 'FAILED', error: d.error }))
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

  // ─── Mutations ───
  const startMutation = useMutation({
    mutationFn: () => {
      const acct = whatsappAccounts.find((a) => a.id === selectedAccountId)
      const sourcePhone = (acct?.username || acct?.providerAccountId || '').replace(/\D/g, '')
      return catalogApi.startMigration({
        organisationId: orgSlug,
        catalogId: selectedCatalogId as string,
        sourcePhone,
        sourceSocialAccountId: selectedAccountId,
      })
    },
    onSuccess: (m) => {
      setMigrationId(m.id)
      queryClient.setQueryData(['catalog-migration', m.id], m)
      setStep(STEP_MIGRATE)
    },
  })

  const connectWhatsAppMutation = $api.useMutation('post', '/social/connect/whatsapp')

  // ─── Handlers ───
  const handleClose = () => {
    const inFlight = migration ? IN_FLIGHT.includes(migration.status) : false
    if (!inFlight) clearCatalogMigrationDraft()
    onClose()
  }

  const handleIntroNext = () => {
    setStep(hasExisting === 'yes' ? STEP_CONNECT : STEP_CREATE)
  }

  const handleConnectCatalog = () => {
    // Persist before the full-page OAuth redirect so we resume on the number step.
    writeCatalogMigrationDraft({
      open: true,
      step: STEP_NUMBER,
      hasExistingCatalog: hasExisting,
      justConnected: true,
    })
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

  const handleAddNumber = async () => {
    setConnecting(true)
    try {
      const appId = import.meta.env.VITE_FACEBOOK_APP_ID
      const waConfigId = import.meta.env.VITE_WHATSAPP_CONFIGGURATION_ID
      if (!appId || !waConfigId) return
      // Keep us on the number step even if the popup forces a reload.
      writeCatalogMigrationDraft({
        open: true,
        step: STEP_NUMBER,
        hasExistingCatalog: hasExisting,
        catalogId: selectedCatalogId,
      })
      const { loginResponse, sessionInfo } = await launchWhatsAppSignup(appId, waConfigId)
      if (!loginResponse.authResponse?.code) return
      await connectWhatsAppMutation.mutateAsync({
        body: {
          organisationId: orgSlug,
          code: loginResponse.authResponse.code,
          wabaId: sessionInfo.waba_id,
          phoneNumberId: sessionInfo.phone_number_id,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['get', '/social/accounts/{organisationId}'] })
    } catch (err) {
      console.error('[CatalogMigration] add WhatsApp number failed:', err)
    } finally {
      setConnecting(false)
    }
  }

  const handleViewCatalog = () => {
    clearCatalogMigrationDraft()
    onClose()
    navigate({
      to: '/app/$orgSlug/catalog',
      params: { orgSlug },
      search: {
        catalogId: selectedCatalogId,
        status: undefined,
        collection: undefined,
        page: undefined,
      },
    })
  }

  // ─── Derived UI state ───
  const indicatorCurrent =
    step <= STEP_CREATE ? 0 : step === STEP_CONNECT ? 1 : step === STEP_NUMBER ? 2 : 3

  const migrationStepCurrent =
    migration?.status === 'COMPLETED'
      ? 3
      : migration?.status === 'IMPORTING'
        ? 2
        : migration?.status === 'EXTRACTING'
          ? 1
          : 0

  const importPercent =
    migration && migration.totalProducts > 0
      ? Math.round((migration.importedProducts / migration.totalProducts) * 100)
      : 0

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <ShoppingBag size={18} /> {t('catalog_migration.title')}
        </span>
      }
      open={open}
      onCancel={handleClose}
      footer={null}
      width={640}
      destroyOnClose={false}
    >
      <div className="pt-2">
        <Steps
          size="small"
          current={indicatorCurrent}
          items={[
            { title: t('catalog_migration.step_catalog') },
            { title: t('catalog_migration.step_connect') },
            { title: t('catalog_migration.step_number') },
            { title: t('catalog_migration.step_migrate') },
          ]}
        />
      </div>

      <div className="mt-5 min-h-[260px]">
        {/* ── Step 0: intro + question ── */}
        {step === STEP_INTRO && (
          <div className="flex flex-col gap-3">
            <Title level={5} className="!mb-0">
              {t('catalog_migration.intro_title')}
            </Title>
            <Paragraph type="secondary" className="!mb-0">
              {t('catalog_migration.intro_desc')}
            </Paragraph>
            <Alert
              type="info"
              showIcon
              message={t('catalog_migration.intro_diff_title')}
              description={t('catalog_migration.intro_diff_desc')}
            />
            <Text>{t('catalog_migration.question')}</Text>
            <Radio.Group
              value={hasExisting}
              onChange={(e) => setHasExisting(e.target.value)}
              className="flex flex-col gap-2"
            >
              <Radio value="yes">{t('catalog_migration.answer_yes')}</Radio>
              <Radio value="no">{t('catalog_migration.answer_no')}</Radio>
              <Radio value="unknown">{t('catalog_migration.answer_unknown')}</Radio>
            </Radio.Group>
            {hasExisting === 'unknown' && (
              <Alert type="warning" showIcon message={t('catalog_migration.unknown_help')} />
            )}
          </div>
        )}

        {/* ── Step 1: create on Commerce Manager ── */}
        {step === STEP_CREATE && (
          <div className="flex flex-col gap-3">
            <Title level={5} className="!mb-0">
              {t('catalog_migration.create_title')}
            </Title>
            <Paragraph type="secondary" className="!mb-0">
              {t('catalog_migration.create_desc')}
            </Paragraph>
            <Button
              type="link"
              href={COMMERCE_MANAGER_URL}
              target="_blank"
              rel="noreferrer"
              icon={<ExternalLink size={14} />}
              className="!px-0 self-start"
            >
              {t('catalog_migration.create_link')}
            </Button>
          </div>
        )}

        {/* ── Step 2: connect a catalogue ── */}
        {step === STEP_CONNECT && (
          <div className="flex flex-col gap-3">
            <Title level={5} className="!mb-0">
              {t('catalog_migration.connect_title')}
            </Title>
            <Paragraph type="secondary" className="!mb-0">
              {t('catalog_migration.connect_desc')}
            </Paragraph>
            {connectedCatalogs.length > 0 ? (
              <>
                <Text className="text-xs text-text-muted">
                  {t('catalog_migration.connect_select_label')}
                </Text>
                <Select
                  value={selectedCatalogId}
                  onChange={setSelectedCatalogId}
                  placeholder={t('catalog_migration.connect_select_placeholder')}
                  options={connectedCatalogs.map((c) => ({ value: c.id, label: c.name }))}
                />
                <Button
                  type="link"
                  onClick={handleConnectCatalog}
                  icon={<ExternalLink size={14} />}
                  className="!px-0 self-start"
                >
                  {t('catalog_migration.connect_another')}
                </Button>
              </>
            ) : (
              <>
                <Alert type="info" showIcon message={t('catalog_migration.connect_none')} />
                <Button type="primary" onClick={handleConnectCatalog} className="self-start">
                  {t('catalog_migration.connect_btn')}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── Step 3: choose / add a WhatsApp number ── */}
        {step === STEP_NUMBER && (
          <div className="flex flex-col gap-3">
            <Title level={5} className="!mb-0">
              {t('catalog_migration.number_title')}
            </Title>
            <Paragraph type="secondary" className="!mb-0">
              {t('catalog_migration.number_desc')}
            </Paragraph>
            {whatsappAccounts.length > 0 ? (
              <>
                <Text className="text-xs text-text-muted">
                  {t('catalog_migration.number_select_label')}
                </Text>
                <Select
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                  placeholder={t('catalog_migration.number_select_placeholder')}
                  options={whatsappAccounts.map((a) => ({
                    value: a.id,
                    label: a.username || a.pageName || a.providerAccountId,
                  }))}
                />
                <Button
                  type="link"
                  onClick={handleAddNumber}
                  loading={connecting}
                  icon={<PlusCircle size={14} />}
                  className="!px-0 self-start"
                >
                  {t('catalog_migration.number_add')}
                </Button>
              </>
            ) : (
              <>
                <Alert type="info" showIcon message={t('catalog_migration.number_none')} />
                <Button
                  type="primary"
                  onClick={handleAddNumber}
                  loading={connecting}
                  icon={<Smartphone size={16} />}
                  className="self-start"
                >
                  {t('catalog_migration.number_add')}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── Step 4: migration progress ── */}
        {step === STEP_MIGRATE && (
          <div className="flex flex-col gap-4">
            {migration?.status === 'COMPLETED' ? (
              <Result
                status="success"
                title={t('catalog_migration.migrate_success_title')}
                subTitle={t('catalog_migration.migrate_success_desc', {
                  imported: migration.importedProducts,
                  total: migration.totalProducts,
                })}
                extra={
                  <Button type="primary" onClick={handleViewCatalog}>
                    {t('catalog_migration.migrate_view_catalog')}
                  </Button>
                }
              />
            ) : migration?.status === 'FAILED' ? (
              <>
                <Alert
                  type="error"
                  showIcon
                  message={t('catalog_migration.migrate_failed_title')}
                  description={migration.error || undefined}
                />
                <Button
                  type="primary"
                  loading={startMutation.isPending}
                  onClick={() => startMutation.mutate()}
                  className="self-start"
                >
                  {t('catalog_migration.migrate_retry')}
                </Button>
              </>
            ) : (
              <>
                <Alert type="info" showIcon message={t('catalog_migration.migrate_takes_time')} />
                <Steps
                  direction="vertical"
                  size="small"
                  current={migrationStepCurrent}
                  items={[
                    {
                      title: t('catalog_migration.migrate_queue'),
                      description:
                        migration?.status === 'QUEUED'
                          ? migration.etaMinutes > 0
                            ? t('catalog_migration.migrate_queue_eta', {
                                count: migration.etaMinutes,
                              })
                            : t('catalog_migration.migrate_queue_eta_now')
                          : undefined,
                    },
                    { title: t('catalog_migration.migrate_extracting') },
                    {
                      title: t('catalog_migration.migrate_importing'),
                      description:
                        migration?.status === 'IMPORTING'
                          ? t('catalog_migration.migrate_importing_count', {
                              imported: migration.importedProducts,
                              total: migration.totalProducts,
                            })
                          : undefined,
                    },
                    { title: t('catalog_migration.migrate_done') },
                  ]}
                />
                {migration?.status === 'IMPORTING' && <Progress percent={importPercent} />}
                {!migration && (
                  <div className="flex justify-center py-4">
                    <Spin />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Footer navigation ── */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div>
          {step > STEP_INTRO && step < STEP_MIGRATE && (
            <Button
              icon={<ArrowLeft size={14} />}
              onClick={() => setStep((s) => (s === STEP_CONNECT ? STEP_INTRO : s - 1))}
            >
              {t('common.previous')}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step === STEP_INTRO && (
            <Button
              type="primary"
              disabled={!hasExisting}
              iconPosition="end"
              icon={<ArrowRight size={14} />}
              onClick={handleIntroNext}
            >
              {t('common.next')}
            </Button>
          )}
          {step === STEP_CREATE && (
            <>
              <Button onClick={() => setStep(STEP_CONNECT)}>
                {t('catalog_migration.create_has_existing_btn')}
              </Button>
              <Button
                type="primary"
                iconPosition="end"
                icon={<ArrowRight size={14} />}
                onClick={() => setStep(STEP_CONNECT)}
              >
                {t('catalog_migration.create_done_btn')}
              </Button>
            </>
          )}
          {step === STEP_CONNECT && (
            <Button
              type="primary"
              disabled={!selectedCatalogId}
              iconPosition="end"
              icon={<ArrowRight size={14} />}
              onClick={() => setStep(STEP_NUMBER)}
            >
              {t('common.next')}
            </Button>
          )}
          {step === STEP_NUMBER && (
            <Button
              type="primary"
              disabled={!selectedCatalogId || !selectedAccountId}
              loading={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              {t('catalog_migration.number_start')}
            </Button>
          )}
          {step === STEP_MIGRATE && migration && !IN_FLIGHT.includes(migration.status) && (
            <Button onClick={handleClose}>{t('common.close')}</Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

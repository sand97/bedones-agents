import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { Modal, Select } from 'antd'
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
import './commerce-manager-migration-modal.css'

const NS = 'catalog_migration.flow.'

/* ──────────────────────────── Iconography ──────────────────────────── */

interface IcProps {
  size?: number
  sw?: number
  fill?: string
  children?: ReactNode
  style?: CSSProperties
}
function Ic({ size = 20, sw = 1.6, fill = 'none', children, style }: IcProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  sparkles: (p) => (
    <Ic {...p}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </Ic>
  ),
  ticket: (p) => (
    <Ic {...p}>
      <path d="M3 9a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 6 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-6z" />
      <path d="M13 7v10" strokeDasharray="1.5 2.5" />
    </Ic>
  ),
  promo: (p) => (
    <Ic {...p}>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </Ic>
  ),
  arrowRight: (p) => (
    <Ic {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Ic>
  ),
  arrowLeft: (p) => (
    <Ic {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Ic>
  ),
  check: (p) => (
    <Ic {...p}>
      <path d="M20 6L9 17l-5-5" />
    </Ic>
  ),
  alert: (p) => (
    <Ic {...p}>
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Ic>
  ),
  refresh: (p) => (
    <Ic {...p}>
      <path d="M21 12a9 9 0 11-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </Ic>
  ),
  external: (p) => (
    <Ic {...p}>
      <path d="M15 3h6v6M21 3l-9 9" />
      <path d="M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5" />
    </Ic>
  ),
  box: (p) => (
    <Ic {...p}>
      <path d="M21 8l-9-5-9 5M21 8v8l-9 5-9-5V8M21 8l-9 5-9-5M12 13v8" />
    </Ic>
  ),
  bag: (p) => (
    <Ic {...p}>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
    </Ic>
  ),
  x: (p) => (
    <Ic {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Ic>
  ),
  shield: (p) => (
    <Ic {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </Ic>
  ),
  layers: (p) => (
    <Ic {...p}>
      <path d="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />
    </Ic>
  ),
}

function Icon({ name, size }: { name: string; size?: number }) {
  const C = ICONS[name]
  return C ? <>{C({ size })}</> : null
}

const WA_GREEN = '#25d366'

function WhatsAppGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={WA_GREEN} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function CommerceGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#111b21"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5L5.4 5h13.2L20 9.5M4 9.5h16M4 9.5v9a1 1 0 001 1h14a1 1 0 001-1v-9" />
      <path d="M9 19.5v-5h6v5M7.5 9.5a1.8 1.8 0 01-3.5 0M11 9.5a1.8 1.8 0 01-3.5 0M14.5 9.5a1.8 1.8 0 01-3.5 0M18 9.5a1.8 1.8 0 01-3.5 0" />
    </svg>
  )
}

/* ──────────────────────────── Illustrations ──────────────────────────── */

function FlowNode({
  kind,
  label,
  sub,
  dim,
}: {
  kind: 'wa' | 'cm'
  label: string
  sub: string
  dim?: boolean
}) {
  return (
    <div className={'mc-node' + (dim ? ' is-dim' : '')}>
      <div className="mc-node-icon">
        {kind === 'wa' ? <WhatsAppGlyph size={26} /> : <CommerceGlyph size={26} />}
      </div>
      <div className="mc-node-label">{label}</div>
      <div className="mc-node-sub">{sub}</div>
    </div>
  )
}

function FlowDiagram() {
  const { t } = useTranslation()
  return (
    <div className="mc-flow">
      <FlowNode kind="wa" label={t(NS + 'wa_business')} sub={t(NS + 'wa_current')} dim />
      <div className="mc-flow-arrow">
        <span className="mc-flow-track" />
        <Icon name="arrowRight" size={18} />
      </div>
      <FlowNode kind="cm" label={t(NS + 'commerce_manager')} sub={t(NS + 'meta_official')} />
    </div>
  )
}

function TransferDiagram({ number, catalog }: { number: string; catalog: string }) {
  const { t } = useTranslation()
  const thumbs = Array.from({ length: 6 })
  return (
    <div className="mc-transfer">
      <div className="mc-tcard">
        <div className="mc-tcard-hd">
          <WhatsAppGlyph size={18} />
          <div className="mc-tcard-hd-tx">
            <div className="mc-tcard-t">{t(NS + 'wa_business')}</div>
            <div className="mc-tcard-num">{number}</div>
          </div>
        </div>
        <div className="mc-tcard-grid">
          {thumbs.map((_, i) => (
            <span key={i} className="mc-tthumb" />
          ))}
        </div>
        <div className="mc-tcard-ft">{t(NS + 'wa_catalog_label')}</div>
      </div>

      <div className="mc-transfer-arrow">
        <span className="mc-transfer-dot" />
        <span className="mc-transfer-dot d2" />
        <Icon name="arrowRight" size={18} />
      </div>

      <div className="mc-tcard is-dest">
        <div className="mc-tcard-hd">
          <CommerceGlyph size={18} />
          <div className="mc-tcard-hd-tx">
            <div className="mc-tcard-t">{t(NS + 'commerce_manager')}</div>
            <div className="mc-tcard-num">{catalog}</div>
          </div>
        </div>
        <div className="mc-tcard-grid">
          {thumbs.map((_, i) => (
            <span key={i} className="mc-tthumb ghost" />
          ))}
        </div>
        <div className="mc-tcard-ft">{t(NS + 'meta_official')}</div>
      </div>
    </div>
  )
}

function LinkVisual({ state }: { state: 'progress' | 'success' | 'fail' }) {
  return (
    <div className={'mc-linkviz is-' + state}>
      <div className="mc-linkviz-node">
        <WhatsAppGlyph size={24} />
      </div>
      <div className="mc-linkviz-spine">
        <span className="mc-linkviz-pulse" />
        <div className="mc-linkviz-badge">
          {state === 'progress' && <span className="mc-spin" />}
          {state === 'success' && <Icon name="check" size={16} />}
          {state === 'fail' && <Icon name="x" size={16} />}
        </div>
      </div>
      <div className="mc-linkviz-node">
        <CommerceGlyph size={24} />
      </div>
    </div>
  )
}

function BenefitCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: string
  title: string
  body: string
  tone?: string
}) {
  return (
    <div className="mc-benefit">
      <div className={'mc-benefit-ic' + (tone ? ' mc-tone-' + tone : '')}>
        <Icon name={icon} size={18} />
      </div>
      <div className="mc-benefit-tx">
        <div className="mc-benefit-t">{title}</div>
        <div className="mc-benefit-b">{body}</div>
      </div>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mc-note">
      <Icon name="shield" size={15} />
      <span>{children}</span>
    </div>
  )
}

function RadioCard({
  selected,
  onSelect,
  icon,
  title,
  body,
  children,
  tone,
}: {
  selected: boolean
  onSelect: () => void
  icon: string
  title: string
  body: string
  children?: ReactNode
  tone?: string
}) {
  return (
    <div
      className={'mc-optcard' + (selected ? ' is-selected' : '')}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="mc-optcard-row">
        <span className={'mc-radio' + (selected ? ' is-on' : '')} />
        <div className={'mc-choice-ic' + (tone ? ' mc-tone-' + tone : '')}>
          <Icon name={icon} size={18} />
        </div>
        <div className="mc-choice-tx">
          <div className="mc-choice-t">{title}</div>
          <div className="mc-choice-b">{body}</div>
        </div>
      </div>
      {children && (
        <div className="mc-optcard-extra" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  )
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div className="mc-stepper">
      <div className="sp-seg">
        {Array.from({ length: total }).map((_, i) => {
          const n = i + 1
          return <span key={n} className={n < current ? 'done' : n === current ? 'active' : ''} />
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────── Modal ──────────────────────────── */

const IN_FLIGHT: CatalogMigration['status'][] = ['QUEUED', 'EXTRACTING', 'IMPORTING']

interface Props {
  open: boolean
  orgSlug: string
  onClose: () => void
  /** When opened from a specific WhatsApp number (e.g. the chat page), lock the
   * migration to that number and skip the number picker. */
  presetAccountId?: string
}

/**
 * Commerce Manager migration wizard — faithful implementation of the Bedones
 * design (5 steps in a modal) wired to the real backend: connect a catalogue
 * (Meta OAuth), import the products (queue + websocket progress), then link the
 * WhatsApp Business account to the new catalogue.
 */
export function CommerceManagerMigrationModal({ open, orgSlug, onClose, presetAccountId }: Props) {
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

  // Default the target catalogue to the most recently connected one.
  useEffect(() => {
    if (!selectedCatalogId && connectedCatalogs.length > 0) {
      setSelectedCatalogId(connectedCatalogs[0].id)
    }
  }, [selectedCatalogId, connectedCatalogs])

  // ─── Resume after the connect redirect ───
  useEffect(() => {
    if (!open) return
    const draft = readCatalogMigrationDraft()
    if (draft.step != null) setStep(draft.step)
    if (draft.migrationId) {
      setMigrationId(draft.migrationId)
      setStep(4)
    }
  }, [open])

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
    if (!inFlight) clearCatalogMigrationDraft()
    onClose()
  }

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

  interface BtnCfg {
    label: string
    icon?: string | null
    disabled?: boolean
    onClick: () => void
  }
  interface Screen {
    title: string | null
    current: number
    body: ReactNode
    back?: () => void
    primary?: BtnCfg
    footStep?: ReactNode
  }

  function buildScreen(): Screen {
    if (step === 1) {
      return {
        title: tf('s1_title'),
        current: 1,
        body: (
          <div className="mc-step">
            <div className="mc-hero">
              <FlowDiagram />
            </div>
            <p className="mc-lede">
              <Trans i18nKey={NS + 's1_lede'} components={{ b: <strong /> }} />
            </p>
            <div className="mc-benefits">
              <BenefitCard
                icon="sparkles"
                tone="violet"
                title={tf('s1_b1_t')}
                body={tf('s1_b1_b')}
              />
              <BenefitCard icon="ticket" tone="blue" title={tf('s1_b2_t')} body={tf('s1_b2_b')} />
              <BenefitCard icon="promo" tone="pink" title={tf('s1_b3_t')} body={tf('s1_b3_b')} />
            </div>
            <Note>{tf('s1_note')}</Note>
          </div>
        ),
        primary: { label: tf('continue'), icon: 'arrowRight', onClick: () => setStep(2) },
      }
    }

    if (step === 2) {
      if (phase === 'redirecting') {
        return {
          title: null,
          current: 2,
          body: (
            <div className="mc-step mc-center">
              <span className="mc-spin xl" />
              <div className="mc-bigtitle">{tf('s2_redirect_title')}</div>
              <p className="mc-lede mc-center-tx">{tf('s2_redirect_lede')}</p>
            </div>
          ),
        }
      }
      // Org already has Commerce Manager catalogue(s): reuse one or connect/
      // create another. The footer button adapts to the chosen type.
      if (connectedCatalogs.length > 0) {
        const useConnected = catalogChoice === 'connected'
        return {
          title: tf('s2_choose_title'),
          current: 2,
          back: () => setStep(1),
          body: (
            <div className="mc-step">
              <p className="mc-lede">{tf('s2_choose_lede')}</p>
              <div className="mc-optcards">
                <RadioCard
                  selected={useConnected}
                  onSelect={() => setCatalogChoice('connected')}
                  icon="box"
                  tone="blue"
                  title={tf('s2_use_connected_t')}
                  body={tf('s2_use_connected_b')}
                >
                  {useConnected && (
                    <div className="mc-field">
                      <Select
                        size="large"
                        value={selectedCatalogId}
                        onChange={setSelectedCatalogId}
                        className="mc-field-select"
                        options={connectedCatalogs.map((c) => ({ value: c.id, label: c.name }))}
                      />
                    </div>
                  )}
                </RadioCard>
                <RadioCard
                  selected={!useConnected}
                  onSelect={() => setCatalogChoice('new')}
                  icon="layers"
                  tone="violet"
                  title={tf('s2_new_catalog_t')}
                  body={tf('s2_new_catalog_b')}
                />
              </div>
              <Note>{tf('s2_note')}</Note>
            </div>
          ),
          primary: useConnected
            ? {
                label: tf('continue'),
                icon: 'arrowRight',
                disabled: !targetCatalog,
                onClick: () => {
                  setPhase('main')
                  setStep(3)
                },
              }
            : { label: tf('connect_meta'), icon: 'external', onClick: connectCatalog },
        }
      }

      // No catalogue connected yet → explain the Meta redirect.
      return {
        title: tf('s2_title'),
        current: 2,
        back: () => setStep(1),
        body: (
          <div className="mc-step">
            <div className="mc-hero">
              <div className="mc-redirect-mark mc-tone-blue">
                <Icon name="external" size={30} />
              </div>
            </div>
            <p className="mc-lede">{tf('s2_lede')}</p>
            <div className="mc-choicelist">
              <div className="mc-choice">
                <div className="mc-choice-ic mc-tone-blue">
                  <Icon name="box" size={18} />
                </div>
                <div className="mc-choice-tx">
                  <div className="mc-choice-t">{tf('s2_choice1_t')}</div>
                  <div className="mc-choice-b">{tf('s2_choice1_b')}</div>
                </div>
              </div>
              <div className="mc-choice">
                <div className="mc-choice-ic mc-tone-violet">
                  <Icon name="layers" size={18} />
                </div>
                <div className="mc-choice-tx">
                  <div className="mc-choice-t">{tf('s2_choice2_t')}</div>
                  <div className="mc-choice-b">{tf('s2_choice2_b')}</div>
                </div>
              </div>
            </div>
            <Note>{tf('s2_note')}</Note>
          </div>
        ),
        primary: { label: tf('connect_meta'), icon: 'external', onClick: connectCatalog },
      }
    }

    if (step === 3) {
      const catalogName = targetCatalog?.name ?? tf('your_catalog')
      return {
        title: tf('s3_title'),
        current: 3,
        back: () => setStep(2),
        body: (
          <div className="mc-step">
            <TransferDiagram number={waNumber || tf('your_number')} catalog={catalogName} />
            {!presetAccountId && whatsappAccounts.length > 0 && (
              <div className="mc-field">
                <span className="mc-field-label">{tf('number_label')}</span>
                <Select
                  size="large"
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                  className="mc-field-select"
                  options={whatsappAccounts.map((a) => ({
                    value: a.id,
                    label: a.username || a.pageName || a.providerAccountId,
                  }))}
                />
              </div>
            )}
            <div className="mc-confirm-line">
              <span className="mc-confirm-check">
                <Icon name="check" size={12} />
              </span>
              <Trans
                i18nKey={NS + 's3_confirm'}
                values={{ name: catalogName }}
                components={{ b: <strong /> }}
              />
            </div>
            <p className="mc-lede">
              <Trans
                i18nKey={NS + 's3_lede'}
                values={{ number: waNumber }}
                components={{ b: <strong /> }}
              />
            </p>
            <button className="mc-textlink" onClick={() => setStep(2)}>
              {tf('s3_reconnect')}
            </button>
          </div>
        ),
        primary: {
          label: tf('start_import'),
          icon: 'arrowRight',
          disabled: !targetCatalog || !sourcePhone || startMutation.isPending,
          onClick: () => startMutation.mutate(),
        },
      }
    }

    if (step === 4) {
      if (phase === 'result') {
        const products = migration?.importedProducts ?? migration?.totalProducts ?? 0
        return {
          title: tf('s4_result_title'),
          current: 4,
          body: (
            <div className="mc-step">
              <div className="mc-stats">
                <div className="mc-stat">
                  <div className="mc-stat-ic mc-tone-violet">
                    <Icon name="layers" size={22} />
                  </div>
                  <div className="mc-stat-v">
                    <strong>{collectionsCount}</strong>{' '}
                    {tf('stat_collections', { count: collectionsCount })}
                  </div>
                </div>
                <div className="mc-stat">
                  <div className="mc-stat-ic mc-tone-emerald">
                    <Icon name="bag" size={22} />
                  </div>
                  <div className="mc-stat-v">
                    <strong>{products}</strong> {tf('stat_products', { count: products })}
                  </div>
                </div>
              </div>
              <div className="mc-ask">
                <div className="mc-ask-t">{tf('s4_done_t')}</div>
                <div className="mc-ask-b">{tf('s4_done_b', { number: waNumber })}</div>
                <button className="mc-textlink" onClick={connectAccount}>
                  {tf('s4_connect_native')}
                </button>
              </div>
            </div>
          ),
          primary: { label: tf('finish'), icon: 'check', onClick: close },
        }
      }
      if (phase === 'failed') {
        // A wrong catalog vertical can't be retried on the same catalog — send
        // the user back to pick another one (and clear the resume draft so a
        // reload doesn't drop them back onto this dead-end progress screen).
        const wrongVertical = migration?.errorCode === 'WRONG_CATALOG_VERTICAL'
        const chooseAnotherCatalog = () => {
          clearCatalogMigrationDraft()
          setMigrationId(undefined)
          setCollectionsCount(0)
          setPhase('main')
          setStep(2)
        }
        return {
          title: tf('s4_failed_title'),
          current: 4,
          body: (
            <div className="mc-step">
              <div className="mc-banner is-warn">
                <Icon name="alert" size={18} />
                <div>
                  <strong>{tf('s4_failed_msg')}</strong>{' '}
                  {wrongVertical ? tf('s4_failed_vertical') : tf('s4_failed_hint')}
                </div>
              </div>
            </div>
          ),
          primary: wrongVertical
            ? {
                label: tf('s4_choose_another'),
                icon: 'arrowRight',
                onClick: chooseAnotherCatalog,
              }
            : {
                label: tf('retry'),
                icon: 'refresh',
                disabled: startMutation.isPending,
                onClick: () => startMutation.mutate(),
              },
        }
      }
      const tasks = [tf('s4_task1'), tf('s4_task2'), tf('s4_task3')]
      return {
        title: null,
        current: 4,
        body: (
          <div className="mc-step mc-center">
            <LinkVisual state="progress" />
            <div className="mc-bigtitle">{tf('s4_progress_title')}</div>
            <ul className="mc-tasklist">
              {tasks.map((task, i) => {
                const st = i < importProgress ? 'done' : i === importProgress ? 'doing' : 'todo'
                return (
                  <li key={i} className={'mc-task is-' + st}>
                    <span className="mc-task-dot">
                      {st === 'done' && <Icon name="check" size={13} />}
                      {st === 'doing' && <span className="mc-spin sm" />}
                    </span>
                    {task}
                  </li>
                )
              })}
            </ul>
            {(migration?.totalProducts ?? 0) > 0 && (
              <p className="mc-caption mc-center-tx">
                {migration?.importedProducts ?? 0}/{migration?.totalProducts} ·{' '}
                {Math.round(
                  ((migration?.importedProducts ?? 0) / (migration?.totalProducts || 1)) * 100,
                )}
                %
              </p>
            )}
            <p className="mc-caption mc-center-tx">{tf('s4_caption')}</p>
          </div>
        ),
      }
    }

    // step 5 — connecting the WhatsApp account
    if (phase === 'linked') {
      const products = migration?.importedProducts ?? migration?.totalProducts ?? 0
      return {
        title: null,
        current: 5,
        footStep: (
          <span>
            <b>{tf('done')}</b>
          </span>
        ),
        body: (
          <div className="mc-step mc-center">
            <div className="mc-check64">
              <Icon name="check" size={34} />
            </div>
            <div className="mc-bigtitle">{tf('s5_linked_title')}</div>
            <p className="mc-lede mc-center-tx">{tf('s5_linked_lede', { count: products })}</p>
          </div>
        ),
        primary: { label: tf('finish'), icon: 'check', onClick: close },
      }
    }
    if (phase === 'linking') {
      return {
        title: null,
        current: 5,
        body: (
          <div className="mc-step mc-center">
            <LinkVisual state="progress" />
            <div className="mc-bigtitle">{tf('s5_linking_title')}</div>
            <p className="mc-lede mc-center-tx">{tf('s5_linking_lede', { number: waNumber })}</p>
          </div>
        ),
      }
    }
    if (phase === 'smb_tutorial') {
      const steps: [string, string][] = [
        [tf('smb_s1_t'), tf('smb_s1_b')],
        [tf('smb_s2_t'), tf('smb_s2_b')],
        [tf('smb_s3_t'), tf('smb_s3_b')],
        [tf('smb_s4_t'), tf('smb_s4_b')],
      ]
      return {
        title: tf('smb_title'),
        current: 5,
        back: () => {
          setStep(4)
          setPhase('result')
        },
        body: (
          <div className="mc-step pres-compact">
            <p className="mc-lede">{tf('smb_lede', { catalog: targetCatalog?.name ?? '' })}</p>
            <ol className="mc-manual">
              {steps.map(([title, body], i) => (
                <li key={i} className="mc-manual-item">
                  <span className="mc-manual-num">{i + 1}</span>
                  <div className="mc-manual-tx">
                    <div className="mc-manual-t">{title}</div>
                    <div className="mc-manual-b">{body}</div>
                  </div>
                </li>
              ))}
            </ol>
            <button className="mc-textlink" onClick={reportProblem}>
              {tf('smb_problem')}
            </button>
          </div>
        ),
        primary: {
          label: tf('smb_done'),
          icon: 'check',
          disabled: smbLinkMutation.isPending,
          onClick: smbDone,
        },
      }
    }
    // manual fallback
    const checking = phase === 'checking'
    const manual: [string, string][] = [
      [tf('s5_m1_t'), tf('s5_m1_b')],
      [tf('s5_m2_t'), tf('s5_m2_b')],
      [tf('s5_m3_t'), tf('s5_m3_b')],
      [tf('s5_m4_t'), tf('s5_m4_b')],
    ]
    return {
      title: tf('s5_manual_title'),
      current: 5,
      back: () => {
        setStep(4)
        setPhase('result')
      },
      body: (
        <div className="mc-step pres-compact">
          <p className="mc-lede">{tf('s5_manual_lede')}</p>
          <ol className="mc-manual">
            {manual.map(([title, body], i) => (
              <li key={i} className="mc-manual-item">
                <span className="mc-manual-num">{i + 1}</span>
                <div className="mc-manual-tx">
                  <div className="mc-manual-t">{title}</div>
                  <div className="mc-manual-b">{body}</div>
                </div>
              </li>
            ))}
          </ol>
          {phase === 'checking' && (
            <div className="mc-banner is-neutral">
              <span className="mc-spin sm" />
              <span>{tf('s5_checking')}</span>
            </div>
          )}
          {phase === 'stillfailed' && (
            <div className="mc-banner is-warn">
              <Icon name="alert" size={18} />
              <div>
                <strong>{tf('s5_stillfailed_t')}</strong> {tf('s5_stillfailed_b')}
              </div>
            </div>
          )}
        </div>
      ),
      primary: {
        label: checking ? tf('checking') : tf('recheck'),
        icon: checking ? null : 'refresh',
        disabled: checking,
        onClick: recheck,
      },
    }
  }

  const sc = buildScreen()

  return (
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
          <div className="mc-head-tx">{sc.title && <div className="mc-title">{sc.title}</div>}</div>
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
  )
}

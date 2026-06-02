import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import './commerce-manager-migration-modal.css'

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
  return (
    <div className="mc-flow">
      <FlowNode kind="wa" label="WhatsApp Business" sub="Catalogue actuel" dim />
      <div className="mc-flow-arrow">
        <span className="mc-flow-track" />
        <Icon name="arrowRight" size={18} />
      </div>
      <FlowNode kind="cm" label="Commerce Manager" sub="Catalogue officiel Meta" />
    </div>
  )
}

function TransferDiagram({ number, catalog }: { number: string; catalog: string }) {
  const thumbs = Array.from({ length: 6 })
  return (
    <div className="mc-transfer">
      <div className="mc-tcard">
        <div className="mc-tcard-hd">
          <WhatsAppGlyph size={18} />
          <div className="mc-tcard-hd-tx">
            <div className="mc-tcard-t">WhatsApp Business</div>
            <div className="mc-tcard-num">{number}</div>
          </div>
        </div>
        <div className="mc-tcard-grid">
          {thumbs.map((_, i) => (
            <span key={i} className="mc-tthumb" />
          ))}
        </div>
        <div className="mc-tcard-ft">Vos produits</div>
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
            <div className="mc-tcard-t">Commerce Manager</div>
            <div className="mc-tcard-num">{catalog}</div>
          </div>
        </div>
        <div className="mc-tcard-grid">
          {thumbs.map((_, i) => (
            <span key={i} className="mc-tthumb ghost" />
          ))}
        </div>
        <div className="mc-tcard-ft">Catalogue officiel Meta</div>
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

/* ──────────────────────────── Small blocks ──────────────────────────── */

function BenefitCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="mc-benefit">
      <div className="mc-benefit-ic">
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

const IMPORT_TASKS = [
  'Ouverture du catalogue WhatsApp',
  'Extraction des produits et des collections',
  'Stockage dans le catalogue Commerce Manager',
]

const MANUAL_STEPS: [string, string][] = [
  [
    'Ouvrez WhatsApp Business',
    'Sur votre téléphone, ou via Meta Business Suite, puis allez dans Paramètres.',
  ],
  ['Outils professionnels → Catalogue', 'Ouvrez la section Catalogue de votre compte.'],
  [
    'Sélectionnez votre catalogue Commerce Manager',
    'Choisissez votre nouveau catalogue dans la liste.',
  ],
  ['Enregistrez, puis revenez ici', 'Cliquez ensuite sur « Revérifier la liaison » ci-dessous.'],
]

/* ──────────────────────────── Stepper ──────────────────────────── */

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
}

/**
 * Commerce Manager migration wizard — faithful implementation of the Bedones
 * design (5 steps in a modal) wired to the real backend: connect a catalogue
 * (Meta OAuth), import the products (queue + websocket progress), then link the
 * WhatsApp Business account to the new catalogue.
 */
export function CommerceManagerMigrationModal({ open, orgSlug, onClose }: Props) {
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1) // 1..5
  const [phase, setPhase] = useState<string>('main')
  const [migrationId, setMigrationId] = useState<string>()
  const [collectionsCount, setCollectionsCount] = useState(0)

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

  const connectedCatalog = useMemo(() => {
    const list = (catalogsQuery.data ?? []).filter((c) => !!c.providerId)
    return [...list].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0]
  }, [catalogsQuery.data])

  const waAccount = useMemo(
    () => (accountsQuery.data ?? []).find((a) => a.provider === 'WHATSAPP'),
    [accountsQuery.data],
  )
  const waNumber = waAccount?.username || waAccount?.providerAccountId || ''
  const sourcePhone = waNumber.replace(/\D/g, '')

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
      if (d.migrationId === migrationId)
        patch({ status: 'IMPORTING', importedProducts: d.imported, totalProducts: d.total })
    }
    const onCompleted = (d: MigrationDoneEvent & { collections?: number }) => {
      if (d.migrationId !== migrationId) return
      patch({ status: 'COMPLETED', importedProducts: d.imported ?? 0, totalProducts: d.total ?? 0 })
      if (typeof d.collections === 'number') setCollectionsCount(d.collections)
      queryClient.invalidateQueries({ queryKey: ['catalogs', orgSlug] })
    }
    const onFailed = (d: MigrationDoneEvent) => {
      if (d.migrationId === migrationId) patch({ status: 'FAILED', error: d.error })
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
        catalogId: connectedCatalog!.id,
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
      if (!connectedCatalog || !phoneNumberId) throw new Error('Numéro WhatsApp introuvable')
      return catalogApi.associatePhone(connectedCatalog.id, phoneNumberId)
    },
  })

  // ─── Handlers ───
  const close = () => {
    const inFlight = migration ? IN_FLIGHT.includes(migration.status) : false
    if (!inFlight) clearCatalogMigrationDraft()
    onClose()
  }

  const connectCatalog = () => {
    // Already connected → skip Meta and go straight to the transfer step.
    if (connectedCatalog) {
      setStep(3)
      setPhase('main')
      return
    }
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
    setStep(5)
    setPhase('linking')
    try {
      await associateMutation.mutateAsync()
      setPhase('linked')
    } catch {
      setPhase('manual')
    }
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
  const sc = buildScreen()

  interface BtnCfg {
    label: string
    icon?: string | null
    variant?: 'primary' | 'ghost'
    disabled?: boolean
    onClick: () => void
  }
  interface Screen {
    title: string | null
    current: number
    body: ReactNode
    back?: () => void
    secondary?: BtnCfg
    primary?: BtnCfg
    footStep?: ReactNode
  }

  function buildScreen(): Screen {
    if (step === 1) {
      return {
        title: 'Un catalogue que vos outils peuvent enfin utiliser',
        current: 1,
        body: (
          <div className="mc-step">
            <div className="mc-hero">
              <FlowDiagram />
            </div>
            <p className="mc-lede">
              Aujourd'hui, vos produits vivent dans WhatsApp Business. En les déplaçant vers un
              catalogue <strong>Commerce Manager</strong> — le format officiel de Meta — ils
              deviennent exploitables par tout Bedones.
            </p>
            <div className="mc-benefits">
              <BenefitCard
                icon="sparkles"
                title="Votre agent IA répond avec vos produits"
                body="Prix, photos et descriptions sont utilisés automatiquement dans les conversations."
              />
              <BenefitCard
                icon="ticket"
                title="Des tickets reliés aux bons articles"
                body="Chaque commande se rattache aux produits concernés, sans saisie manuelle."
              />
              <BenefitCard
                icon="promo"
                title="Des promotions en quelques clics"
                body="Créez offres et réductions directement sur les articles de votre catalogue."
              />
            </div>
            <Note>Votre catalogue WhatsApp actuel n'est pas modifié ni supprimé.</Note>
          </div>
        ),
        primary: { label: 'Continuer', icon: 'arrowRight', onClick: () => setStep(2) },
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
              <div className="mc-bigtitle">Connexion à Meta…</div>
              <p className="mc-lede mc-center-tx">
                Nous ouvrons Meta pour connecter votre catalogue Commerce Manager. Ne fermez pas
                cette page.
              </p>
            </div>
          ),
        }
      }
      return {
        title: 'La connexion se fait du côté de Meta',
        current: 2,
        back: () => setStep(1),
        body: (
          <div className="mc-step">
            <div className="mc-hero">
              <div className="mc-redirect-mark">
                <Icon name="external" size={30} />
              </div>
            </div>
            <p className="mc-lede">
              Pour connecter votre catalogue, vous allez être redirigé vers Meta, en toute sécurité.
              C'est là que tout se passe — nous reprenons la main juste après.
            </p>
            <div className="mc-choicelist">
              <div className="mc-choice">
                <div className="mc-choice-ic">
                  <Icon name="box" size={18} />
                </div>
                <div className="mc-choice-tx">
                  <div className="mc-choice-t">Créer un nouveau catalogue</div>
                  <div className="mc-choice-b">Si vous partez de zéro côté Meta.</div>
                </div>
              </div>
              <div className="mc-choice">
                <div className="mc-choice-ic">
                  <Icon name="layers" size={18} />
                </div>
                <div className="mc-choice-tx">
                  <div className="mc-choice-t">Sélectionner un catalogue existant</div>
                  <div className="mc-choice-b">Si vous en avez déjà un dans Commerce Manager.</div>
                </div>
              </div>
            </div>
            <Note>Ces deux choix se font chez Meta. Vous revenez ici aussitôt.</Note>
          </div>
        ),
        primary: { label: 'Se connecter à Meta', icon: 'external', onClick: connectCatalog },
      }
    }

    if (step === 3) {
      const catalogName = connectedCatalog?.name ?? 'Votre catalogue Commerce Manager'
      return {
        title: 'Vos produits, prêts à être déplacés',
        current: 3,
        back: () => setStep(2),
        body: (
          <div className="mc-step">
            <TransferDiagram number={waNumber || 'Votre numéro WhatsApp'} catalog={catalogName} />
            <div className="mc-confirm-line">
              <span className="mc-confirm-check">
                <Icon name="check" size={12} />
              </span>
              Connecté à <strong>{catalogName}</strong>
            </div>
            <p className="mc-lede">
              Lancez l'import pour déplacer les produits de votre numéro WhatsApp Business
              <strong> {waNumber}</strong> vers ce catalogue Commerce Manager.
            </p>
            <button className="mc-textlink" onClick={() => setStep(2)}>
              Ce n'est pas le bon catalogue ? Se reconnecter
            </button>
          </div>
        ),
        primary: {
          label: 'Démarrer l’importation',
          icon: 'arrowRight',
          disabled: !connectedCatalog || !sourcePhone || startMutation.isPending,
          onClick: () => startMutation.mutate(),
        },
      }
    }

    if (step === 4) {
      if (phase === 'result') {
        const products = migration?.importedProducts ?? migration?.totalProducts ?? 0
        return {
          title: 'Vos produits sont dans Commerce Manager',
          current: 4,
          body: (
            <div className="mc-step">
              <div className="mc-stats">
                <div className="mc-stat">
                  <div className="mc-stat-ic">
                    <Icon name="layers" size={22} />
                  </div>
                  <div className="mc-stat-v">
                    <strong>{collectionsCount}</strong> collections
                  </div>
                </div>
                <div className="mc-stat">
                  <div className="mc-stat-ic">
                    <Icon name="bag" size={22} />
                  </div>
                  <div className="mc-stat-v">
                    <strong>{products}</strong> produits
                  </div>
                </div>
              </div>
              <div className="mc-ask">
                <div className="mc-ask-t">Connecter votre compte WhatsApp Business&nbsp;?</div>
                <div className="mc-ask-b">
                  Reliez votre numéro {waNumber} à ce nouveau catalogue Commerce Manager pour que
                  l'agent IA, les tickets et les promotions s'appuient dessus.
                </div>
              </div>
            </div>
          ),
          primary: {
            label: 'Connecter mon compte WhatsApp',
            icon: 'arrowRight',
            onClick: connectAccount,
          },
        }
      }
      if (phase === 'failed') {
        return {
          title: 'L’import a rencontré un problème',
          current: 4,
          body: (
            <div className="mc-step">
              <div className="mc-banner is-warn">
                <Icon name="alert" size={18} />
                <div>
                  <strong>L'import n'a pas abouti.</strong> {migration?.error || ''}
                </div>
              </div>
            </div>
          ),
          primary: {
            label: 'Réessayer',
            icon: 'refresh',
            disabled: startMutation.isPending,
            onClick: () => startMutation.mutate(),
          },
        }
      }
      // progress
      return {
        title: null,
        current: 4,
        body: (
          <div className="mc-step mc-center">
            <LinkVisual state="progress" />
            <div className="mc-bigtitle">Import de vos produits en cours</div>
            <ul className="mc-tasklist">
              {IMPORT_TASKS.map((task, i) => {
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
            <p className="mc-caption mc-center-tx">
              Inutile d'attendre ici — nous vous préviendrons une fois l'import terminé.
            </p>
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
            <b>Parcours terminé</b>
          </span>
        ),
        body: (
          <div className="mc-step mc-center">
            <div className="mc-check64">
              <Icon name="check" size={34} />
            </div>
            <div className="mc-bigtitle">
              Votre compte WhatsApp est lié au catalogue Commerce Manager
            </div>
            <p className="mc-lede mc-center-tx">
              Tout est en place. Vos {products} produits sont désormais disponibles pour l'agent IA,
              les tickets et les promotions.
            </p>
          </div>
        ),
        primary: { label: 'Terminer', icon: 'check', onClick: close },
      }
    }
    if (phase === 'linking') {
      return {
        title: null,
        current: 5,
        body: (
          <div className="mc-step mc-center">
            <LinkVisual state="progress" />
            <div className="mc-bigtitle">Connexion de votre compte WhatsApp</div>
            <p className="mc-lede mc-center-tx">
              Nous relions votre numéro {waNumber} à votre catalogue Commerce Manager. Cela prend
              quelques secondes.
            </p>
          </div>
        ),
      }
    }
    // manual fallback
    const checking = phase === 'checking'
    return {
      title: 'Connectez votre compte vous-même',
      current: 5,
      back: () => {
        setStep(4)
        setPhase('result')
      },
      body: (
        <div className="mc-step pres-compact">
          <p className="mc-lede">
            La connexion automatique n'a pas abouti. Reliez votre compte vous-même en suivant ces
            étapes, puis revérifiez — nous vous dirons si c'est bon.
          </p>
          <ol className="mc-manual">
            {MANUAL_STEPS.map(([title, body], i) => (
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
              <span>Vérification de la liaison…</span>
            </div>
          )}
          {phase === 'stillfailed' && (
            <div className="mc-banner is-warn">
              <Icon name="alert" size={18} />
              <div>
                <strong>Toujours pas liée.</strong> Reprenez les étapes ci-dessus, ou contactez le
                support.
              </div>
            </div>
          )}
        </div>
      ),
      primary: {
        label: checking ? 'Vérification…' : 'Revérifier la liaison',
        icon: checking ? null : 'refresh',
        disabled: checking,
        onClick: recheck,
      },
    }
  }

  const Btn = ({ cfg, primary }: { cfg?: BtnCfg; primary?: boolean }) => {
    if (!cfg) return null
    const cls = primary ? 'mc-btn mc-btn-primary' : 'mc-btn mc-btn-ghost'
    return (
      <button className={cls} disabled={cfg.disabled} onClick={cfg.onClick}>
        {cfg.label}
        {cfg.icon && <Icon name={cfg.icon} size={16} />}
      </button>
    )
  }

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
      destroyOnClose={false}
    >
      <div className={'cmm-root' + (sc.title ? '' : ' no-title')} role="dialog" aria-modal="true">
        <div className="mc-head">
          <div className="mc-head-tx">{sc.title && <div className="mc-title">{sc.title}</div>}</div>
          <button className="mc-close" aria-label="Fermer" onClick={close}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="mc-bodyscroll" key={step + phase}>
          {sc.body}
        </div>

        <Stepper current={sc.current} total={total} />

        <div className="mc-foot">
          <div className="mc-foot-step">
            {sc.footStep || (
              <span>
                Étape <b>{sc.current}</b> sur {total}
              </span>
            )}
          </div>
          <div className="mc-foot-actions">
            {sc.back && (
              <button className="mc-btn mc-btn-back" aria-label="Précédent" onClick={sc.back}>
                <Icon name="arrowLeft" size={16} />
              </button>
            )}
            <Btn cfg={sc.secondary} />
            <Btn cfg={sc.primary} primary />
          </div>
        </div>
      </div>
    </Modal>
  )
}

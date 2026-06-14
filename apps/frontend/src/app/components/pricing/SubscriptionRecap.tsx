import { $api } from '@app/lib/api/$api'
import { Button } from 'antd'
import type { ReactNode } from 'react'
import {
  PLAN_CONTENT,
  formatDisplayPrice,
  getPlanLabel,
  getTotalPrice,
  type BillingDuration,
} from './constants'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-moderator.bedones.local'

type PlanKey = 'free' | 'pro' | 'business'

interface PaymentRow {
  id: string
  kind: string
  status: string
  amount: number
  currency: string
  creditsPurchased: number | null
  description: string | null
  provider: string
  cardBrand: string | null
  cardLast4: string | null
  mobileNumber: string | null
  createdAt: string
}

const PLAN_TAGLINE: Record<PlanKey, string> = {
  free: 'Modération IA pour démarrer, sans engagement.',
  pro: 'Modération IA illimitée, gestion WhatsApp Business et support prioritaire pour les équipes en croissance.',
  business:
    'Le maximum de puissance IA, statistiques avancées et automatisations pour les équipes établies.',
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  COMPLETED: { label: 'Payé', color: '#111b21', bg: '#f5f5f5', dot: '#22c55e' },
  PENDING: { label: 'En attente', color: '#494949', bg: '#f5f5f5', dot: '#f59e0b' },
  FAILED: { label: 'Échoué', color: '#ef4444', bg: '#fef2f2', dot: '#ef4444' },
  REFUNDED: { label: 'Remboursé', color: '#8c8c8c', bg: '#f5f5f5', dot: '#bfbfbf' },
}

const BRAND_COLOR: Record<string, string> = {
  visa: '#1a1f71',
  mastercard: '#eb001b',
  amex: '#2e77bc',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
function fmtAmount(amount: number, currency: string): string {
  const v = amount.toFixed(2)
  return currency === 'USD' ? `$${v}` : `${v} ${currency}`
}
function last4(num: string): string {
  return num.replace(/\D/g, '').slice(-4)
}

// ── Icônes ──
function CardMark({ color }: { color: string }) {
  return (
    <svg
      width="19"
      height="13"
      viewBox="0 0 24 17"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="1" width="22" height="15" rx="2.5" />
      <path d="M1 6h22" />
      <path d="M5 11h3" />
    </svg>
  )
}
function MobileMark({ color }: { color: string }) {
  return (
    <svg
      width="12"
      height="16"
      viewBox="0 0 16 22"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="1" width="14" height="20" rx="3" />
      <path d="M6.5 17.5h3" />
    </svg>
  )
}
function RowIcon({ kind }: { kind: string }) {
  if (kind === 'CREDIT_PURCHASE') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    )
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  )
}
const DownloadIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
)

function methodOf(p: PaymentRow): { mark: ReactNode; label: string } {
  if (p.cardLast4) {
    const brand = (p.cardBrand ?? 'carte').toLowerCase()
    const label = `${brand.charAt(0).toUpperCase()}${brand.slice(1)} ···· ${p.cardLast4}`
    return { mark: <CardMark color={BRAND_COLOR[brand] ?? '#494949'} />, label }
  }
  if (p.mobileNumber) {
    return {
      mark: <MobileMark color="#494949" />,
      label: `Mobile Money ···· ${last4(p.mobileNumber)}`,
    }
  }
  return p.provider === 'NOTCHPAY'
    ? { mark: <MobileMark color="#494949" />, label: 'Mobile Money' }
    : { mark: <CardMark color="#494949" />, label: 'Carte' }
}

interface SubscriptionRecapProps {
  organisationId: string
  onShowFeatures: () => void
  onBuyCredits: () => void
}

export function SubscriptionRecap({
  organisationId,
  onShowFeatures,
  onBuyCredits,
}: SubscriptionRecapProps) {
  const subscriptionQuery = $api.useQuery('get', '/payment/org/{organisationId}/subscription', {
    params: { path: { organisationId } },
  })
  const creditsQuery = $api.useQuery('get', '/stats/org/{organisationId}/credits', {
    params: { path: { organisationId } },
  })
  const paymentsQuery = $api.useQuery('get', '/payment/org/{organisationId}/payments', {
    params: { path: { organisationId } },
  })

  const sub = subscriptionQuery.data
  const plan = (sub?.plan ?? 'free') as PlanKey
  const planConfig = PLAN_CONTENT[plan]
  const billingMonths = (sub?.billingMonths ?? 1) as BillingDuration
  const monthlyPrice = planConfig.monthlyPrice
  const periodPrice = getTotalPrice(monthlyPrice, billingMonths)

  const total = creditsQuery.data?.total ?? sub?.totalCredits ?? 0
  const used = creditsQuery.data?.used ?? 0
  const remaining = Math.max(0, total - used)
  const remainingPct = total > 0 ? Math.round((remaining / total) * 100) : 0

  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null
  const daysLeft = periodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000))
    : null

  const payments = (paymentsQuery.data as PaymentRow[] | undefined) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="sub-grid">
        {/* ── Carte formule (sombre) ── */}
        <div className="sub-plan-card">
          <div className="flex items-center justify-between">
            <span className="sub-eyebrow">Formule actuelle</span>
            <span className="sub-badge">
              <span className="sub-dot" />
              {sub?.status === 'ACTIVE' ? 'Active' : (sub?.status ?? 'Inactive')}
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-2.5">
            <span className="sub-plan-name">{getPlanLabel(plan)}</span>
            <span className="sub-plan-price">{formatDisplayPrice(monthlyPrice)} / mois</span>
          </div>
          <p className="sub-plan-desc mt-2">{PLAN_TAGLINE[plan]}</p>

          <div className="mt-5 flex gap-2.5">
            <Button className="sub-btn-light flex-1" onClick={onShowFeatures}>
              Voir les fonctionnalités →
            </Button>
            <Button className="sub-btn-ghost" onClick={onShowFeatures}>
              Changer
            </Button>
          </div>

          {periodEnd ? (
            <div className="sub-foot mt-auto">
              <div className="sub-foot-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="sub-foot-label">
                  {sub?.cancelAtPeriodEnd ? 'Se termine' : 'Prochaine échéance'}
                  {daysLeft != null ? ` · dans ${daysLeft} jours` : ''}
                </div>
                <div className="sub-foot-value">
                  {fmtDate(sub!.currentPeriodEnd!)} · {formatDisplayPrice(periodPrice)}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Carte crédits ── */}
        <div className="sub-card">
          <span className="sub-eyebrow">Crédits IA restants</span>
          <div className="mt-3.5 flex items-baseline gap-2">
            <span className="sub-credits-num">{remaining.toLocaleString('fr-FR')}</span>
            <span className="text-sm text-text-soft">crédits</span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-text-soft">
            sur {total.toLocaleString('fr-FR')} ce mois
            {periodEnd ? ` · renouvelés le ${fmtDate(sub!.currentPeriodEnd!)}` : ''}
          </div>

          <div className="sub-bar mt-4.5" style={{ marginTop: 18 }}>
            <div className="sub-bar-fill" style={{ width: `${remainingPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-text-soft">
            <span>{used.toLocaleString('fr-FR')} utilisés</span>
            <span className="sub-mono">{remainingPct} %</span>
          </div>

          <Button
            type="primary"
            className="mt-auto"
            style={{ height: 42, borderRadius: 10 }}
            block
            onClick={onBuyCredits}
          >
            + Ajouter des crédits
          </Button>
          <p className="mt-2.5 text-center text-xs text-text-soft">
            Les crédits ajoutés n'expirent pas.
          </p>
        </div>
      </div>

      {/* ── Historique des paiements ── */}
      <div className="sub-history">
        <div className="px-[22px] pb-4 pt-5">
          <h2 className="text-base font-semibold">Historique des paiements</h2>
          <p className="mt-0.5 text-[12.5px] text-text-soft">
            Vos transactions Mobile Money et factures.
          </p>
        </div>

        {/* Desktop : tableau */}
        <div className="sub-pay-desktop">
          <div className="sub-pay-cols sub-pay-head">
            <span>Date</span>
            <span>Description</span>
            <span>Méthode</span>
            <span className="text-right">Montant</span>
            <span className="text-center">Statut</span>
            <span className="text-right">Facture</span>
          </div>
          {payments.map((p) => {
            const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.PENDING
            const m = methodOf(p)
            return (
              <div key={p.id} className="sub-pay-cols sub-pay-row">
                <span className="sub-mono text-[13px] text-text-secondary">
                  {fmtDate(p.createdAt)}
                </span>
                <div className="flex min-w-0 items-center gap-[11px]">
                  <div className="sub-icon-box">
                    <RowIcon kind={p.kind} />
                  </div>
                  <span className="truncate text-[13.5px] font-medium">
                    {p.description ??
                      (p.kind === 'SUBSCRIPTION' ? 'Abonnement' : 'Achat de crédits')}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {m.mark}
                  <span className="truncate text-[13px] text-text-secondary">{m.label}</span>
                </div>
                <span className="sub-mono text-right text-[13.5px] font-medium">
                  {fmtAmount(p.amount, p.currency)}
                </span>
                <div className="flex justify-center">
                  <span className="sub-status" style={{ background: st.bg, color: st.color }}>
                    <span className="sub-status-dot" style={{ background: st.dot }} />
                    {st.label}
                  </span>
                </div>
                <div className="flex justify-end">
                  {p.status === 'COMPLETED' ? (
                    <Button
                      className="sub-dl"
                      icon={DownloadIcon}
                      href={`${API_URL}/payment/org/${organisationId}/payments/${p.id}/invoice`}
                      target="_blank"
                      rel="noreferrer"
                      title="Télécharger la facture"
                    />
                  ) : (
                    <span className="text-text-soft">—</span>
                  )}
                </div>
              </div>
            )
          })}
          {payments.length === 0 ? (
            <div className="px-[22px] py-8 text-center text-sm text-text-soft">Aucun paiement</div>
          ) : null}
        </div>

        {/* Mobile : cartes */}
        <div className="sub-pay-mobile">
          {payments.map((p) => {
            const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.PENDING
            const m = methodOf(p)
            return (
              <div key={p.id} className="sub-pay-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-[11px]">
                    <div className="sub-icon-box">
                      <RowIcon kind={p.kind} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {p.description ??
                          (p.kind === 'SUBSCRIPTION' ? 'Abonnement' : 'Achat de crédits')}
                      </div>
                      <div className="sub-mono mt-0.5 text-xs text-text-soft">
                        {fmtDate(p.createdAt)}
                      </div>
                    </div>
                  </div>
                  <span className="sub-mono whitespace-nowrap text-sm font-semibold">
                    {fmtAmount(p.amount, p.currency)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2.5 border-t border-[#f5f5f5] pt-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {m.mark}
                    <span className="truncate text-[13px] text-text-secondary">{m.label}</span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2.5">
                    <span className="sub-status" style={{ background: st.bg, color: st.color }}>
                      <span className="sub-status-dot" style={{ background: st.dot }} />
                      {st.label}
                    </span>
                    {p.status === 'COMPLETED' ? (
                      <Button
                        className="sub-dl"
                        icon={DownloadIcon}
                        href={`${API_URL}/payment/org/${organisationId}/payments/${p.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                        title="Télécharger la facture"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
          {payments.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-soft">Aucun paiement</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
